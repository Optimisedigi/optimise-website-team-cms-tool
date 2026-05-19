/**
 * Tool: propose_nkl_create
 *
 * Queues a new Negative Keyword List for human approval. On Apply, the
 * dispatcher calls payload.create() against the `negative-keyword-lists`
 * collection. Live push to Google Ads is a separate proposal
 * (`propose_nkl_push_live`) the agent must queue afterwards.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal, buildInternalMarkdown, mdTable } from "./_propose-helpers";

type MatchType = "exact" | "phrase" | "broad";
type Scope = "account" | "campaign" | "ad_group";

interface NklKeywordIn {
  keyword: string;
  matchType: MatchType;
}

interface ProposeNklCreateArgs {
  name: string;
  scope: Scope;
  keywords: NklKeywordIn[];
  campaigns?: string[];
  adGroupName?: string;
  summary: string;
  supportingNumbers?: string[];
}

const VALID_MATCH_TYPES: MatchType[] = ["exact", "phrase", "broad"];
const VALID_SCOPES: Scope[] = ["account", "campaign", "ad_group"];

export const proposeNklCreate: CanonicalTool<ProposeNklCreateArgs> = {
  name: "propose_nkl_create",
  description:
    "Queue creation of a NEW Negative Keyword List in the CMS for human approval. Use when introducing a fresh list (account/campaign/ad-group scope). Each keyword needs term + matchType. Provide a 1–3 sentence summary and the supporting numbers (spend, conversions) that justify the change. Live push is a separate proposal — this tool only stages the list in the CMS.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 2, maxLength: 120, description: "List name e.g. 'Generic waste – Q4 2026'." },
      scope: { type: "string", enum: VALID_SCOPES, description: "account, campaign, or ad_group." },
      campaigns: {
        type: "array",
        items: { type: "string" },
        description: "Required when scope=campaign. Campaign names this list applies to.",
      },
      adGroupName: {
        type: "string",
        description: "Required when scope=ad_group.",
      },
      keywords: {
        type: "array",
        minItems: 1,
        maxItems: 500,
        items: {
          type: "object",
          properties: {
            keyword: { type: "string", minLength: 1, maxLength: 200 },
            matchType: { type: "string", enum: VALID_MATCH_TYPES },
          },
          required: ["keyword", "matchType"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
        description: "Bullet points with the metric + tool that justifies the proposal.",
      },
    },
    required: ["name", "scope", "keywords", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const name = String(obj.name ?? "").trim();
    if (name.length < 2) throw new Error("name must be at least 2 characters");

    const scope = String(obj.scope ?? "") as Scope;
    if (!VALID_SCOPES.includes(scope)) throw new Error("scope must be account, campaign, or ad_group");

    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");

    const rawKw = Array.isArray(obj.keywords) ? obj.keywords : [];
    if (rawKw.length === 0) throw new Error("keywords must be non-empty");
    if (rawKw.length > 500) throw new Error("keywords cannot exceed 500 entries");
    const keywords: NklKeywordIn[] = rawKw.map((k, i) => {
      if (!k || typeof k !== "object") throw new Error(`keyword[${i}] is not an object`);
      const ko = k as Record<string, unknown>;
      const keyword = String(ko.keyword ?? "").trim();
      const matchType = String(ko.matchType ?? "").toLowerCase();
      if (!keyword) throw new Error(`keyword[${i}] missing text`);
      if (!VALID_MATCH_TYPES.includes(matchType as MatchType)) {
        throw new Error(`keyword[${i}] matchType must be exact, phrase, or broad`);
      }
      return { keyword, matchType: matchType as MatchType };
    });

    const out: ProposeNklCreateArgs = { name, scope, keywords, summary };
    if (scope === "campaign") {
      const camps = Array.isArray(obj.campaigns) ? obj.campaigns.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
      if (camps.length === 0) throw new Error("scope=campaign requires non-empty campaigns array");
      out.campaigns = camps;
    }
    if (scope === "ad_group") {
      const ag = String(obj.adGroupName ?? "").trim();
      if (!ag) throw new Error("scope=ad_group requires adGroupName");
      out.adGroupName = ag;
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

    const diff = mdTable(
      ["Keyword", "Match"],
      args.keywords.map((k) => [k.keyword, k.matchType]),
    );

    const scopeLabel = args.scope === "campaign"
      ? `campaign-scope (${(args.campaigns ?? []).join(", ")})`
      : args.scope === "ad_group"
        ? `ad-group-scope (${args.adGroupName})`
        : "account-scope";

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: `**${args.keywords.length} new negative keyword${args.keywords.length === 1 ? "" : "s"}**, ${scopeLabel}, list name **${args.name}**.\n\n${diff}`,
      applyEffect: `Will create a new \`negative-keyword-lists\` document in the CMS (client #${clientId ?? "?"}, audit #${auditId ?? "?"}). Live push to Google Ads is a separate proposal.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "nkl-create",
        title: `Create NKL "${args.name}" — ${args.keywords.length} keyword${args.keywords.length === 1 ? "" : "s"}`,
        clientId,
        proposalPayload: {
          auditId: auditId ?? null,
          name: args.name,
          scope: args.scope,
          keywords: args.keywords,
          ...(args.campaigns ? { campaigns: args.campaigns } : {}),
          ...(args.adGroupName ? { adGroupName: args.adGroupName } : {}),
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return {
      ok: true,
      data: {
        approvalId,
        approvalUrl: `/agent-approvals/${approvalId}`,
        keywordCount: args.keywords.length,
      },
    };
  },
};
