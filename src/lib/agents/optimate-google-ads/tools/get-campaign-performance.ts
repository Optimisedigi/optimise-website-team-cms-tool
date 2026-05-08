/**
 * Tool: get_campaign_performance
 *
 * Per-campaign metrics for a chosen window. Wraps Growth Tools
 * `campaign-budgets/get-metrics` and computes derived rates (CTR, CPA) so the
 * agent doesn't have to.
 *
 * Default range: LAST_7_DAYS. Pass `range` to widen/narrow.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsGet } from "./_growth-tools";
import { SUPPORTED_PRESETS, resolveRange } from "./_date-range";

interface CampaignPerfArgs {
  range?: string;
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
    "Per-campaign metrics for the linked account. Args: range (optional preset, default LAST_7_DAYS). Returns rows with campaignId, name, status, spend, clicks, impressions, conversions, ctr, cpa.",
  inputSchema: {
    type: "object",
    properties: {
      range: {
        type: "string",
        description:
          "Date range preset. Default LAST_7_DAYS. Supported: " +
          (SUPPORTED_PRESETS as readonly string[]).join(", ") +
          ".",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: CampaignPerfArgs = {};
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

    // Different default than the others: 7 days is the operational sweet spot
    // when triaging campaign performance.
    const resolved = resolveRange(args.range ?? "LAST_7_DAYS");
    const conversionActions = (ctx.context.conversionActions as string | undefined) ?? "";
    const qs = new URLSearchParams({ customerId, dateRange: resolved.dateRange });
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
        dateRange: resolved.dateRange,
        rangeLabel: resolved.label,
        ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
        campaigns: rows,
        count: rows.length,
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
