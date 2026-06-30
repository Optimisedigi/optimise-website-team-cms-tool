/**
 * get_weekly_metric_table tool.
 *
 * Mocks `fetch` for the Growth Tools `campaign-budgets/get-metrics` call (one
 * segmented request for the full weekly range). Verifies:
 *   - validate enforces the closed metrics catalogue, dupes collapse, cap 6
 *   - validate rejects unknown `compare` values; "wow" is the only accepted
 *   - validate clamps weeks + endDate like the deprecated tool
 *   - execute issues one segment=week call and folds the response into
 *     WeeklyBucketTotals (spend / clicks / impressions / conversions)
 *   - execute returns ok:true with html + rows + metrics reflecting deduped order
 *   - execute returns ok:false when the segmented fetch fails
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.GROWTH_TOOLS_URL = "http://growth.test";
process.env.INTERNAL_API_KEY = "test-internal-key";

const { getWeeklyMetricTable } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-weekly-metric-table"
);
import type { ToolContext } from "@/lib/agents/_shared/tool";
import type { WeeklyBucketRow } from "@/lib/google-ads-weekly-metric-table";

const baseCtx = (extra: Partial<ToolContext["context"]> = {}): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_weekly_metric",
  context: {
    customerId: "1234567890",
    conversionActions: "Phone Call,Form Submit",
    ...extra,
  },
  log: vi.fn(),
});

function metricsResponse(opts: {
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  week?: string;
}): Response {
  return segmentedMetricsResponse([{ ...opts, week: opts.week ?? "2026-05-11" }]);
}

function segmentedMetricsResponse(rows: Array<{
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  week: string;
}>): Response {
  return new Response(
    JSON.stringify({
      success: true,
      metrics: rows.map((row, index) => ({
        campaignId: `c${index + 1}`,
        cost: row.cost,
        clicks: row.clicks,
        impressions: row.impressions,
        conversions: row.conversions,
        segment: { week: row.week },
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  // @ts-expect-error - test override
  globalThis.fetch = vi.fn();
});

describe("get_weekly_metric_table - validation", () => {
  it("rejects empty / missing metrics", () => {
    expect(() =>
      getWeeklyMetricTable.validate!({ weeks: 4, endDate: "2026-05-17" }),
    ).toThrow(/metrics is required/);
    expect(() =>
      getWeeklyMetricTable.validate!({
        weeks: 4,
        endDate: "2026-05-17",
        metrics: [],
      }),
    ).toThrow(/metrics is required/);
  });

  it("rejects unknown metric keys with the list of valid choices", () => {
    expect(() =>
      getWeeklyMetricTable.validate!({
        weeks: 4,
        endDate: "2026-05-17",
        metrics: ["nope"],
      }),
    ).toThrow(/Unknown metric "nope"/);
  });

  it("collapses duplicates preserving first occurrence", () => {
    const args = getWeeklyMetricTable.validate!({
      weeks: 4,
      endDate: "2026-05-17",
      metrics: ["cpa", "cpa", "cpc"],
    });
    expect(args.metrics).toEqual(["cpa", "cpc"]);
  });

  it("caps metrics at 6", () => {
    expect(() =>
      getWeeklyMetricTable.validate!({
        weeks: 4,
        endDate: "2026-05-17",
        metrics: [
          "spend",
          "clicks",
          "impressions",
          "conversions",
          "cpa",
          "cpc",
          "ctr",
        ],
      }),
    ).toThrow(/may not exceed 6/);
  });

  it('rejects unknown compare values ("mom" is not allowed today)', () => {
    expect(() =>
      getWeeklyMetricTable.validate!({
        weeks: 4,
        endDate: "2026-05-17",
        metrics: ["cpa"],
        compare: "mom",
      }),
    ).toThrow(/compare must be "wow"/);
  });

  it('accepts compare="wow"', () => {
    const args = getWeeklyMetricTable.validate!({
      weeks: 4,
      endDate: "2026-05-17",
      metrics: ["cpc"],
      compare: "wow",
    });
    expect(args.compare).toBe("wow");
  });

  it("clamps weeks and endDate exactly like the deprecated tool", () => {
    expect(() =>
      getWeeklyMetricTable.validate!({
        weeks: 0,
        endDate: "2026-05-17",
        metrics: ["spend"],
      }),
    ).toThrow(/between 1 and 12/);
    expect(() =>
      getWeeklyMetricTable.validate!({
        weeks: 13,
        endDate: "2026-05-17",
        metrics: ["spend"],
      }),
    ).toThrow(/between 1 and 12/);
    expect(() =>
      getWeeklyMetricTable.validate!({
        weeks: 4,
        endDate: "2026/05/17",
        metrics: ["spend"],
      }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      getWeeklyMetricTable.validate!({
        weeks: 4,
        endDate: "2099-01-01",
        metrics: ["spend"],
      }),
    ).toThrow(/future/);
  });
});

describe("get_weekly_metric_table - execute", () => {
  it("issues one segmented fetch, folds response into WeeklyBucketTotals, returns html + rows", async () => {
    // 4 weeks ending Sun 2026-05-17.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        segmentedMetricsResponse([
          { cost: 700, clicks: 350, impressions: 7000, conversions: 10, week: "2026-04-20" },
          { cost: 1500, clicks: 600, impressions: 12_000, conversions: 10, week: "2026-04-27" },
          { cost: 2410, clicks: 800, impressions: 16_000, conversions: 5, week: "2026-05-04" },
          { cost: 800, clicks: 400, impressions: 8000, conversions: 8, week: "2026-05-11" },
        ]),
      );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getWeeklyMetricTable.validate!({
      weeks: 4,
      endDate: "2026-05-17",
      metrics: ["spend", "clicks", "impressions", "conversions", "cpa", "cpc"],
    });
    const result = await getWeeklyMetricTable.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Spot-check URL shape: one call hits the get-metrics endpoint with a
    // comma-span dateRange covering the full requested range, asks for weekly
    // segmentation, and threads conversionActions.
    const callUrl = String(fetchMock.mock.calls[0][0]);
    expect(callUrl).toContain("/api/google-ads/campaign-budgets/get-metrics?");
    expect(callUrl).toContain("dateRange=2026-04-20%2C2026-05-17");
    expect(callUrl).toContain("segment=week");
    expect(callUrl).toContain("conversionActions=Phone");

    const data = result.data as {
      html: string;
      rows: WeeklyBucketRow[];
      metrics: string[];
      compare?: string;
      endDate: string;
      weeks: number;
      warnings: string[];
    };
    expect(data.weeks).toBe(4);
    expect(data.endDate).toBe("2026-05-17");
    expect(data.rows).toHaveLength(4);

    // Spend / clicks / impressions / conversions all flow through into totals.
    expect(data.rows[0].totals).toEqual({
      spend: 700,
      clicks: 350,
      impressions: 7000,
      conversions: 10,
    });
    expect(data.rows[2].totals.spend).toBe(2410);
    expect(data.rows[2].totals.conversions).toBe(5);

    // metrics reflect the order passed in.
    expect(data.metrics).toEqual([
      "spend",
      "clicks",
      "impressions",
      "conversions",
      "cpa",
      "cpc",
    ]);

    // HTML contains the canonical styling + every requested column header.
    expect(data.html).toContain("<strong>Weekly Performance Trend</strong>");
    expect(data.html).toContain("font-family:Verdana,sans-serif");
    expect(data.html).toContain(">Spend<");
    expect(data.html).toContain(">Clicks<");
    expect(data.html).toContain(">Impressions<");
    expect(data.html).toContain(">Conversions<");
    expect(data.html).toContain(">CPA<");
    expect(data.html).toContain(">CPC<");
    expect(data.html).not.toContain("border-radius");
  });

  it("dedupes metrics and html reflects the deduped order", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        metricsResponse({ cost: 100, clicks: 50, impressions: 1000, conversions: 1 }),
      );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getWeeklyMetricTable.validate!({
      weeks: 1,
      endDate: "2026-05-17",
      metrics: ["cpa", "cpa", "cpc"],
    });
    const result = await getWeeklyMetricTable.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    const data = result.data as { metrics: string[]; html: string };
    expect(data.metrics).toEqual(["cpa", "cpc"]);
    // Header order: Week, CPA, CPC - no second CPA column.
    const cpaIdx = data.html.indexOf(">CPA<");
    const cpcIdx = data.html.indexOf(">CPC<");
    expect(cpaIdx).toBeGreaterThan(-1);
    expect(cpcIdx).toBeGreaterThan(cpaIdx);
    expect(data.html.indexOf(">CPA<", cpaIdx + 1)).toBe(-1);
  });

  it("accepts compare=\"wow\" but renders absolute metric columns only", async () => {
    // Two weeks: clicks 100 -> 200 (volume up, green).
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        segmentedMetricsResponse([
          { cost: 100, clicks: 100, impressions: 1000, conversions: 1, week: "2026-05-04" },
          { cost: 100, clicks: 200, impressions: 1000, conversions: 1, week: "2026-05-11" },
        ]),
      );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getWeeklyMetricTable.validate!({
      weeks: 2,
      endDate: "2026-05-17",
      metrics: ["clicks"],
      compare: "wow",
    });
    const result = await getWeeklyMetricTable.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    const data = result.data as { html: string; compare?: string };
    expect(data.compare).toBe("wow");
    expect(data.html).not.toMatch(/\u0394 vs prev/);
    expect(data.html).not.toMatch(/color:#(?:059669|dc2626)[^"]*">[+-]\d+\.0%/);
  });

  it("returns ok:false when the segmented fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream broken", { status: 500 }));
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getWeeklyMetricTable.validate!({
      weeks: 4,
      endDate: "2026-05-17",
      metrics: ["spend", "cpa"],
    });
    const result = await getWeeklyMetricTable.execute(args, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/500/);
  });

  it("returns ok:false when customerId is missing from context", async () => {
    const ctx: ToolContext = {
      agentName: "optimate-google-ads",
      agentRunId: "run_no_customer",
      context: {},
      log: vi.fn(),
    };
    const args = getWeeklyMetricTable.validate!({
      weeks: 4,
      endDate: "2026-05-17",
      metrics: ["spend"],
    });
    const result = await getWeeklyMetricTable.execute(args, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/customerId/);
  });

  it("does not warn for six metrics when compare=wow no longer adds delta columns", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        metricsResponse({ cost: 100, clicks: 50, impressions: 1000, conversions: 1 }),
      );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    // 6 metrics + compare="wow" still renders 1 + 6 = 7 columns because
    // compare is accepted for compatibility but no longer adds delta columns.
    const args = getWeeklyMetricTable.validate!({
      weeks: 1,
      endDate: "2026-05-17",
      metrics: ["spend", "clicks", "impressions", "conversions", "cpa", "cpc"],
      compare: "wow",
    });
    const result = await getWeeklyMetricTable.execute(args, baseCtx());
    expect(result.ok).toBe(true);
    const data = result.data as { warnings: string[] };
    expect(data.warnings).not.toContain("table_may_overflow_gmail");
  });
});
