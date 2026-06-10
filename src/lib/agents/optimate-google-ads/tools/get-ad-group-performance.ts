/**
 * Tool: get_ad_group_performance
 *
 * Lists ad groups account-wide or inside one campaign with performance metrics.
 * Wraps Growth Tools `POST /api/google-ads/ad-groups/list`, including
 * conversion-action filtering so OptiMate can answer CPA questions at ad-group
 * scope.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsPost, parseConversionActions } from "./_growth-tools";
import { SUPPORTED_PRESETS, customRangeForGrowthTools, resolveRange } from "./_date-range";

interface AdGroupPerformanceArgs {
  campaignId?: string;
  range?: string;
  adGroupNameContains?: string;
  adGroupNames?: string[];
  conversionActions?: string[];
  limit?: number;
}

interface AdGroupRaw {
  campaignId?: string;
  campaignName?: string;
  adGroupId?: string;
  adGroupName?: string;
  status?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  conversions?: number;
  ctr?: number | string | null;
  avgCpc?: number;
  searchImpressionShare?: unknown;
  searchBudgetLostIS?: unknown;
  searchRankLostIS?: unknown;
}

interface AdGroupEnvelope {
  success?: boolean;
  campaignId?: string;
  adGroups?: AdGroupRaw[];
  totalCount?: number;
  conversionsFilteredBy?: string[] | null;
}

export const getAdGroupPerformance: CanonicalTool<AdGroupPerformanceArgs> = {
  name: "get_ad_group_performance",
  description:
    "Ad-group metrics for the linked account, account-wide by default or limited to one campaign when campaignId is supplied. Args: campaignId (optional numeric Google Ads campaign ID), range (optional preset OR custom 'YYYY-MM-DD..YYYY-MM-DD'; default LAST_30_DAYS), adGroupNameContains (optional substring filter), adGroupNames (optional exact/partial name filters), conversionActions (optional exact Google Ads conversion action names to override the CMS defaults), limit (default 100, max 500). Returns campaignId, campaignName, adGroupId, adGroupName, status, spend, clicks, impressions, conversions filtered to the selected/default conversion actions, CPA, avg CPC, Google Ads CTR when Growth Tools returns it, and impression-share fields. For month-on-month ad-group CPA comparisons, call once per month range and compare the returned CPA values.",
  inputSchema: {
    type: "object",
    properties: {
      campaignId: {
        type: "string",
        description: "Optional numeric Google Ads campaign ID to limit the lookup. Omit to search ad groups across the whole account.",
      },
      range: {
        type: "string",
        description:
          "Date range. Either a preset (" +
          (SUPPORTED_PRESETS as readonly string[]).join(", ") +
          "), a custom 'YYYY-MM-DD..YYYY-MM-DD' span, 'Q1 2026'/'Q3-2025', or 'YTD'/'QTD'/'THIS_QUARTER'/'LAST_QUARTER'. Default LAST_30_DAYS.",
      },
      adGroupNameContains: {
        type: "string",
        description: "Optional case-insensitive substring the ad group name must contain.",
      },
      adGroupNames: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional ad group names to filter to. Matching is case-insensitive and accepts exact names or contained text.",
      },
      conversionActions: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional exact Google Ads conversion action names to filter conversions to. If omitted, the CMS default conversion actions for the client are used.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 500,
        description: "Maximum rows to return after filtering. Default 100.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: AdGroupPerformanceArgs = {};
    if (obj.campaignId !== undefined && obj.campaignId !== null) {
      const campaignId = String(obj.campaignId).replace(/[^0-9]/g, "");
      if (!campaignId) throw new Error("campaignId must contain digits when provided");
      out.campaignId = campaignId;
    }
    if (obj.range !== undefined && obj.range !== null) out.range = String(obj.range);
    if (obj.adGroupNameContains !== undefined && obj.adGroupNameContains !== null) {
      const filter = String(obj.adGroupNameContains).trim();
      if (filter) out.adGroupNameContains = filter;
    }
    if (Array.isArray(obj.adGroupNames)) {
      out.adGroupNames = obj.adGroupNames
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0);
    }
    if (obj.conversionActions !== undefined) {
      if (!Array.isArray(obj.conversionActions)) throw new Error("conversionActions must be an array of strings");
      out.conversionActions = parseConversionActions(obj.conversionActions);
    }
    if (obj.limit !== undefined) {
      const n = Number(obj.limit);
      if (!Number.isFinite(n) || n < 1) throw new Error("limit must be >= 1");
      out.limit = Math.min(500, Math.floor(n));
    }
    return out;
  },
  execute: async (args, ctx) => {
    let customerId: string;
    try {
      customerId = ensureCustomerId(ctx.context.customerId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const resolved = resolveRange(args.range ?? "LAST_30_DAYS");
    const dateRange = customRangeForGrowthTools(resolved);
    const conversionActions = (args.conversionActions?.length ?? 0) > 0
      ? args.conversionActions ?? []
      : parseConversionActions(ctx.context.conversionActions);

    const res = await growthToolsPost<AdGroupEnvelope>("/api/google-ads/ad-groups/list", {
      customerId,
      ...(args.campaignId ? { campaignId: args.campaignId } : {}),
      dateRange,
      ...(conversionActions.length > 0 ? { conversionActions } : {}),
    });
    if (!res.ok) return { ok: false, error: res.error };

    const filters = [
      ...(args.adGroupNameContains ? [args.adGroupNameContains] : []),
      ...(args.adGroupNames ?? []),
    ].map((value) => value.toLowerCase());
    const limit = args.limit ?? 100;
    const rows = (res.data?.adGroups ?? [])
      .map((adGroup) => {
        const spend = Number(adGroup.cost ?? 0);
        const conversions = Number(adGroup.conversions ?? 0);
        const impressions = Number(adGroup.impressions ?? 0);
        const clicks = Number(adGroup.clicks ?? 0);
        return {
          campaignId: String(adGroup.campaignId ?? ""),
          campaignName: String(adGroup.campaignName ?? ""),
          adGroupId: String(adGroup.adGroupId ?? ""),
          adGroupName: String(adGroup.adGroupName ?? ""),
          status: adGroup.status ?? "UNKNOWN",
          spend: round2(spend),
          clicks,
          impressions,
          conversions: round2(conversions),
          cpa: conversions > 0 ? round2(spend / conversions) : null,
          avgCpc: round2(Number(adGroup.avgCpc ?? 0)),
          ctr: parsePercent(adGroup.ctr) ?? (impressions > 0 ? round2((clicks / impressions) * 100) : null),
          searchImpressionShare: parsePercent(adGroup.searchImpressionShare),
          searchBudgetLostIS: parsePercent(adGroup.searchBudgetLostIS),
          searchRankLostIS: parsePercent(adGroup.searchRankLostIS),
        };
      })
      .filter((adGroup) => {
        if (!adGroup.adGroupId) return false;
        if (filters.length === 0) return true;
        const name = adGroup.adGroupName.toLowerCase();
        return filters.some((filter) => name === filter || name.includes(filter));
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, limit);

    return {
      ok: true,
      data: {
        campaignId: res.data?.campaignId ?? args.campaignId ?? null,
        dateRange: resolved.dateRange,
        rangeLabel: resolved.label,
        ...(resolved.startDate ? { startDate: resolved.startDate, endDate: resolved.endDate } : {}),
        ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
        conversionActionsApplied: conversionActions.length > 0 ? conversionActions : null,
        conversionScopeNote: conversionActions.length > 0
          ? "Conversions are filtered to the selected conversion action names."
          : "No CMS default conversion actions were configured, so Growth Tools returned its default conversion scope.",
        adGroupNameContains: args.adGroupNameContains ?? null,
        adGroupNameFilters: args.adGroupNames ?? null,
        adGroups: rows,
        count: rows.length,
        totalCount: res.data?.totalCount ?? rows.length,
      },
    };
  },
};

function parsePercent(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return round2(value > 1 ? value : value * 100);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "--" || trimmed === "< 10%") return null;
  const numeric = Number(trimmed.replace(/[%<>,\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return round2(trimmed.includes("%") || numeric > 1 ? numeric : numeric * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
