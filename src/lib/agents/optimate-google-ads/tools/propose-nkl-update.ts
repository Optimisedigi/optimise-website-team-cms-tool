/**
 * Tool: propose_nkl_update
 *
 * Queues a change to an EXISTING Negative Keyword List for human approval.
 * The agent must compose the full target keyword set (replace semantics);
 * the apply-handler writes the array wholesale.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal, buildInternalMarkdown, mdTable } from "./_propose-helpers";

type MatchType = "exact" | "phrase" | "broad";

interface NklKeywordIn {
  keyword: string;
  matchType: MatchType;
}

interface ProposeNklUpdateArgs {
  nklId: number;
  keywords?: NklKeywordIn[];
  name?: string;
  isActive?: boolean;
  summary: string;
  supportingNumbers?: string[];
  /** Caller-supplied human description of what's changing. */
  changeDescription: string;
}

const VALID_MATCH_TYPES: MatchType[] = ["exact", "phrase", "broad"];

export const proposeNklUpdate: CanonicalTool<ProposeNklUpdateArgs> = {
  name: "propose_nkl_update",
  description:
    "Queue an update to an existing Negative Keyword List for human approval. Pass the FULL replacement keywords array (the apply-handler does a full replace, not a merge). Optional: rename via `name`, toggle via `isActive`. Always include a `changeDescription` that summarises adds/removes/renames in plain English so the reviewer can scan it fast.",
  inputSchema: {
    type: "object",
    properties: {
      nklId: { type: "integer", description: "The negative-keyword-lists doc id." },
      keywords: {
        type: "array",
        minItems: 0,
        maxItems: 1000,
        items: {
          type: "object",
          properties: {
            keyword: { type: "string", minLength: 1, maxLength: 200 },
            matchType: { type: "string", enum: VALID_MATCH_TYPES },
          },
          required: ["keyword", "matchType"],
          additionalProperties: false,
        },
        description: "FULL replacement set. Omit to leave keywords unchanged.",
      },
      name: { type: "string", minLength: 2, maxLength: 120 },
      isActive: { type: "boolean" },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      changeDescription: { type: "string", minLength: 5, maxLength: 600 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["nklId", "summary", "changeDescription"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const nklId = Number(obj.nklId);
    if (!Number.isFinite(nklId) || nklId <= 0) throw new Error("nklId must be a positive integer");
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    const changeDescription = String(obj.changeDescription ?? "").trim();
    if (changeDescription.length < 5) throw new Error("changeDescription must be at least 5 characters");

    const out: ProposeNklUpdateArgs = { nklId, summary, changeDescription };
    if (Array.isArray(obj.keywords)) {
      const kws: NklKeywordIn[] = obj.keywords.map((k, i) => {
        if (!k || typeof k !== "object") throw new Error(`keyword[${i}] is not an object`);
        const ko = k as Record<string, unknown>;
        const keyword = String(ko.keyword ?? "").trim();
        const matchType = String(ko.matchType ?? "").toLowerCase();
        if (!keyword) throw new Error(`keyword[${i}] missing text`);
        if (!VALID_MATCH_TYPES.includes(matchType as MatchType)) {
          throw new Error(`keyword[${i}] invalid matchType`);
        }
        return { keyword, matchType: matchType as MatchType };
      });
      out.keywords = kws;
    }
    if (typeof obj.name === "string" && obj.name.trim()) out.name = obj.name.trim();
    if (typeof obj.isActive === "boolean") out.isActive = obj.isActive;
    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers
        .map((s) => (typeof s === "string" ? s : String(s)))
        .filter((s) => s.trim().length > 0);
    }

    if (out.keywords === undefined && out.name === undefined && out.isActive === undefined) {
      throw new Error("propose_nkl_update: nothing to change (keywords, name, isActive all omitted)");
    }

    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as string | number | undefined;

    const diffParts: string[] = [];
    diffParts.push(args.changeDescription);
    if (args.keywords) {
      diffParts.push("");
      diffParts.push(`**Replacement keyword set (${args.keywords.length})**`);
      diffParts.push("");
      diffParts.push(mdTable(["Keyword", "Match"], args.keywords.map((k) => [k.keyword, k.matchType])));
    }
    if (args.name) diffParts.push(`\nRename → **${args.name}**`);
    if (args.isActive !== undefined) diffParts.push(`\nActive flag → **${args.isActive ? "active" : "inactive"}**`);

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: diffParts.join("\n"),
      applyEffect: `Will update \`negative-keyword-lists\` doc #${args.nklId}. Live push to Google Ads is a separate proposal.`,
    });

    const fieldsChanged: string[] = [];
    if (args.keywords) fieldsChanged.push("keywords");
    if (args.name) fieldsChanged.push("name");
    if (args.isActive !== undefined) fieldsChanged.push("isActive");

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "nkl-update",
        title: `Update NKL #${args.nklId} — ${fieldsChanged.join(", ")}`,
        clientId,
        proposalPayload: {
          nklId: args.nklId,
          ...(args.keywords ? { keywords: args.keywords } : {}),
          ...(args.name ? { name: args.name } : {}),
          ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return {
      ok: true,
      data: { approvalId, approvalUrl: `/agent-approvals/${approvalId}`, fieldsChanged },
    };
  },
};
