/**
 * Tool: get_campaign_performance
 *
 * Per-campaign metrics for a chosen window. Wraps Growth Tools
 * `campaign-budgets/get-metrics` and computes derived rates (CTR, CPA) so the
 * agent doesn't have to.
 *
 * Default range: LAST_7_DAYS. Pass `range` to widen/narrow. Pass `segment`
 * ("month" | "week" | "day") for a per-period breakdown — one row per
 * (campaign, segment) pair. Falls back gracefully when Growth Tools is on
 * a build that doesn't support segmentation (flags
 * `segmentationUnavailable: true`).
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsGet } from "./_growth-tools";
import {
  SUPPORTED_PRESETS,
  resolveRangeWithSegment,
  snapCustomToPreset,
  type Segment,
} from "./_date-range";

interface CampaignPerfArgs {
  range?: string;
  segment?: Segment;
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
  segment?: string;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
  segmentation?: string;
}

export const getCampaignPerformance: CanonicalTool<CampaignPerfArgs> = {
  name: "get_campaign_performance",
  description:
    "Per-campaign metrics for the linked account. Args: range (optional preset OR 'YYYY-MM-DD..YYYY-MM-DD' OR 'Q1 2026'/'YTD'/'QTD' literal; default LAST_7_DAYS), segment ('month'|'week'|'day' — when set, returns one row per (campaign, segment) pair instead of a single total). Returns rows with campaignId, name, status, spend, clicks, impressions, conversions, ctr, cpa.",
  inputSchema: {
    type: "object",
    properties: {
      range: {
        type: "string",
        description:
          "Date range. Either a preset (" +
          (SUPPORTED_PRESETS as readonly string[]).join(", ") +
          "), a custom 'YYYY-MM-DD..YYYY-MM-DD' span, 'Q1 2026'/'Q3-2025', or 'YTD'/'QTD'/'THIS_QUARTER'/'LAST_QUARTER'. Default LAST_7_DAYS.",
      },
      segment: {
        type: "string",
        enum: ["month", "week", "day"],
        description:
          "Optional per-row time segmentation. When set, the tool returns one row per (campaign, segment) pair so you can compare months/weeks. Requires the upstream Growth Tools service to support segmentation; if it doesn't, the response will include segmentationUnavailable: true.",
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
    if (obj.segment !== undefined && obj.segment !== null) {
      const s = String(obj.segment).toLowerCase();
      if (s !== "month" && s !== "week" && s !== "day") {
        throw new Error("segment must be 'month', 'week', or 'day'");
      }
      out.segment = s as Segment;
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
    const requested = resolveRangeWithSegment(args.range ?? "LAST_7_DAYS", args.segment);
    // Growth Tools' get-metrics endpoint substitutes dateRange into a GAQL
    // DURING clause verbatim, so we have to snap CUSTOM → nearest preset
    // before calling it (see snapCustomToPreset comments). Both halves of
    // the response surface the snap so the agent can be honest about it.
    const resolved = snapCustomToPreset(requested);
    const conversionActions = (ctx.context.conversionActions as string | undefined) ?? "";
    const qs = new URLSearchParams({ customerId, dateRange: resolved.dateRange });
    if (conversionActions) qs.set("conversionActions", conversionActions);
    if (resolved.startDate) qs.set("startDate", resolved.startDate);
    if (resolved.endDate) qs.set("endDate", resolved.endDate);
    if (resolved.segment) qs.set("segment", resolved.segment);

    const res = await growthToolsGet<MetricsEnvelope>(
      `/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`,
    );
    if (!res.ok) return { ok: false, error: res.error };

    const raw = res.data?.metrics ?? [];
    const upstreamReturnsSegment = raw.some((m) => typeof m.segment === "string" && m.segment.length > 0);
    const segmentationUnavailable =
      Boolean(resolved.segment) && raw.length > 0 && !upstreamReturnsSegment;

    const rows = raw.map((m) => {
      const spend = Number(m.cost ?? m.spend ?? 0);
      const clicks = Number(m.clicks ?? 0);
      const impressions = Number(m.impressions ?? 0);
      const conversions = Number(m.conversions ?? 0);
      return {
        campaignId: String(m.campaignId),
        name: m.campaignName ?? String(m.campaignId),
        status: m.status ?? "UNKNOWN",
        segment: typeof m.segment === "string" ? m.segment : undefined,
        spend: round2(spend),
        clicks,
        impressions,
        conversions: round2(conversions),
        ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
        cpa: conversions > 0 ? round2(spend / conversions) : null,
      };
    });

    if (resolved.segment && upstreamReturnsSegment) {
      // Group rows by (campaign, segment). Within a campaign, segments are
      // chronological because they're lex-comparable as ISO/Y-M strings.
      rows.sort((a, b) => {
        const n = a.name.localeCompare(b.name);
        if (n !== 0) return n;
        return (a.segment ?? "").localeCompare(b.segment ?? "");
      });
    } else {
      rows.sort((a, b) => b.spend - a.spend);
    }

    return {
      ok: true,
      data: {
        dateRange: resolved.dateRange,
        rangeLabel: resolved.label,
        ...(resolved.startDate ? { startDate: resolved.startDate, endDate: resolved.endDate } : {}),
        ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
        segmentation: resolved.segment ?? null,
        ...(segmentationUnavailable ? { segmentationUnavailable: true } : {}),
        campaigns: rows,
        count: rows.length,
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
