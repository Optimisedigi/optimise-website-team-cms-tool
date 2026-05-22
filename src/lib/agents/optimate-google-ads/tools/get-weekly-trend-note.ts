/**
 * Tool: get_weekly_trend_note  (DEPRECATED - kept for one release)
 *
 * Thin wrapper around `get_weekly_metric_table` with the legacy fixed metric
 * set ["spend","conversions","cpa"] and no `compare`. Preserves byte-identical
 * HTML for any scheduled task that referenced the old tool while the LLM
 * migrates to the multi-metric replacement.
 *
 * To migrate: call `get_weekly_metric_table` with
 *   metrics: ["spend","conversions","cpa"]
 * (and optionally `compare: "wow"`).
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import {
  getWeeklyMetricTable,
  type WeeklyMetricTableArgs,
} from "./get-weekly-metric-table";
import {
  computeMetric,
  type WeeklyBucketRow,
} from "@/lib/google-ads-weekly-metric-table";

interface WeeklyTrendArgs {
  weeks: number;
  endDate: string;
  summary?: string;
}

export const getWeeklyTrendNote: CanonicalTool<WeeklyTrendArgs> = {
  name: "get_weekly_trend_note",
  description:
    "[Deprecated] Use `get_weekly_metric_table` with metrics: [\"spend\",\"conversions\",\"cpa\"]. Same Gmail-ready 'Weekly Performance Trend' table, more flexible. Kept for one release for scheduled-task compatibility.",
  inputSchema: {
    type: "object",
    properties: {
      weeks: {
        type: "number",
        description: "Monday-anchored weeks ending at endDate. 1 to 12. Default 4.",
      },
      endDate: {
        type: "string",
        description: "Inclusive ISO YYYY-MM-DD end anchor. Default today (UTC).",
      },
      summary: {
        type: "string",
        description: "Optional 1-3 sentence note rendered under the table. No HTML.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    // Delegate validation by piping the legacy args through the new
    // validator with the fixed metric set bolted on. Any rejection (bad
    // weeks / endDate) bubbles up identically to the old tool.
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const validated = getWeeklyMetricTable.validate!({
      ...obj,
      metrics: ["spend", "conversions", "cpa"],
    }) as WeeklyMetricTableArgs;
    return {
      weeks: validated.weeks,
      endDate: validated.endDate,
      summary: validated.summary,
    };
  },
  execute: async (args, ctx) => {
    const result = await getWeeklyMetricTable.execute(
      {
        weeks: args.weeks,
        endDate: args.endDate,
        metrics: ["spend", "conversions", "cpa"],
        summary: args.summary,
      },
      ctx,
    );
    if (!result.ok) return result;
    // Project rows back to the legacy `WeeklyTrendRow` shape so any caller
    // (incl. existing test fixtures, scheduled tasks) sees spend / conversions
    // / cpa flat on the row instead of nested under totals.
    const data = result.data as {
      html: string;
      rows: WeeklyBucketRow[];
      endDate: string;
      weeks: number;
    };
    return {
      ok: true,
      data: {
        html: data.html,
        rows: data.rows.map((r) => ({
          weekStart: r.weekStart,
          weekEnd: r.weekEnd,
          label: r.label,
          partial: r.partial,
          spend: r.totals.spend,
          conversions: r.totals.conversions,
          cpa: computeMetric("cpa", r.totals),
        })),
        endDate: data.endDate,
        weeks: data.weeks,
      },
    };
  },
};
