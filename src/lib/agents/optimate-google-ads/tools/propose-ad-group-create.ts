/**
 * Tool: propose_ad_group_create
 *
 * Queues "create ONE new ad group inside an existing campaign" for human
 * approval. Optionally clones a source ad group's top RSA, default Max CPC,
 * target_cpa_micros / target_roas, audience signals, device + demographic
 * bid modifiers, and ad-group-level negatives.
 *
 * On Apply, the dispatcher calls Growth Tools
 * `POST /api/google-ads/ad-groups/create` against the linked customer ID.
 * The new ad group ships PAUSED.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { queueProposal, buildInternalMarkdown, mdTable } from "./_propose-helpers";

type MatchType = "exact" | "phrase" | "broad";

interface AdGroupKeywordIn {
  text: string;
  matchType: MatchType;
  cpcBidMicros?: number;
}

interface ProposeAdGroupCreateArgs {
  campaignId: string;
  campaignName: string;
  adGroupName: string;
  keywords: AdGroupKeywordIn[];
  cloneFromAdGroupId?: string;
  cloneFromAdGroupName?: string;
  summary: string;
  supportingNumbers?: string[];
}

const VALID_MATCH_TYPES: ReadonlySet<MatchType> = new Set(["exact", "phrase", "broad"]);

export const proposeAdGroupCreate: CanonicalTool<ProposeAdGroupCreateArgs> = {
  name: "propose_ad_group_create",
  description:
    "Create ONE new ad group in an existing campaign, PAUSED. Optionally clone the top RSA + default Max CPC + target_cpa/target_roas + audience signals + bid modifiers + ad-group-level negatives from a source ad group (same customer). Use when an existing ad group is working well and you want to spin up a similar one for new keywords without rebuilding the whole campaign. Each keyword needs text + matchType (exact/phrase/broad), optional cpcBidMicros.",
  inputSchema: {
    type: "object",
    properties: {
      campaignId: { type: "string", minLength: 1 },
      campaignName: { type: "string", minLength: 1 },
      adGroupName: { type: "string", minLength: 1, maxLength: 255 },
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
      cloneFromAdGroupId: { type: "string" },
      cloneFromAdGroupName: { type: "string" },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["campaignId", "campaignName", "adGroupName", "keywords", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const campaignId = String(obj.campaignId ?? "").trim();
    if (!campaignId) throw new Error("campaignId is required");
    const campaignName = String(obj.campaignName ?? "").trim();
    if (!campaignName) throw new Error("campaignName is required");
    const adGroupName = String(obj.adGroupName ?? "").trim();
    if (!adGroupName) throw new Error("adGroupName is required");
    if (adGroupName.length > 255) throw new Error("adGroupName must be ≤ 255 characters");

    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    if (summary.length > 800) throw new Error("summary must be ≤ 800 characters");

    const rawKeywords = Array.isArray(obj.keywords) ? obj.keywords : [];
    if (rawKeywords.length === 0) throw new Error("keywords array required");
    if (rawKeywords.length > 200) throw new Error("keywords cannot exceed 200 entries");

    const keywords: AdGroupKeywordIn[] = rawKeywords.map((k, i) => {
      if (!k || typeof k !== "object") throw new Error(`keywords[${i}] not an object`);
      const ko = k as Record<string, unknown>;
      const text = String(ko.text ?? "").trim();
      if (!text) throw new Error(`keywords[${i}] missing text`);
      if (text.length > 80) throw new Error(`keywords[${i}] text exceeds 80-char Google Ads limit`);
      const matchType = String(ko.matchType ?? "").toLowerCase() as MatchType;
      if (!VALID_MATCH_TYPES.has(matchType)) {
        throw new Error(`keywords[${i}] invalid matchType "${matchType}" (must be exact|phrase|broad)`);
      }
      const out: AdGroupKeywordIn = { text, matchType };
      if (ko.cpcBidMicros !== undefined && ko.cpcBidMicros !== null) {
        const cpc = Number(ko.cpcBidMicros);
        if (!Number.isFinite(cpc) || cpc < 0) {
          throw new Error(`keywords[${i}] invalid cpcBidMicros`);
        }
        out.cpcBidMicros = cpc;
      }
      return out;
    });

    const out: ProposeAdGroupCreateArgs = {
      campaignId,
      campaignName,
      adGroupName,
      keywords,
      summary,
    };
    if (typeof obj.cloneFromAdGroupId === "string" && obj.cloneFromAdGroupId.trim()) {
      out.cloneFromAdGroupId = obj.cloneFromAdGroupId.trim();
    }
    if (typeof obj.cloneFromAdGroupName === "string" && obj.cloneFromAdGroupName.trim()) {
      out.cloneFromAdGroupName = obj.cloneFromAdGroupName.trim();
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

    const sections: string[] = [];
    sections.push("**Destination**");
    sections.push("");
    sections.push(`- Campaign: ${args.campaignName} (${args.campaignId})`);
    sections.push(`- New ad group: ${args.adGroupName}`);
    sections.push("");

    if (args.cloneFromAdGroupId) {
      sections.push("**Cloning from**");
      sections.push("");
      sections.push(
        `- Source ad group: ${args.cloneFromAdGroupName ?? "(name not supplied)"} (${args.cloneFromAdGroupId})`,
      );
      sections.push("- Will copy: top-performing RSA, default Max CPC, target_cpa / target_roas overrides (if set), audience criteria + bid modifiers, device + demographic bid modifiers, ad-group-level negative keywords.");
      sections.push("");
    }

    sections.push("**Keywords**");
    sections.push("");
    sections.push(mdTable(["Text", "Match type", "Max CPC"], keywordRows));

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: sections.join("\n"),
      applyEffect: `Will call Growth Tools \`/api/google-ads/ad-groups/create\` against customer ${customerId ?? "?"} for audit #${auditId ?? "?"}. Ad group will be created PAUSED with ${args.keywords.length} keyword${args.keywords.length === 1 ? "" : "s"}.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "ad-group-create",
        title: `Create ad group "${args.adGroupName}" in ${args.campaignName}`,
        clientId,
        proposalPayload: {
          auditId: auditId ?? null,
          campaignId: args.campaignId,
          campaignName: args.campaignName,
          adGroupName: args.adGroupName,
          keywords: args.keywords,
          cloneFromAdGroupId: args.cloneFromAdGroupId ?? null,
          cloneFromAdGroupName: args.cloneFromAdGroupName ?? null,
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: agentApprovalPath(approvalId) } };
  },
};
