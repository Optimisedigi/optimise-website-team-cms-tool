/**
 * Tool: get_weekly_metric_table
 *
 * Canonical Gmail-ready weekly account-level metric table for any combination
 * of spend / clicks / impressions / conversions / cpa / cpc / ctr / conv_rate,
 * as absolute values only. Replaces the deprecated `get_weekly_trend_note`
 * (which is now a thin shim around this tool with a fixed metric set).
 *
 * Use this WHENEVER the user asks for "by week", "weekly", "week-on-week",
 * "trend", or a multi-week summary of any metric. NEVER hand-write trend HTML.
 *
 * Args:
 *   - weeks (1..12, default 4): how many Monday-anchored weeks to include.
 *   - endDate (ISO YYYY-MM-DD, default today UTC): inclusive end anchor.
 *   - metrics (1..6 entries, required): which columns to render. Order is
 *     preserved; duplicates collapse to first occurrence so the LLM cannot
 *     accidentally produce two CPA columns.
 *   - compare is accepted for old saved prompts but ignored; weekly uplift /
 *     delta columns are no longer rendered.

 *   - title (optional): overrides the default "Weekly Performance Trend"
 *     heading.
 *   - summary (optional, 1-3 sentences): plain text rendered as a paragraph
 *     under the table.
 *
 * Examples:
 *   - "CPC by week" -> metrics: ["cpc"]
 *   - "Spend / conversions / CPA trend" -> metrics: ["spend","conversions","cpa"]
 *
 * Data path:
 *   1. Build N empty week buckets via `buildWeeklyBuckets` so we know the
 *      bucket boundaries (weekStart..weekEnd).
 *   2. Issue ONE Growth Tools `campaign-budgets/get-metrics` call per bucket,
 *      summing cost / clicks / impressions / conversions across campaigns
 *      into a `WeeklyBucketTotals`.
 *   3. Re-call `buildWeeklyBuckets` with the per-bucket totals keyed on
 *      `weekStart` (renderer sums by date inside the bucket window; a single
 *      sample dated to `weekStart` covers the whole bucket).
 *   4. Render via `generateWeeklyMetricTableHtml`.
 *
 *   The Growth Tools `avgCpc` field is intentionally ignored - it's
 *   per-campaign, and using it directly would mean averaging averages.
 *   Account-level CPC is computed as `sum(cost) / sum(clicks)` in
 *   `computeMetric("cpc", totals)`.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsGet } from "./_growth-tools";
import {
  buildWeeklyBuckets,
  generateWeeklyMetricTableHtml,
  WEEKLY_METRIC_KEYS,
  type WeeklyBucketRow,
  type WeeklyBucketTotals,
  type WeeklyMetricKey,
} from "@/lib/google-ads-weekly-metric-table";

export interface WeeklyMetricTableArgs {
  weeks: number;
  endDate: string;
  metrics: WeeklyMetricKey[];
  compare?: "wow";
  title?: string;
  summary?: string;
}

interface MetricRaw {
  campaignId?: string;
  cost?: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
}

interface MetricsEnvelope {
  metrics?: MetricRaw[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_METRICS = 6;
const COLUMN_WARN_THRESHOLD = 10;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function todayUtcIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function tomorrowUtcIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function isWeeklyMetricKey(value: unknown): value is WeeklyMetricKey {
  return typeof value === "string" && (WEEKLY_METRIC_KEYS as readonly string[]).includes(value);
}

export const getWeeklyMetricTable: CanonicalTool<WeeklyMetricTableArgs> = {
  name: "get_weekly_metric_table",
  description:
    "Canonical Gmail-ready weekly account-level metric table. Renders any combination of these eight metrics by week (Verdana, plain row borders, no card chrome): spend, clicks, impressions, conversions, cpa, cpc, ctr, conv_rate. Weekly uplift / WoW delta columns are no longer rendered; the table shows absolute metric values only. Partial in-progress latest week is highlighted automatically. Args: weeks (1..12, default 4), endDate (ISO YYYY-MM-DD, default today UTC), metrics (1..6 keys from the list above, order preserved, dupes collapse), title (override heading), summary (optional 1-3 sentence note under the table). Use this WHENEVER the user asks for \"by week\", \"weekly\", \"week-on-week\", a trend, or a multi-week summary of any metric. NEVER hand-write trend HTML. Examples: metrics=[\"cpc\"] for a CPC trend; metrics=[\"spend\",\"conversions\",\"cpa\"] for the classic three-column trend.",
  inputSchema: {
    type: "object",
    properties: {
      weeks: {
        type: "number",
        description:
          "Number of Monday-anchored weeks ending at endDate. 1 to 12. Default 4.",
      },
      endDate: {
        type: "string",
        description:
          "Inclusive ISO YYYY-MM-DD end anchor. Default today (UTC). Use this when the user asks for 'trend ending last Sunday' to get four clean full weeks with no partial highlight row.",
      },
      metrics: {
        type: "array",
        items: {
          type: "string",
          enum: WEEKLY_METRIC_KEYS as unknown as string[],
        },
        minItems: 1,
        maxItems: MAX_METRICS,
        description:
          "Required. 1..6 metric keys to render as columns, in display order. Allowed: spend, clicks, impressions, conversions, cpa, cpc, ctr, conv_rate. Duplicates collapse to first occurrence.",
      },
      compare: {
        type: "string",
        enum: ["wow"],
        description:
          "Deprecated compatibility input. Accepted but ignored; weekly tables now render absolute metric values only, with no uplift / delta columns.",
      },
      title: {
        type: "string",
        description:
          "Optional. Overrides the default 'Weekly Performance Trend' heading above the table.",
      },
      summary: {
        type: "string",
        description:
          "Optional 1-3 sentence plain-text note rendered as a paragraph below the table. Keep it tight and factual. No HTML.",
      },
    },
    required: ["metrics"],
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

    // weeks: default 4, clamp to [1, 12].
    let weeks = 4;
    if (obj.weeks !== undefined && obj.weeks !== null) {
      const n = Number(obj.weeks);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new Error("weeks must be an integer between 1 and 12");
      }
      if (n < 1 || n > 12) {
        throw new Error("weeks must be between 1 and 12 inclusive");
      }
      weeks = n;
    }

    // endDate: default today (UTC), must be ISO YYYY-MM-DD, must be <= today+1.
    let endDate = todayUtcIso();
    if (obj.endDate !== undefined && obj.endDate !== null && obj.endDate !== "") {
      const s = String(obj.endDate);
      if (!ISO_DATE_RE.test(s)) {
        throw new Error("endDate must be in YYYY-MM-DD format");
      }
      const parsed = new Date(`${s}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("endDate is not a valid calendar date");
      }
      // Reject dates more than one day in the future (defensive - accidental
      // future dates from the LLM should fail loudly, not silently report
      // empty data).
      if (s > tomorrowUtcIso()) {
        throw new Error("endDate cannot be more than 1 day in the future");
      }
      endDate = s;
    }

    // metrics: required, non-empty, valid keys only, deduped preserving
    // first occurrence, capped at MAX_METRICS to keep the table readable.
    if (!Array.isArray(obj.metrics) || obj.metrics.length === 0) {
      throw new Error(
        `metrics is required and must be a non-empty array of: ${WEEKLY_METRIC_KEYS.join(", ")}`,
      );
    }
    const seen = new Set<WeeklyMetricKey>();
    const metrics: WeeklyMetricKey[] = [];
    for (const m of obj.metrics) {
      if (!isWeeklyMetricKey(m)) {
        throw new Error(
          `Unknown metric "${String(m)}". Valid: ${WEEKLY_METRIC_KEYS.join(", ")}`,
        );
      }
      if (seen.has(m)) continue;
      seen.add(m);
      metrics.push(m);
    }
    if (metrics.length > MAX_METRICS) {
      throw new Error(`metrics may not exceed ${MAX_METRICS} entries`);
    }

    // compare: deprecated compatibility input. Still accepted so old scheduled
    // prompts do not fail, but the renderer ignores it.
    let compare: "wow" | undefined;
    if (obj.compare !== undefined && obj.compare !== null && obj.compare !== "") {
      if (obj.compare !== "wow") {
        throw new Error('compare must be "wow" (only value supported today)');
      }
      compare = "wow";
    }

    let title: string | undefined;
    if (obj.title !== undefined && obj.title !== null) {
      const t = String(obj.title).trim();
      if (t.length > 0) title = t;
    }

    let summary: string | undefined;
    if (obj.summary !== undefined && obj.summary !== null) {
      const t = String(obj.summary).trim();
      if (t.length > 0) summary = t;
    }

    return { weeks, endDate, metrics, compare, title, summary };
  },
  execute: async (args, ctx) => {
    let customerId: string;
    try {
      customerId = ensureCustomerId(ctx.context.customerId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    // Pre-build the week buckets with an empty perDay series so we know the
    // bucket boundaries. Then issue one Growth Tools call per bucket.
    const emptyRows = buildWeeklyBuckets({
      perDay: [],
      weeks: args.weeks,
      endDate: args.endDate,
    });

    const conversionActions =
      (ctx.context.conversionActions as string | undefined) ?? "";

    const fetches = emptyRows.map((row) =>
      fetchWeekTotals(customerId, row, conversionActions),
    );
    const results = await Promise.all(fetches);

    // Any single failure short-circuits - we don't render half-empty trend
    // tables and pretend they're complete.
    for (const r of results) {
      if (!r.ok) {
        return { ok: false, error: r.error };
      }
    }

    // Compose a per-day series with one row per bucket dated to weekStart.
    // The renderer sums anything between weekStart and weekEnd inclusive.
    const perDay = results.map((r, i) => ({
      date: emptyRows[i].weekStart,
      spend: r.ok ? r.totals.spend : 0,
      clicks: r.ok ? r.totals.clicks : 0,
      impressions: r.ok ? r.totals.impressions : 0,
      conversions: r.ok ? r.totals.conversions : 0,
    }));

    const rows: WeeklyBucketRow[] = buildWeeklyBuckets({
      perDay,
      weeks: args.weeks,
      endDate: args.endDate,
    });

    const html = generateWeeklyMetricTableHtml({
      rows,
      metrics: args.metrics,
      compare: args.compare,
      title: args.title,
      summary: args.summary,
    });

    // Soft-warn when the table is likely to overflow Gmail's ~700px width.
    // Column count = 1 (Week) + metrics. Deprecated compare input is ignored.
    const columnCount = 1 + args.metrics.length;
    const warnings: string[] = [];
    if (columnCount > COLUMN_WARN_THRESHOLD) {
      warnings.push("table_may_overflow_gmail");
    }

    return {
      ok: true,
      data: {
        html,
        rows,
        metrics: args.metrics,
        compare: args.compare,
        endDate: args.endDate,
        weeks: rows.length,
        warnings,
      },
    };
  },
};

interface WeekTotalsOk {
  ok: true;
  totals: WeeklyBucketTotals;
}
interface WeekTotalsErr {
  ok: false;
  error: string;
}

async function fetchWeekTotals(
  customerId: string,
  row: WeeklyBucketRow,
  conversionActions: string,
): Promise<WeekTotalsOk | WeekTotalsErr> {
  const dateRangeParam = `${row.weekStart},${row.weekEnd}`;
  const qs = new URLSearchParams({ customerId, dateRange: dateRangeParam });
  if (conversionActions) qs.set("conversionActions", conversionActions);

  const res = await growthToolsGet<MetricsEnvelope>(
    `/api/google-ads/campaign-budgets/get-metrics?${qs.toString()}`,
  );
  if (!res.ok) return { ok: false, error: res.error ?? "Growth Tools call failed" };

  const totals: WeeklyBucketTotals = {
    spend: 0,
    clicks: 0,
    impressions: 0,
    conversions: 0,
  };
  for (const m of res.data?.metrics ?? []) {
    totals.spend += Number(m.cost ?? m.spend ?? 0);
    totals.clicks += Number(m.clicks ?? 0);
    totals.impressions += Number(m.impressions ?? 0);
    totals.conversions += Number(m.conversions ?? 0);
  }
  return { ok: true, totals };
}
