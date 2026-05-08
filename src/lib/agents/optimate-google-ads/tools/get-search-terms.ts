/**
 * Tool: get_search_terms
 *
 * Wraps Growth Tools `/api/google-ads/search-terms`. Used by the agent to find
 * waste candidates (high spend, no conversions) before drafting negative
 * keywords via propose_negative_keywords.
 *
 * Default range: LAST_30_DAYS. Pass `range` to widen/narrow.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsGet } from "./_growth-tools";
import { SUPPORTED_PRESETS, resolveRange } from "./_date-range";

interface SearchTermArgs {
  range?: string;
  minImpressions?: number;
  limit?: number;
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
}

interface SearchTermsEnvelope {
  searchTerms?: SearchTermRaw[];
  terms?: SearchTermRaw[];
}

export const getSearchTerms: CanonicalTool<SearchTermArgs> = {
  name: "get_search_terms",
  description:
    "Search queries that triggered ads on the linked account, with metrics. Args: range (optional preset, default LAST_30_DAYS), minImpressions (default 0), limit (default 200, max 1000). Use to find wasted spend before proposing negative keywords.",
  inputSchema: {
    type: "object",
    properties: {
      range: {
        type: "string",
        description:
          "Date range preset. Default LAST_30_DAYS. Supported: " +
          (SUPPORTED_PRESETS as readonly string[]).join(", ") +
          ".",
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
    return out;
  },
  execute: async (args, ctx) => {
    let customerId: string;
    try {
      customerId = ensureCustomerId(ctx.context.customerId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const resolved = resolveRange(args.range);
    const limit = args.limit ?? 200;
    const minImpressions = args.minImpressions ?? 0;
    const conversionActions = (ctx.context.conversionActions as string | undefined) ?? "";

    const qs = new URLSearchParams({
      customerId,
      dateRange: resolved.dateRange,
      limit: String(limit),
    });
    if (conversionActions) qs.set("conversionActions", conversionActions);

    const res = await growthToolsGet<SearchTermsEnvelope>(
      `/api/google-ads/search-terms?${qs.toString()}`,
    );
    if (!res.ok) return { ok: false, error: res.error };

    const raw = res.data?.searchTerms ?? res.data?.terms ?? [];
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
          impressions,
          clicks,
          spend: round2(spend),
          conversions: round2(conversions),
          cpa: conversions > 0 ? round2(spend / conversions) : null,
        };
      })
      .filter((t) => t.term.length > 0 && t.impressions >= minImpressions);

    terms.sort((a, b) => b.spend - a.spend);

    return {
      ok: true,
      data: {
        dateRange: resolved.dateRange,
        rangeLabel: resolved.label,
        ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
        count: terms.length,
        terms: terms.slice(0, limit),
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
