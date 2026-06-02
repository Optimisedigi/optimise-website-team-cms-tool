/**
 * Tool: get_search_terms
 *
 * Wraps Growth Tools `/api/google-ads/search-terms`. Used by the agent to find
 * waste candidates (high spend, no conversions) before drafting negative
 * keywords via propose_negative_keywords.
 *
 * Default range: LAST_30_DAYS. Pass `range` to widen/narrow. Pass `segment`
 * ("month" | "week" | "day") for a per-period breakdown — one row per
 * (term, segment) pair instead of a single aggregated row per term.
 *
 * Upstream support: if Growth Tools is on an older build that doesn't honour
 * `segment`, the rows come back without a `segment` field and we surface
 * `segmentationUnavailable: true` so the agent can be honest with the user.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsGet } from "./_growth-tools";
import {
  SUPPORTED_PRESETS,
  resolveRangeWithSegment,
  customRangeForGrowthTools,
  type Segment,
} from "./_date-range";

interface SearchTermArgs {
  range?: string;
  minImpressions?: number;
  limit?: number;
  segment?: Segment;
}

interface SearchTermRaw {
  searchTerm?: string;
  query?: string;
  campaignName?: string;
  campaignId?: string;
  impressions?: number;
  clicks?: number;
  cost?: number;
  spend?: number;
  conversions?: number;
  conversionsByAction?: Record<string, number>;
  conversionsByCategory?: Record<string, number>;
  segment?: string;
}

interface SearchTermsEnvelope {
  searchTerms?: SearchTermRaw[];
  terms?: SearchTermRaw[];
  segmentation?: string;
}

export const getSearchTerms: CanonicalTool<SearchTermArgs> = {
  name: "get_search_terms",
  description:
    "Search queries that triggered ads on the linked account, with metrics. Args: range (optional preset OR custom 'YYYY-MM-DD..YYYY-MM-DD' OR 'Q1 2026'-style literal; default LAST_30_DAYS), minImpressions (default 0), limit (default 200, max 1000), segment ('month'|'week'|'day' — when set, returns one row per (term, segment) pair instead of a single total). Returns conversion breakdowns by configured category when available. Use to find wasted spend before proposing negative keywords.",
  inputSchema: {
    type: "object",
    properties: {
      range: {
        type: "string",
        description:
          "Date range. Either a preset (" +
          (SUPPORTED_PRESETS as readonly string[]).join(", ") +
          "), a custom 'YYYY-MM-DD..YYYY-MM-DD' span, 'Q1 2026'/'Q3-2025', or 'YTD'/'QTD'/'THIS_QUARTER'/'LAST_QUARTER'. Default LAST_30_DAYS.",
      },
      minImpressions: {
        type: "integer",
        minimum: 0,
        description: "Filter out terms with fewer impressions than this. Default 0.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 1000,
        description: "Max rows to return. Default 200.",
      },
      segment: {
        type: "string",
        enum: ["month", "week", "day"],
        description:
          "Optional per-row time segmentation. When set, the tool returns one row per (term, segment) pair so you can see January vs February vs March separately. Requires the upstream Growth Tools service to support segmentation; if it doesn't, the response will include segmentationUnavailable: true.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: SearchTermArgs = {};
    if (obj.range !== undefined && obj.range !== null) {
      out.range = String(obj.range);
    }
    if (obj.minImpressions !== undefined) {
      const n = Number(obj.minImpressions);
      if (!Number.isFinite(n) || n < 0) throw new Error("minImpressions must be >= 0");
      out.minImpressions = Math.floor(n);
    }
    if (obj.limit !== undefined) {
      const n = Number(obj.limit);
      if (!Number.isFinite(n) || n < 1) throw new Error("limit must be >= 1");
      out.limit = Math.min(1000, Math.floor(n));
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

    // Growth Tools' search-terms endpoint accepts either a preset enum or a
    // 'YYYY-MM-DD,YYYY-MM-DD' comma-span as `dateRange`. customRangeForGrowthTools
    // formats CUSTOM ranges as a comma-span; presets pass through unchanged.
    // We don't send startDate/endDate as separate params — Growth Tools
    // ignores them once the dateRange carries the span.
    const resolved = resolveRangeWithSegment(args.range, args.segment);
    const dateRangeParam = customRangeForGrowthTools(resolved);
    const limit = args.limit ?? 200;
    const minImpressions = args.minImpressions ?? 0;
    const conversionActions = (ctx.context.conversionActions as string | undefined) ?? "";
    const conversionActionCategories = (ctx.context.conversionActionCategories as string | undefined) ?? "";

    const qs = new URLSearchParams({
      customerId,
      dateRange: dateRangeParam,
      limit: String(limit),
    });
    if (conversionActions) qs.set("conversionActions", conversionActions);
    if (conversionActionCategories) qs.set("conversionActionCategories", conversionActionCategories);
    if (resolved.segment) qs.set("segment", resolved.segment);

    const res = await growthToolsGet<SearchTermsEnvelope>(
      `/api/google-ads/search-terms?${qs.toString()}`,
    );
    if (!res.ok) return { ok: false, error: res.error };

    const raw = res.data?.searchTerms ?? res.data?.terms ?? [];

    // Detect upstream segmentation support. If the caller asked for a segment
    // but the rows arrived without one, the upstream is on an older build
    // and silently ignored the arg — surface that so the agent can tell the
    // user totals are all we have.
    const upstreamReturnsSegment = raw.some((t) => typeof t.segment === "string" && t.segment.length > 0);
    const segmentationUnavailable =
      Boolean(resolved.segment) && raw.length > 0 && !upstreamReturnsSegment;

    const terms = raw
      .map((t) => {
        const term = String(t.searchTerm ?? t.query ?? "").trim();
        const impressions = Number(t.impressions ?? 0);
        const clicks = Number(t.clicks ?? 0);
        const spend = Number(t.cost ?? t.spend ?? 0);
        const conversions = Number(t.conversions ?? 0);
        return {
          term,
          campaignName: t.campaignName ?? "",
          segment: typeof t.segment === "string" ? t.segment : undefined,
          impressions,
          clicks,
          spend: round2(spend),
          conversions: round2(conversions),
          conversionsByAction: normaliseBreakdown(t.conversionsByAction),
          conversionsByCategory: normaliseBreakdown(t.conversionsByCategory),
          cpa: conversions > 0 ? round2(spend / conversions) : null,
        };
      })
      .filter((t) => t.term.length > 0 && t.impressions >= minImpressions);

    // When segmenting, sort by (term asc, segment asc) so consecutive rows
    // form a natural time series for each term. When not, sort by spend desc
    // (the historical default — waste-hunting use case).
    if (resolved.segment && upstreamReturnsSegment) {
      terms.sort((a, b) => {
        const t = a.term.localeCompare(b.term);
        if (t !== 0) return t;
        return (a.segment ?? "").localeCompare(b.segment ?? "");
      });
    } else {
      terms.sort((a, b) => b.spend - a.spend);
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
        count: terms.length,
        terms: terms.slice(0, limit),
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
