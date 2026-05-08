/**
 * Tool: get_ga4_overview
 *
 * GA4 traffic + engagement overview for the linked client. Wraps
 * lib/ga4-service.fetchGa4Report and trims the response to what's useful in
 * a chat context (overview totals + top channels + headline KPIs).
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { fetchGa4Report } from "@/lib/ga4-service";
import { SUPPORTED_PRESETS, resolveRange } from "./_date-range";
import { getValidGa4Token, rangeToDates } from "./_client-tokens";

interface Ga4OverviewArgs {
  range?: string;
}

export const getGa4Overview: CanonicalTool<Ga4OverviewArgs> = {
  name: "get_ga4_overview",
  description:
    "GA4 site traffic + engagement summary for the linked client over a chosen window. Returns users, new users, sessions, pageviews, bounce rate, engagement rate, conversions, plus a top-channels breakdown. Default range LAST_30_DAYS. Requires the client to have GA4 connected via OAuth.",
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
    const out: Ga4OverviewArgs = {};
    if (obj.range !== undefined && obj.range !== null) out.range = String(obj.range);
    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as string | number | undefined;
    const tokenRes = await getValidGa4Token(clientId ?? null);
    if (!tokenRes.ok) return { ok: false, error: tokenRes.reason };

    const resolved = resolveRange(args.range);
    const { startDate, endDate } = rangeToDates(resolved.dateRange);

    let report: Awaited<ReturnType<typeof fetchGa4Report>>;
    try {
      report = await fetchGa4Report(tokenRes.accessToken, tokenRes.propertyId, startDate, endDate);
    } catch (err) {
      return { ok: false, error: `GA4 query failed: ${(err as Error).message}` };
    }

    return {
      ok: true,
      data: {
        dateRange: resolved.dateRange,
        rangeLabel: resolved.label,
        ...(resolved.coercedFrom ? { coercedFrom: resolved.coercedFrom, note: resolved.note } : {}),
        period: { startDate: report.periodStart, endDate: report.periodEnd },
        overview: report.overview,
        topChannels: report.channels.slice(0, 8),
        topPages: report.topPages.slice(0, 8),
      },
    };
  },
};
