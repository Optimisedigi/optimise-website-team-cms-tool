/**
 * Tool: get_gsc_branded_split
 *
 * Splits GSC queries into brand vs non-brand using the brand keywords saved
 * on the client doc. Returns volume, CTR and position for each side, plus
 * the top 10 non-brand queries.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { fetchBrandedAnalytics } from "@/lib/gsc-service";
import { SUPPORTED_PRESETS, resolveRange, snapCustomToPreset } from "./_date-range";
import { getValidGscToken, rangeToDates } from "./_client-tokens";

interface BrandedSplitArgs {
  range?: string;
}

export const getGscBrandedSplit: CanonicalTool<BrandedSplitArgs> = {
  name: "get_gsc_branded_split",
  description:
    "Splits Google Search Console queries into brand vs non-brand using the linked client's saved brand keywords. Returns clicks/impressions/CTR/position for each side. Default range LAST_30_DAYS. Returns an error if the client has no brand keywords saved.",
  inputSchema: {
    type: "object",
    properties: {
      range: {
        type: "string",
        description: "Date range preset. Default LAST_30_DAYS. Supported: " + (SUPPORTED_PRESETS as readonly string[]).join(", "),
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: BrandedSplitArgs = {};
    if (obj.range !== undefined && obj.range !== null) out.range = String(obj.range);
    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as string | number | undefined;
    const tokenRes = await getValidGscToken(clientId ?? null);
    if (!tokenRes.ok) return { ok: false, error: tokenRes.reason };
    if (tokenRes.brandTerms.length === 0) {
      return { ok: false, error: "Client has no brandKeywords set; can't split brand vs non-brand. Add brand terms to the client and retry." };
    }

    // Snap CUSTOM → preset because rangeToDates() only knows presets.
    // See snapCustomToPreset comments.
    const resolved = snapCustomToPreset(resolveRange(args.range));
    const { startDate, endDate } = rangeToDates(resolved.dateRange);

    try {
      const result = await fetchBrandedAnalytics(tokenRes.accessToken, tokenRes.siteUrl, startDate, endDate, tokenRes.brandTerms);
      return {
        ok: true,
        data: {
          dateRange: resolved.dateRange,
          rangeLabel: resolved.label,
          ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
          period: { startDate, endDate },
          siteUrl: tokenRes.siteUrl,
          brandTerms: tokenRes.brandTerms,
          brand: result.brand,
          nonBrand: result.nonBrand,
        },
      };
    } catch (err) {
      return { ok: false, error: `GSC branded-split query failed: ${(err as Error).message}` };
    }
  },
};
