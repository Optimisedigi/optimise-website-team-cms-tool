/**
 * Tool: get_account_overview
 *
 * Read-only summary for the account over a chosen window. Aggregates Growth
 * Tools `campaign-budgets/get-metrics` into totals + active campaign count so
 * the agent can answer "what's going on?" without three tool calls.
 *
 * Default range: LAST_30_DAYS. Pass `range` to widen/narrow.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsGet } from "./_growth-tools";
import { SUPPORTED_PRESETS, resolveRange, customRangeForGrowthTools } from "./_date-range";

interface OverviewArgs {
  range?: string;
}

interface CampaignMetricRaw {
  campaignId: string;
  campaignName?: string;
  status?: string;
  cost?: number;
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
}

interface MetricsEnvelope {
  metrics?: CampaignMetricRaw[];
}

export const getAccountOverview: CanonicalTool<OverviewArgs> = {
  name: "get_account_overview",
  description:
    "Account-level totals over a chosen window: total spend, total conversions, average CPA, count of active campaigns, and the date range covered. Args: range (optional preset, default LAST_30_DAYS). Common values: LAST_7_DAYS, LAST_30_DAYS, LAST_90_DAYS, THIS_MONTH, LAST_MONTH, YESTERDAY.",
  inputSchema: {
    type: "object",
    properties: {
      range: {
        type: "string",
        description:
          "Date range preset. Default LAST_30_DAYS. Supported: " +
          (SUPPORTED_PRESETS as readonly string[]).join(", ") +
          ". Aliases like THIS_WEEK, LAST_WEEK, YEAR_TO_DATE are coerced to the nearest supported preset.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: OverviewArgs = {};
    if (obj.range !== undefined && obj.range !== null) {
      out.range = String(obj.range);
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

    // Growth Tools' get-metrics endpoint accepts either a preset enum or a
    // 'YYYY-MM-DD,YYYY-MM-DD' comma-span as `dateRange`. customRangeForGrowthTools
    // formats CUSTOM ranges as a comma-span; presets pass through unchanged.
    const resolved = resolveRange(args.range);
    const dateRangeParam = customRangeForGrowthTools(resolved);
    const conversionActions = (ctx.context.conversionActions as string | undefined) ?? "";

    const qs = new URLSearchParams({ customerId, dateRange: dateRangeParam });
    if (conversionActions) qs.set("conversionActions", conversionActions);

    const res = await growthToolsGet<MetricsEnvelope>(
      `/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`,
    );
    if (!res.ok) return { ok: false, error: res.error };

    const metrics = res.data?.metrics ?? [];
    let totalSpend = 0;
    let totalConversions = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let activeCampaigns = 0;

    for (const m of metrics) {
      const cost = Number(m.cost ?? m.spend ?? 0);
      const conv = Number(m.conversions ?? 0);
      totalSpend += cost;
      totalConversions += conv;
      totalImpressions += Number(m.impressions ?? 0);
      totalClicks += Number(m.clicks ?? 0);
      // Growth Tools only returns campaigns that ran at all in the window;
      // count those that delivered impressions as "active".
      if (Number(m.impressions ?? 0) > 0) activeCampaigns += 1;
    }

    const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : null;

    return {
      ok: true,
      data: {
        dateRange: resolved.dateRange,
        rangeLabel: resolved.label,
        ...(resolved.startDate ? { startDate: resolved.startDate, endDate: resolved.endDate } : {}),
        ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
        totalSpend: round2(totalSpend),
        totalConversions: round2(totalConversions),
        totalImpressions,
        totalClicks,
        avgCpa: avgCpa === null ? null : round2(avgCpa),
        activeCampaigns,
        campaignsReturned: metrics.length,
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
