import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.GROWTH_TOOLS_URL = "http://growth.test";
process.env.INTERNAL_API_KEY = "test-internal-key";

const { getMonthlyMetricTable } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-monthly-metric-table"
);
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (extra: Partial<ToolContext["context"]> = {}): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_monthly_metric",
  context: {
    customerId: "823-056-3869",
    conversionActions: "Phone Call,Form Submit",
    ...extra,
  },
  log: vi.fn(),
});

function metricsResponse(rows: Array<{ cost: number; clicks: number; impressions: number; conversions: number; ctr?: number }>): Response {
  return new Response(JSON.stringify({ success: true, metrics: rows }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  // @ts-expect-error - test override
  globalThis.fetch = vi.fn();
});

describe("get_monthly_metric_table", () => {
  it("validates month span and metric keys", () => {
    expect(() => getMonthlyMetricTable.validate!({ metrics: [] })).toThrow(/metrics is required/);
    expect(() => getMonthlyMetricTable.validate!({ metrics: ["ctr"], startMonth: "2026/04" })).toThrow(/YYYY-MM/);
    expect(() => getMonthlyMetricTable.validate!({ metrics: ["invalid"] })).toThrow(/Unknown metric/);
    expect(() => getMonthlyMetricTable.validate!({ metrics: ["ctr"], startMonth: "2026-05", endMonth: "2026-04" })).toThrow(/before or equal/);

    const args = getMonthlyMetricTable.validate!({
      metrics: ["ctr", "ctr", "clicks"],
      startMonth: "2026-04",
      endMonth: "2026-05",
    });
    expect(args.metrics).toEqual(["ctr", "clicks"]);
  });

  it("fetches one month at a time and uses Google Ads CTR weighted by impressions", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        metricsResponse([
          { cost: 100, clicks: 255, impressions: 10_000, conversions: 2, ctr: 2.55 },
          { cost: 200, clicks: 745, impressions: 40_000, conversions: 3, ctr: 1.8625 },
        ]),
      )
      .mockResolvedValueOnce(
        metricsResponse([
          { cost: 300, clicks: 1_615, impressions: 27_139, conversions: 4, ctr: 5.950845646412838 },
          { cost: 50, clicks: 264, impressions: 105_270, conversions: 0, ctr: 0.25078379405348153 },
        ]),
      );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getMonthlyMetricTable.validate!({
      startMonth: "2026-04",
      endMonth: "2026-05",
      metrics: ["clicks", "impressions", "ctr"],
    });
    const result = await getMonthlyMetricTable.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain("customerId=8230563869");
    expect(urls[0]).toContain("dateRange=2026-04-01%2C2026-04-30");
    expect(urls[1]).toContain("dateRange=2026-05-01%2C2026-05-31");

    const data = result.data as {
      derivationRule: string;
      rows: Array<{
        month: string;
        totals: { clicks: number; impressions: number };
        metrics: { ctr: number | null };
        validation: { ctrFormula: string };
      }>;
      markdownTable: string;
    };
    expect(data.derivationRule).toContain("CTR uses Google Ads metrics.ctr");
    expect(data.rows[0]).toMatchObject({
      month: "2026-04",
      totals: { clicks: 1000, impressions: 50_000 },
      metrics: { ctr: 2 },
    });
    expect(data.rows[1]).toMatchObject({
      month: "2026-05",
      totals: { clicks: 1879, impressions: 132_409 },
      metrics: { ctr: 1.42 },
    });
    expect(data.rows[1].validation.ctrFormula).toBe("Google Ads metrics.ctr weighted by 132409 impressions = 1.42%");
    expect(data.markdownTable).toContain("May 2026 | 1,879 | 132,409 | 1.42%");
  });

  it("fails closed for CTR when Growth Tools does not return Google Ads CTR", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      metricsResponse([{ cost: 300, clicks: 100, impressions: 10_000, conversions: 2 }]),
    );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getMonthlyMetricTable.validate!({
      startMonth: "2026-05",
      endMonth: "2026-05",
      metrics: ["ctr"],
    });
    const result = await getMonthlyMetricTable.execute(args, baseCtx());

    expect(result.ok).toBe(false);
    expect(result.error).toContain("did not return Google Ads CTR");
  });
});
