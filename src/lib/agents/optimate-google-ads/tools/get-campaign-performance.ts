/**
 * Tool: get_campaign_performance
 *
 * Per-campaign metrics for a chosen window. Wraps Growth Tools
 * `campaign-budgets/get-metrics` and computes derived rates (CTR, CPA) so the
 * agent doesn't have to.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { daysToDateRange, ensureCustomerId, growthToolsGet } from "./_growth-tools";

interface CampaignPerfArgs {
  days?: number;
}

interface MetricRaw {
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
  metrics?: MetricRaw[];
}

export const getCampaignPerformance: CanonicalTool<CampaignPerfArgs> = {
  name: "get_campaign_performance",
  description:
    "Per-campaign metrics for the linked account. Args: days (default 7, max 90). Returns rows with campaignId, name, status, spend, clicks, impressions, conversions, ctr, cpa.",
  inputSchema: {
    type: "object",
    properties: {
      days: {
        type: "integer",
        minimum: 1,
        maximum: 90,
        description: "Lookback window in days. Default 7, max 90.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    let days = 7;
    if (obj.days !== undefined) {
      const n = Number(obj.days);
      if (!Number.isFinite(n)) throw new Error("days must be a number");
      if (n < 1) throw new Error("days must be >= 1");
      days = Math.min(90, Math.floor(n));
    }
    return { days };
  },
  execute: async (args, ctx) => {
    let customerId: string;
    try {
      customerId = ensureCustomerId(ctx.context.customerId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const days = args.days ?? 7;
    const dateRange = daysToDateRange(days);
    const conversionActions = (ctx.context.conversionActions as string | undefined) ?? "";
    const qs = new URLSearchParams({ customerId, dateRange });
    if (conversionActions) qs.set("conversionActions", conversionActions);

    const res = await growthToolsGet<MetricsEnvelope>(
      `/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`,
    );
    if (!res.ok) return { ok: false, error: res.error };

    const rows = (res.data?.metrics ?? []).map((m) => {
      const spend = Number(m.cost ?? m.spend ?? 0);
      const clicks = Number(m.clicks ?? 0);
      const impressions = Number(m.impressions ?? 0);
      const conversions = Number(m.conversions ?? 0);
      return {
        campaignId: String(m.campaignId),
        name: m.campaignName ?? String(m.campaignId),
        status: m.status ?? "UNKNOWN",
        spend: round2(spend),
        clicks,
        impressions,
        conversions: round2(conversions),
        ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
        cpa: conversions > 0 ? round2(spend / conversions) : null,
      };
    });

    rows.sort((a, b) => b.spend - a.spend);

    return {
      ok: true,
      data: {
        dateRange,
        days,
        campaigns: rows,
        count: rows.length,
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
