/**
 * Tool: propose_geo_campaign_split
 *
 * Queues a safe existing-account geo split for human approval. Existing
 * campaigns/ad groups are never paused; the new geo campaign is built PAUSED
 * with provenance + pending-activation labels, and reviewed parent isolation
 * updates are applied only when the proposal is approved.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal, buildInternalMarkdown, mdTable } from "./_propose-helpers";

type MatchType = "exact" | "phrase";

interface GeoKeywordIn {
  sourceKeyword?: string;
  text: string;
  matchType: MatchType;
  cpcBidMicros?: number;
  finalUrl?: string;
}

interface GeoAdCopyIn {
  finalUrls: string[];
  path1?: string;
  path2?: string;
  headlines: Array<{ text: string; pinnedField?: "HEADLINE_1" | "HEADLINE_2" | "HEADLINE_3" }>;
  descriptions: Array<{ text: string; pinnedField?: "DESCRIPTION_1" | "DESCRIPTION_2" }>;
}

interface GeoAdGroupIn {
  name: string;
  keywords: GeoKeywordIn[];
  adCopy: GeoAdCopyIn;
  cpcBidMicros?: number;
}

interface ProposeGeoCampaignSplitArgs {
  batchId: string;
  sourceCampaignId: string;
  sourceCampaignName: string;
  newCampaignName: string;
  dailyBudgetMicros: number;
  geoTargetIds: number[];
  negativeLocationGeoTargetIds?: number[];
  negativeKeywordsForSource?: Array<{ text: string; matchType: MatchType }>;
  adGroups: GeoAdGroupIn[];
  labels?: {
    createdBy?: string;
    pendingActivation?: string;
    batch?: string;
  };
  summary: string;
  supportingNumbers?: string[];
}

const VALID_MATCH_TYPES: ReadonlySet<MatchType> = new Set(["exact", "phrase"]);

function normaliseKeyword(raw: unknown, index: number): GeoKeywordIn {
  if (!raw || typeof raw !== "object") throw new Error(`keywords[${index}] must be an object`);
  const obj = raw as Record<string, unknown>;
  const text = String(obj.text ?? "").trim();
  if (!text) throw new Error(`keywords[${index}].text is required`);
  if (text.length > 80) throw new Error(`keywords[${index}].text must be ≤ 80 characters`);
  const matchType = String(obj.matchType ?? "").toLowerCase() as MatchType;
  if (!VALID_MATCH_TYPES.has(matchType)) throw new Error(`keywords[${index}].matchType must be exact or phrase; broad is not allowed`);
  const out: GeoKeywordIn = { text, matchType };
  if (typeof obj.sourceKeyword === "string" && obj.sourceKeyword.trim()) out.sourceKeyword = obj.sourceKeyword.trim();
  if (typeof obj.finalUrl === "string" && obj.finalUrl.trim()) out.finalUrl = obj.finalUrl.trim();
  if (obj.cpcBidMicros !== undefined && obj.cpcBidMicros !== null) {
    const cpc = Number(obj.cpcBidMicros);
    if (!Number.isFinite(cpc) || cpc < 0) throw new Error(`keywords[${index}].cpcBidMicros must be non-negative`);
    out.cpcBidMicros = cpc;
  }
  return out;
}

export const proposeGeoCampaignSplit: CanonicalTool<ProposeGeoCampaignSplitArgs> = {
  name: "propose_geo_campaign_split",
  description:
    "Queue a safe geo campaign split for human approval. Existing campaigns stay live and are never paused. On Apply, Growth Tools creates the new geo campaign/ad groups/ads/keywords PAUSED with Created by Optimise Digital + pending activation labels, and applies reviewed parent negative location/keyword isolation.",
  inputSchema: {
    type: "object",
    properties: {
      batchId: { type: "string", minLength: 1, maxLength: 80 },
      sourceCampaignId: { type: "string", minLength: 1 },
      sourceCampaignName: { type: "string", minLength: 1 },
      newCampaignName: { type: "string", minLength: 1 },
      dailyBudgetMicros: { type: "number", minimum: 1 },
      geoTargetIds: { type: "array", minItems: 1, items: { type: "number" } },
      negativeLocationGeoTargetIds: { type: "array", items: { type: "number" } },
      negativeKeywordsForSource: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string", minLength: 1, maxLength: 80 },
            matchType: { type: "string", enum: ["exact", "phrase"] },
          },
          required: ["text", "matchType"],
          additionalProperties: false,
        },
      },
      adGroups: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
            cpcBidMicros: { type: "number", minimum: 0 },
            keywords: {
              type: "array",
              minItems: 1,
              maxItems: 200,
              items: {
                type: "object",
                properties: {
                  sourceKeyword: { type: "string" },
                  text: { type: "string", minLength: 1, maxLength: 80 },
                  matchType: { type: "string", enum: ["exact", "phrase"] },
                  cpcBidMicros: { type: "number", minimum: 0 },
                  finalUrl: { type: "string" },
                },
                required: ["text", "matchType"],
                additionalProperties: false,
              },
            },
            adCopy: { type: "object" },
          },
          required: ["name", "keywords", "adCopy"],
          additionalProperties: false,
        },
      },
      labels: { type: "object" },
      summary: { type: "string", minLength: 10, maxLength: 1200 },
      supportingNumbers: { type: "array", items: { type: "string", maxLength: 240 }, maxItems: 12 },
    },
    required: ["batchId", "sourceCampaignId", "sourceCampaignName", "newCampaignName", "dailyBudgetMicros", "geoTargetIds", "adGroups", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const batchId = String(obj.batchId ?? "").trim();
    const sourceCampaignId = String(obj.sourceCampaignId ?? "").trim();
    const sourceCampaignName = String(obj.sourceCampaignName ?? "").trim();
    const newCampaignName = String(obj.newCampaignName ?? "").trim();
    const summary = String(obj.summary ?? "").trim();
    const dailyBudgetMicros = Number(obj.dailyBudgetMicros);
    if (!batchId) throw new Error("batchId is required");
    if (!sourceCampaignId) throw new Error("sourceCampaignId is required");
    if (!sourceCampaignName) throw new Error("sourceCampaignName is required");
    if (!newCampaignName) throw new Error("newCampaignName is required");
    if (!Number.isFinite(dailyBudgetMicros) || dailyBudgetMicros <= 0) throw new Error("dailyBudgetMicros must be positive");
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");

    const geoTargetIds = Array.isArray(obj.geoTargetIds) ? obj.geoTargetIds.map(Number).filter(Number.isFinite) : [];
    if (geoTargetIds.length === 0) throw new Error("geoTargetIds must contain at least one ID");

    const adGroups = (Array.isArray(obj.adGroups) ? obj.adGroups : []).map((rawAdGroup, adGroupIndex) => {
      if (!rawAdGroup || typeof rawAdGroup !== "object") throw new Error(`adGroups[${adGroupIndex}] must be an object`);
      const ag = rawAdGroup as Record<string, unknown>;
      const name = String(ag.name ?? "").trim();
      if (!name) throw new Error(`adGroups[${adGroupIndex}].name is required`);
      const keywords = (Array.isArray(ag.keywords) ? ag.keywords : []).map(normaliseKeyword);
      if (keywords.length === 0) throw new Error(`adGroups[${adGroupIndex}].keywords is required`);
      const adCopy = ag.adCopy as GeoAdCopyIn;
      if (!adCopy || typeof adCopy !== "object") throw new Error(`adGroups[${adGroupIndex}].adCopy is required`);
      const out: GeoAdGroupIn = { name, keywords, adCopy };
      if (ag.cpcBidMicros !== undefined && ag.cpcBidMicros !== null) out.cpcBidMicros = Number(ag.cpcBidMicros);
      return out;
    });
    if (adGroups.length === 0) throw new Error("adGroups is required");

    const negativeLocationGeoTargetIds = Array.isArray(obj.negativeLocationGeoTargetIds)
      ? obj.negativeLocationGeoTargetIds.map(Number).filter(Number.isFinite)
      : undefined;
    const negativeKeywordsForSource = Array.isArray(obj.negativeKeywordsForSource)
      ? obj.negativeKeywordsForSource.map((rawNegative, i) => {
          if (!rawNegative || typeof rawNegative !== "object") throw new Error(`negativeKeywordsForSource[${i}] must be an object`);
          const nk = rawNegative as Record<string, unknown>;
          const text = String(nk.text ?? "").trim();
          const matchType = String(nk.matchType ?? "").toLowerCase() as MatchType;
          if (!text) throw new Error(`negativeKeywordsForSource[${i}].text is required`);
          if (!VALID_MATCH_TYPES.has(matchType)) throw new Error(`negativeKeywordsForSource[${i}].matchType must be exact or phrase`);
          return { text, matchType };
        })
      : undefined;

    const out: ProposeGeoCampaignSplitArgs = {
      batchId,
      sourceCampaignId,
      sourceCampaignName,
      newCampaignName,
      dailyBudgetMicros,
      geoTargetIds,
      adGroups,
      summary,
    };
    if (negativeLocationGeoTargetIds?.length) out.negativeLocationGeoTargetIds = negativeLocationGeoTargetIds;
    if (negativeKeywordsForSource?.length) out.negativeKeywordsForSource = negativeKeywordsForSource;
    if (obj.labels && typeof obj.labels === "object") out.labels = obj.labels as ProposeGeoCampaignSplitArgs["labels"];
    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers.map((s) => String(s)).filter((s) => s.trim().length > 0);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const auditId = ctx.context.auditId as string | number | undefined;
    const clientId = ctx.context.clientId as string | number | undefined;
    const customerId = ctx.context.customerId as string | undefined;

    const keywordRows = args.adGroups.flatMap((ag) => ag.keywords.map((kw) => [
      ag.name,
      kw.sourceKeyword ?? "—",
      kw.text,
      kw.matchType,
      typeof kw.cpcBidMicros === "number" ? `${kw.cpcBidMicros} micros` : "inherit",
    ]));

    const diffSection = [
      "**Existing campaign preserved**",
      "",
      `- Source campaign: ${args.sourceCampaignName} (${args.sourceCampaignId})`,
      "- Existing campaign/ad groups stay live; this proposal does not pause them.",
      "",
      "**New paused geo campaign**",
      "",
      `- Campaign: ${args.newCampaignName}`,
      `- Positive geo targets: ${args.geoTargetIds.join(", ")}`,
      `- Budget: ${args.dailyBudgetMicros} micros`,
      `- Labels: Created by Optimise Digital, Pending activation - Optimise Digital, ${args.labels?.batch ?? args.batchId}`,
      "",
      "**Reviewed parent isolation**",
      "",
      `- Negative locations added to source: ${(args.negativeLocationGeoTargetIds || []).join(", ") || "none"}`,
      `- Negative keywords added to source: ${(args.negativeKeywordsForSource || []).map((nk) => `${nk.matchType}:${nk.text}`).join(", ") || "none"}`,
      "",
      "**New keywords**",
      "",
      mdTable(["Ad group", "Source", "New keyword", "Match", "Max CPC"], keywordRows),
    ].join("\n");

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection,
      applyEffect: `Will call Growth Tools \`/api/google-ads/geo-split/apply\` for customer ${customerId ?? "?"}. New entities ship PAUSED with labels; existing campaign status is unchanged.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "geo-campaign-split",
        title: `Geo split: ${args.sourceCampaignName} → ${args.newCampaignName}`,
        clientId,
        proposalPayload: { auditId: auditId ?? null, ...args },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return { ok: true, data: { approvalId, approvalUrl: `/agent-approvals/${approvalId}` } };
  },
};
