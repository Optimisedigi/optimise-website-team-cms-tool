/**
 * Tool: propose_keywords_add
 *
 * Queues "bulk-add these positive keywords to an existing ad group" for human
 * approval. On Apply, the dispatcher calls Growth Tools
 * `POST /api/google-ads/ad-groups/[id]/keywords/add` against the linked
 * customer ID. Each keyword ships PAUSED. Duplicates (same text + matchType)
 * are skipped server-side.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal, buildInternalMarkdown, mdTable } from "./_propose-helpers";

type MatchType = "exact" | "phrase" | "broad";

interface KeywordIn {
  text: string;
  matchType: MatchType;
  cpcBidMicros?: number;
}

interface ProposeKeywordsAddArgs {
  adGroupId: string;
  adGroupName: string;
  campaignName?: string;
  keywords: KeywordIn[];
  summary: string;
  supportingNumbers?: string[];
}

const VALID_MATCH_TYPES: ReadonlySet<MatchType> = new Set(["exact", "phrase", "broad"]);

export const proposeKeywordsAdd: CanonicalTool<ProposeKeywordsAddArgs> = {
  name: "propose_keywords_add",
  description:
    "Bulk-add positive keywords to an existing ad group, PAUSED. Each keyword needs text + matchType (exact/phrase/broad), optional cpcBidMicros. Duplicates are skipped server-side. Use when the user wants to extend an existing working ad group with new keywords without rebuilding it.",
  inputSchema: {
    type: "object",
    properties: {
      adGroupId: { type: "string", minLength: 1 },
      adGroupName: { type: "string", minLength: 1 },
      campaignName: { type: "string" },
      keywords: {
        type: "array",
        minItems: 1,
        maxItems: 200,
        items: {
          type: "object",
          properties: {
            text: { type: "string", minLength: 1, maxLength: 80 },
            matchType: { type: "string", enum: ["exact", "phrase", "broad"] },
            cpcBidMicros: { type: "number", minimum: 0 },
          },
          required: ["text", "matchType"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["adGroupId", "adGroupName", "keywords", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const adGroupId = String(obj.adGroupId ?? "").trim();
    if (!adGroupId) throw new Error("adGroupId is required");
    const adGroupName = String(obj.adGroupName ?? "").trim();
    if (!adGroupName) throw new Error("adGroupName is required");

    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    if (summary.length > 800) throw new Error("summary must be ≤ 800 characters");

    const rawKeywords = Array.isArray(obj.keywords) ? obj.keywords : [];
    if (rawKeywords.length === 0) throw new Error("keywords array required");
    if (rawKeywords.length > 200) throw new Error("keywords cannot exceed 200 entries");

    const keywords: KeywordIn[] = rawKeywords.map((k, i) => {
      if (!k || typeof k !== "object") throw new Error(`keywords[${i}] not an object`);
      const ko = k as Record<string, unknown>;
      const text = String(ko.text ?? "").trim();
      if (!text) throw new Error(`keywords[${i}] missing text`);
      if (text.length > 80) throw new Error(`keywords[${i}] text exceeds 80-char Google Ads limit`);
      const matchType = String(ko.matchType ?? "").toLowerCase() as MatchType;
      if (!VALID_MATCH_TYPES.has(matchType)) {
        throw new Error(`keywords[${i}] invalid matchType "${matchType}" (must be exact|phrase|broad)`);
      }
      const out: KeywordIn = { text, matchType };
      if (ko.cpcBidMicros !== undefined && ko.cpcBidMicros !== null) {
        const cpc = Number(ko.cpcBidMicros);
        if (!Number.isFinite(cpc) || cpc < 0) {
          throw new Error(`keywords[${i}] invalid cpcBidMicros`);
        }
        out.cpcBidMicros = cpc;
      }
      return out;
    });

    const out: ProposeKeywordsAddArgs = { adGroupId, adGroupName, keywords, summary };
    if (typeof obj.campaignName === "string" && obj.campaignName.trim()) {
      out.campaignName = obj.campaignName.trim();
    }
    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers
        .map((s) => (typeof s === "string" ? s : String(s)))
        .filter((s) => s.trim().length > 0);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const auditId = ctx.context.auditId as string | number | undefined;
    const clientId = ctx.context.clientId as string | number | undefined;
    const customerId = ctx.context.customerId as string | undefined;

    const keywordRows = args.keywords.map((k) => [
      k.text,
      k.matchType,
      typeof k.cpcBidMicros === "number" ? `${k.cpcBidMicros} micros` : "inherit",
    ]);

    const destinationLine = args.campaignName
      ? `- ${args.campaignName} → ${args.adGroupName} (${args.adGroupId})`
      : `- Ad group: ${args.adGroupName} (${args.adGroupId})`;

    const diffSection = [
      "**Destination**",
      "",
      destinationLine,
      "",
      "**Keywords to add**",
      "",
      mdTable(["Text", "Match type", "Max CPC"], keywordRows),
    ].join("\n");

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection,
      applyEffect: `Will call Growth Tools \`/api/google-ads/ad-groups/${args.adGroupId}/keywords/add\` against customer ${customerId ?? "?"} for audit #${auditId ?? "?"}. ${args.keywords.length} keyword${args.keywords.length === 1 ? "" : "s"} will be added PAUSED. Server-side duplicates skipped.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        proposalType: "keywords-add",
        title: `Add ${args.keywords.length} keyword${args.keywords.length === 1 ? "" : "s"} to "${args.adGroupName}"`,
        clientId,
        proposalPayload: {
          auditId: auditId ?? null,
          adGroupId: args.adGroupId,
          adGroupName: args.adGroupName,
          keywords: args.keywords,
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: `/agent-approvals/${approvalId}` } };
  },
};
