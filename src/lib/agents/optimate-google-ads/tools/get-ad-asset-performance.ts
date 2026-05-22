/**
 * Tool: get_ad_asset_performance
 *
 * Per-text-asset (HEADLINE / DESCRIPTION) performance within RSAs. Pulled
 * from Growth Tools `/api/google-ads/ad-asset-performance`, which queries
 * Google Ads' `ad_group_ad_asset_view` resource — the canonical source for
 * impressions/clicks/CTR/conversions broken down by asset within an ad.
 *
 * The primary consumer is **Goal 2 — Ad CTR Improver**. The constraint rules
 * for that goal (see goal-agents-architecture-and-build-plan.md §5.2) require
 * comparing headline CTRs *within the same ad group* and replacing the worst
 * 1–2 outliers. This tool surfaces exactly that data.
 *
 * The response shape mirrors Google Ads' field names (`adId`, `assetId`,
 * `fieldType`, `performanceLabel`, etc.) so the CMS tool wrapper stays a thin
 * passthrough over the upstream endpoint.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsGet } from "./_growth-tools";
import {
  SUPPORTED_PRESETS,
  resolveRangeWithSegment,
  customRangeForGrowthTools,
} from "./_date-range";

type FieldType = "HEADLINE" | "DESCRIPTION" | "ALL";

interface AdAssetPerfArgs {
  range?: string;
  adGroupIds?: string[];
  fieldType?: FieldType;
  limit?: number;
}

interface AdAssetRow {
  adId: string;
  adResourceName: string;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  assetId: string;
  assetResourceName: string;
  text: string;
  fieldType: string;
  performanceLabel: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  /** 0–1 fraction (Google's `metrics.ctr` is already a ratio). */
  ctr: number;
}

interface AdAssetEnvelope {
  success?: boolean;
  assets?: AdAssetRow[];
  count?: number;
  dateRange?: string;
  fieldType?: string;
  adGroupIds?: string[] | null;
}

export const getAdAssetPerformance: CanonicalTool<AdAssetPerfArgs> = {
  name: "get_ad_asset_performance",
  description:
    "Per-headline (or description) RSA asset metrics for the linked account. Returns impressions, clicks, CTR, conversions and Google's BEST/GOOD/LOW performance label for each text asset, so the agent can compare headlines within an ad group and identify the worst 1–2 candidates for replacement. Args: range (optional preset OR 'YYYY-MM-DD..YYYY-MM-DD' OR 'Q1 2026'/'YTD' literal; default LAST_30_DAYS), adGroupIds (optional array of numeric ad group IDs — strongly recommended, account-wide queries are expensive), fieldType ('HEADLINE'|'DESCRIPTION'|'ALL'; default 'HEADLINE'), limit (default 200, max 1000). Used primarily by the Ad CTR Improver goal.",
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
      adGroupIds: {
        type: "array",
        items: { type: "string", minLength: 1 },
        maxItems: 50,
        description:
          "Optional numeric ad group IDs to scope the query. Strongly recommended — account-wide asset queries can be slow and burn quota.",
      },
      fieldType: {
        type: "string",
        enum: ["HEADLINE", "DESCRIPTION", "ALL"],
        description:
          "Which RSA text asset slot to return metrics for. Default HEADLINE — the primary signal for CTR optimisation.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 1000,
        description: "Max rows to return after sorting by impressions desc. Default 200.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: AdAssetPerfArgs = {};

    if (obj.range !== undefined && obj.range !== null) {
      out.range = String(obj.range);
    }

    if (obj.adGroupIds !== undefined && obj.adGroupIds !== null) {
      if (!Array.isArray(obj.adGroupIds)) {
        throw new Error("adGroupIds must be an array of strings");
      }
      const ids = obj.adGroupIds
        .map((v) => String(v).trim().replace(/[^0-9]/g, ""))
        .filter((s) => s.length > 0);
      if (ids.length > 0) {
        // Dedup while preserving order — same defence the upstream applies.
        out.adGroupIds = Array.from(new Set(ids));
      }
    }

    if (obj.fieldType !== undefined && obj.fieldType !== null) {
      const f = String(obj.fieldType).toUpperCase();
      if (f !== "HEADLINE" && f !== "DESCRIPTION" && f !== "ALL") {
        throw new Error("fieldType must be 'HEADLINE', 'DESCRIPTION', or 'ALL'");
      }
      out.fieldType = f as FieldType;
    }

    if (obj.limit !== undefined && obj.limit !== null) {
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

    // No segmentation support on the upstream endpoint — assets are an
    // entity-level resource, not a time series. Resolve only for date range.
    const resolved = resolveRangeWithSegment(args.range ?? "LAST_30_DAYS", undefined);
    const dateRangeParam = customRangeForGrowthTools(resolved);
    const fieldType: FieldType = args.fieldType ?? "HEADLINE";
    const limit = args.limit ?? 200;

    const qs = new URLSearchParams({
      customerId,
      dateRange: dateRangeParam,
      fieldType,
    });
    if (args.adGroupIds && args.adGroupIds.length > 0) {
      qs.set("adGroupIds", args.adGroupIds.join(","));
    }

    const res = await growthToolsGet<AdAssetEnvelope>(
      `/api/google-ads/ad-asset-performance?${qs.toString()}`,
    );
    if (!res.ok) return { ok: false, error: res.error };

    const assetsRaw = res.data?.assets ?? [];

    // Round cost and CTR to a stable precision (avoids agent noise comparing
    // 0.01432139... to 0.01432140...). Growth Tools already rounds cost to
    // 2dp; this is belt-and-braces.
    const assets = assetsRaw.slice(0, limit).map((a) => ({
      adId: String(a.adId ?? ""),
      adResourceName: String(a.adResourceName ?? ""),
      adGroupId: String(a.adGroupId ?? ""),
      adGroupName: String(a.adGroupName ?? ""),
      campaignId: String(a.campaignId ?? ""),
      campaignName: String(a.campaignName ?? ""),
      assetId: String(a.assetId ?? ""),
      assetResourceName: String(a.assetResourceName ?? ""),
      text: String(a.text ?? ""),
      fieldType: String(a.fieldType ?? ""),
      performanceLabel: String(a.performanceLabel ?? "PENDING"),
      impressions: Number(a.impressions ?? 0),
      clicks: Number(a.clicks ?? 0),
      cost: round2(Number(a.cost ?? 0)),
      conversions: Number(a.conversions ?? 0),
      ctr: round4(Number(a.ctr ?? 0)),
    }));

    return {
      ok: true,
      data: {
        dateRange: resolved.dateRange,
        rangeLabel: resolved.label,
        ...(resolved.startDate ? { startDate: resolved.startDate, endDate: resolved.endDate } : {}),
        ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
        fieldType,
        ...(args.adGroupIds && args.adGroupIds.length > 0
          ? { adGroupIds: args.adGroupIds }
          : {}),
        count: assets.length,
        assets,
      },
    };
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
