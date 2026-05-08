/**
 * Tool: get_account_overview
 *
 * Read-only summary of the account's last 30 days. Aggregates Growth Tools
 * `campaign-budgets/get-metrics` (LAST_30_DAYS) into totals + active campaign
 * count so the agent can answer "what's going on?" without three tool calls.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsGet } from "./_growth-tools";

interface OverviewArgs {
  // Empty schema; uses customerId from agent context.
  _?: never;
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
    "Returns last-30-days totals for the linked Google Ads account: total spend, total conversions, average CPA, count of active campaigns, and the date range covered. Takes no arguments.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  validate: (raw) => {
    if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
      // Tolerant: ignore extra keys rather than throwing.
    }
    return {} as OverviewArgs;
  },
  execute: async (_args, ctx) => {
    let customerId: string;
    try {
      customerId = ensureCustomerId(ctx.context.customerId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const conversionActions = (ctx.context.conversionActions as string | undefined) ?? "";

    const qs = new URLSearchParams({ customerId, dateRange: "LAST_30_DAYS" });
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
        dateRange: "LAST_30_DAYS",
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
