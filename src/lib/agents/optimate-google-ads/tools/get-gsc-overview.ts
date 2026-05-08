/**
 * Tool: get_gsc_overview
 *
 * Google Search Console summary for the linked client over a chosen window:
 * total clicks, impressions, avg CTR, avg position, plus top keywords + pages.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { fetchSearchAnalytics } from "@/lib/gsc-service";
import { SUPPORTED_PRESETS, resolveRange } from "./_date-range";
import { getValidGscToken, rangeToDates } from "./_client-tokens";

interface GscOverviewArgs {
  range?: string;
}

export const getGscOverview: CanonicalTool<GscOverviewArgs> = {
  name: "get_gsc_overview",
  description:
    "Google Search Console summary for the linked client. Returns total clicks, impressions, avg CTR, avg position, plus top 10 keywords and top 10 pages by clicks. Default range LAST_30_DAYS. Requires the client to have GSC connected via OAuth.",
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
    const out: GscOverviewArgs = {};
    if (obj.range !== undefined && obj.range !== null) out.range = String(obj.range);
    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as string | number | undefined;
    const tokenRes = await getValidGscToken(clientId ?? null);
    if (!tokenRes.ok) return { ok: false, error: tokenRes.reason };

    const resolved = resolveRange(args.range);
    const { startDate, endDate } = rangeToDates(resolved.dateRange);

    try {
      const result = await fetchSearchAnalytics(tokenRes.accessToken, tokenRes.siteUrl, startDate, endDate);
      return {
        ok: true,
        data: {
          dateRange: resolved.dateRange,
          rangeLabel: resolved.label,
          ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
          period: { startDate, endDate },
          siteUrl: tokenRes.siteUrl,
          totals: {
            clicks: result.totalClicks,
            impressions: result.totalImpressions,
            avgCtr: result.avgCtr,
            avgPosition: result.avgPosition,
          },
          topKeywords: result.topKeywords.slice(0, 10),
          topPages: result.topPages.slice(0, 10),
        },
      };
    } catch (err) {
      return { ok: false, error: `GSC query failed: ${(err as Error).message}` };
    }
  },
};
