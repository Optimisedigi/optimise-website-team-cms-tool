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
  customRangeForGrowthTools,
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
  conversionsByAction?: Record<string, number>;
  conversionsByCategory?: Record<string, number>;
  searchImpressionShare?: unknown;
  searchBudgetLostIS?: unknown;
  searchBudgetLostImpressionShare?: unknown;
  searchRankLostIS?: unknown;
  searchRankLostImpressionShare?: unknown;
  segment?: string;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
  segmentation?: string;
}

export const getCampaignPerformance: CanonicalTool<CampaignPerfArgs> = {
  name: "get_campaign_performance",
  description:
    "Per-campaign metrics for the linked account. Args: range (optional preset OR 'YYYY-MM-DD..YYYY-MM-DD' OR 'Q1 2026'/'YTD'/'QTD' literal; default LAST_7_DAYS), segment ('month'|'week'|'day' — when set, returns one row per (campaign, segment) pair instead of a single total). Returns rows with campaignId, name, status, spend, clicks, impressions, conversions, conversionsByCategory (e.g. Phone Calls vs Form Submits when configured), ctr, cpa, searchImpressionShare, searchBudgetLostIS, searchRankLostIS.",
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
    const resolved = resolveRangeWithSegment(args.range ?? "LAST_7_DAYS", args.segment);
    // Growth Tools' get-metrics endpoint accepts either a preset enum or a
    // 'YYYY-MM-DD,YYYY-MM-DD' comma-span as `dateRange`. customRangeForGrowthTools
    // formats CUSTOM ranges as a comma-span; presets pass through unchanged.
    // We don't send startDate/endDate as separate params — Growth Tools
    // ignores them once the dateRange carries the span.
    const dateRangeParam = customRangeForGrowthTools(resolved);
    const conversionActions = (ctx.context.conversionActions as string | undefined) ?? "";
    const conversionActionCategories = (ctx.context.conversionActionCategories as string | undefined) ?? "";
    const qs = new URLSearchParams({ customerId, dateRange: dateRangeParam });
    if (conversionActions) qs.set("conversionActions", conversionActions);
    if (conversionActionCategories) qs.set("conversionActionCategories", conversionActionCategories);
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
        conversionsByAction: normaliseBreakdown(m.conversionsByAction),
        conversionsByCategory: normaliseBreakdown(m.conversionsByCategory),
        ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
        cpa: conversions > 0 ? round2(spend / conversions) : null,
        searchImpressionShare: parsePercent(m.searchImpressionShare),
        searchBudgetLostIS: parsePercent(m.searchBudgetLostIS ?? m.searchBudgetLostImpressionShare),
        searchRankLostIS: parsePercent(m.searchRankLostIS ?? m.searchRankLostImpressionShare),
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
        conversionActionsApplied: conversionActions || null,
        conversionScopeNote: conversionActions
          ? "Conversions are filtered to the CMS default conversion actions for this client."
          : "No CMS default conversion actions were configured, so Growth Tools returned its default conversion scope.",
        ...(segmentationUnavailable ? { segmentationUnavailable: true } : {}),
        campaigns: rows,
        count: rows.length,
      },
    };
  },
};

function normaliseBreakdown(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [key, round2(Number(raw ?? 0))] as const)
    .filter(([key, n]) => key.trim().length > 0 && Number.isFinite(n) && n !== 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function parsePercent(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return round2(value > 1 ? value : value * 100);
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "--" || trimmed === "< 10%") return undefined;
  const numeric = Number(trimmed.replace(/[%<>,\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return round2(trimmed.includes("%") || numeric > 1 ? numeric : numeric * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
