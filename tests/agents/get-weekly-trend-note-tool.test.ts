/**
 * get_weekly_trend_note tool.
 *
 * Mocks `fetch` for the Growth Tools `campaign-budgets/get-metrics` call (one
 * per week bucket). Verifies:
 *   - validate clamps weeks to [1, 12] and rejects malformed / future endDate
 *   - execute issues one call per week with the correct comma-span dateRange
 *   - execute returns ok:true with rows + the canonical HTML
 *   - execute returns ok:false when any underlying call fails
 *   - execute returns ok:false when customerId is missing from context
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// `_growth-tools.ts` reads INTERNAL_API_KEY at module-load time, so we must
// set it BEFORE importing the tool.
process.env.GROWTH_TOOLS_URL = "http://growth.test";
process.env.INTERNAL_API_KEY = "test-internal-key";

const { getWeeklyTrendNote } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-weekly-trend-note"
);
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (extra: Partial<ToolContext["context"]> = {}): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_weekly_trend",
  context: {
    customerId: "1234567890",
    conversionActions: "Phone Call,Form Submit",
    ...extra,
  },
  log: vi.fn(),
});

function metricsResponse(spend: number, conversions: number): Response {
  return new Response(
    JSON.stringify({
      success: true,
      metrics: [
        { campaignId: "c1", cost: spend, conversions },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeEach(() => {
  // @ts-expect-error - test override
  globalThis.fetch = vi.fn();
});

describe("get_weekly_trend_note - validation", () => {
  it("accepts the boundary weeks values 1 and 12", () => {
    expect(() => getWeeklyTrendNote.validate!({ weeks: 1, endDate: "2026-05-17" })).not.toThrow();
    expect(() => getWeeklyTrendNote.validate!({ weeks: 12, endDate: "2026-05-17" })).not.toThrow();
  });

  it("rejects weeks < 1 and weeks > 12", () => {
    expect(() => getWeeklyTrendNote.validate!({ weeks: 0, endDate: "2026-05-17" })).toThrow(
      /between 1 and 12/,
    );
    expect(() => getWeeklyTrendNote.validate!({ weeks: 13, endDate: "2026-05-17" })).toThrow(
      /between 1 and 12/,
    );
  });

  it("rejects non-integer weeks", () => {
    expect(() => getWeeklyTrendNote.validate!({ weeks: 4.5, endDate: "2026-05-17" })).toThrow(
      /integer/,
    );
  });

  it("defaults weeks to 4 when omitted", () => {
    const args = getWeeklyTrendNote.validate!({ endDate: "2026-05-17" });
    expect(args.weeks).toBe(4);
  });

  it("rejects malformed endDate (not YYYY-MM-DD)", () => {
    expect(() => getWeeklyTrendNote.validate!({ weeks: 4, endDate: "May 21" })).toThrow(
      /YYYY-MM-DD/,
    );
    expect(() => getWeeklyTrendNote.validate!({ weeks: 4, endDate: "2026/05/21" })).toThrow(
      /YYYY-MM-DD/,
    );
  });

  it("rejects endDate more than 1 day in the future", () => {
    const farFuture = "2099-01-01";
    expect(() => getWeeklyTrendNote.validate!({ weeks: 4, endDate: farFuture })).toThrow(
      /future/,
    );
  });

  it("accepts today and yesterday for endDate", () => {
    const today = new Date();
    const iso = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    expect(() => getWeeklyTrendNote.validate!({ weeks: 4, endDate: iso(today) })).not.toThrow();
    expect(() => getWeeklyTrendNote.validate!({ weeks: 4, endDate: iso(yesterday) })).not.toThrow();
  });

  it("defaults endDate to today when omitted", () => {
    const args = getWeeklyTrendNote.validate!({ weeks: 4 });
    expect(args.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("get_weekly_trend_note - execute", () => {
  it("issues one fetch per week with the correct comma-span dateRange and returns rendered HTML + rows", async () => {
    // 4 weeks ending Sun 2026-05-17:
    //   - 2026-04-20..2026-04-26
    //   - 2026-04-27..2026-05-03
    //   - 2026-05-04..2026-05-10
    //   - 2026-05-11..2026-05-17
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(metricsResponse(700, 10)) // week 1: CPA $70 (green)
      .mockResolvedValueOnce(metricsResponse(1500, 10)) // week 2: CPA $150 (amber)
      .mockResolvedValueOnce(metricsResponse(2410, 5)) // week 3: CPA $482 (red)
      .mockResolvedValueOnce(metricsResponse(800, 8)); // week 4: CPA $100 (amber)
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getWeeklyTrendNote.validate!({ weeks: 4, endDate: "2026-05-17" });
    const result = await getWeeklyTrendNote.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Spot-check the URL shape: each call hits the get-metrics endpoint with
    // a comma-span dateRange covering one week.
    const callUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(callUrls[0]).toContain(
      "/api/google-ads/campaign-budgets/get-metrics?",
    );
    expect(callUrls[0]).toContain("customerId=1234567890");
    expect(callUrls[0]).toContain("dateRange=2026-04-20%2C2026-04-26");
    expect(callUrls[3]).toContain("dateRange=2026-05-11%2C2026-05-17");
    // conversionActions threaded through from context.
    expect(callUrls[0]).toContain("conversionActions=Phone");

    const data = result.data as {
      html: string;
      rows: Array<{ weekStart: string; weekEnd: string; spend: number; conversions: number; cpa: number | null; partial: boolean }>;
      weeks: number;
      endDate: string;
    };
    expect(data.weeks).toBe(4);
    expect(data.endDate).toBe("2026-05-17");
    expect(data.rows).toHaveLength(4);
    expect(data.rows[0].weekStart).toBe("2026-04-20");
    expect(data.rows[3].weekEnd).toBe("2026-05-17");
    expect(data.rows[3].partial).toBe(false);
    expect(data.rows[0].spend).toBe(700);
    expect(data.rows[0].cpa).toBe(70);
    expect(data.rows[2].spend).toBe(2410);
    expect(data.rows[2].cpa).toBe(482);

    // HTML carries the canonical styling.
    expect(data.html).toContain("<strong>Weekly Performance Trend</strong>");
    expect(data.html).toContain("font-family:Verdana,sans-serif");
    expect(data.html).toContain("color:#222");
    expect(data.html).not.toContain("border-radius");
    // Green for $70, red for $482.
    expect(data.html).toMatch(/color:#059669[^"]*">\s*\$70/);
    expect(data.html).toMatch(/color:#dc2626[^"]*">\s*\$482/);
  });

  it("flags the latest row as partial and applies highlight when endDate is mid-week", async () => {
    // 2 weeks ending Thu 2026-05-21 → latest row 2026-05-18..2026-05-21 partial.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(metricsResponse(700, 7))
      .mockResolvedValueOnce(metricsResponse(400, 4));
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getWeeklyTrendNote.validate!({ weeks: 2, endDate: "2026-05-21" });
    const result = await getWeeklyTrendNote.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    const data = result.data as { html: string; rows: Array<{ partial: boolean; label: string }> };
    expect(data.rows[1].partial).toBe(true);
    expect(data.rows[1].label).toBe("May 18 - 21 (Mon-Thu)");
    expect(data.html).toContain("background:#f0fdf4");
  });

  it("returns ok:false when a Growth Tools call fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(metricsResponse(700, 7))
      .mockResolvedValueOnce(new Response("upstream broken", { status: 500 }))
      .mockResolvedValue(metricsResponse(0, 0));
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getWeeklyTrendNote.validate!({ weeks: 4, endDate: "2026-05-17" });
    const result = await getWeeklyTrendNote.execute(args, baseCtx());

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
    const args = getWeeklyTrendNote.validate!({ weeks: 4, endDate: "2026-05-17" });
    const result = await getWeeklyTrendNote.execute(args, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/customerId/);
  });

  it("renders the summary paragraph in the HTML when summary is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(metricsResponse(700, 7));
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getWeeklyTrendNote.validate!({
      weeks: 1,
      endDate: "2026-05-17",
      summary: "CPA stable week on week.",
    });
    const result = await getWeeklyTrendNote.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    const data = result.data as { html: string };
    expect(data.html).toContain("CPA stable week on week.");
  });
});
