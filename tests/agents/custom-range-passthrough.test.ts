/**
 * Custom date-range pass-through: the 3 Google Ads tools must forward
 * back-dated week-long spans straight to Growth Tools as a comma-span
 * dateRange, with NO separate startDate/endDate params (Growth Tools ignores
 * them once dateRange carries the span and they only muddy request logs).
 *
 * This is the regression test for the OptiMate "custom date ranges coerced to
 * LAST_30_DAYS every time" bug — the previous snap layer silently widened
 * `2026-05-04..2026-05-10` to LAST_14_DAYS ending today, making it impossible
 * to isolate a back-dated week.
 *
 * `_growth-tools.ts` reads INTERNAL_API_KEY at module-load time, so we must
 * set it BEFORE importing the tools.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.GROWTH_TOOLS_URL = "https://growth.test";
process.env.INTERNAL_API_KEY = "test-key";

const { getCampaignPerformance } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-campaign-performance"
);
const { getSearchTerms } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-search-terms"
);
const { getAccountOverview } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-account-overview"
);

function makeCtx() {
  return {
    agentName: "optimate-google-ads",
    agentRunId: "run-custom-range-passthrough",
    context: { customerId: "1234567890", conversionActions: "" },
    log: () => {},
  };
}

function mockFetchOnce(payload: unknown) {
  const captured: { url?: string } = {};
  globalThis.fetch = vi.fn(async (url: any) => {
    captured.url = String(url);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return captured;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── The bug-fix regression test ─────────────────────────────────────────────

describe("back-dated week-long custom span (the bug)", () => {
  it("get_campaign_performance forwards the span verbatim — no snap, no widening", async () => {
    const captured = mockFetchOnce({
      metrics: [
        { campaignId: "c1", campaignName: "Brand", cost: 200, clicks: 30, impressions: 1000, conversions: 5 },
      ],
    });

    const args = getCampaignPerformance.validate!({ range: "2026-05-04..2026-05-10" });
    const res = await getCampaignPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const url = captured.url ?? "";
    expect(url).toContain("/api/google-ads/campaign-budgets/get-metrics");
    // Comma is URL-encoded as %2C by URLSearchParams.
    expect(url).toContain("dateRange=custom%3A2026-05-04%2C2026-05-10");
    expect(url).not.toContain("dateRange=LAST_");
    expect(url).not.toContain("startDate=");
    expect(url).not.toContain("endDate=");

    // Response surfaces the real custom bounds and DOES NOT set coercedFrom
    // because the input wasn't actually coerced.
    const data = res.data as Record<string, unknown>;
    expect(data.dateRange).toBe("CUSTOM");
    expect(data.startDate).toBe("2026-05-04");
    expect(data.endDate).toBe("2026-05-10");
    expect(data.coercedFrom).toBeUndefined();
  });

  it("get_search_terms forwards the span verbatim — no snap, no widening", async () => {
    const captured = mockFetchOnce({
      searchTerms: [
        { searchTerm: "emergency plumber", impressions: 800, clicks: 40, cost: 60, conversions: 2 },
      ],
    });

    const args = getSearchTerms.validate!({ range: "2026-05-04..2026-05-10" });
    const res = await getSearchTerms.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const url = captured.url ?? "";
    expect(url).toContain("/api/google-ads/search-terms");
    expect(url).toContain("dateRange=custom%3A2026-05-04%2C2026-05-10");
    expect(url).not.toContain("dateRange=LAST_");
    expect(url).not.toContain("startDate=");
    expect(url).not.toContain("endDate=");
  });

  it("get_account_overview forwards the span verbatim — no snap, no widening", async () => {
    const captured = mockFetchOnce({
      metrics: [
        { campaignId: "c1", campaignName: "Brand", cost: 200, clicks: 30, impressions: 1000, conversions: 5 },
      ],
    });

    const args = getAccountOverview.validate!({ range: "2026-05-04..2026-05-10" });
    const res = await getAccountOverview.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const url = captured.url ?? "";
    expect(url).toContain("/api/google-ads/campaign-budgets/get-metrics");
    expect(url).toContain("dateRange=custom%3A2026-05-04%2C2026-05-10");
    expect(url).not.toContain("dateRange=LAST_");
    expect(url).not.toContain("startDate=");
    expect(url).not.toContain("endDate=");

    const data = res.data as Record<string, unknown>;
    expect(data.dateRange).toBe("CUSTOM");
    expect(data.startDate).toBe("2026-05-04");
    expect(data.endDate).toBe("2026-05-10");
    expect(data.coercedFrom).toBeUndefined();
  });
});

// ── Presets still pass through unchanged ────────────────────────────────────

describe("preset ranges still pass through unchanged", () => {
  it("LAST_7_DAYS → dateRange=LAST_7_DAYS, no startDate/endDate", async () => {
    const captured = mockFetchOnce({ metrics: [] });
    const args = getCampaignPerformance.validate!({ range: "LAST_7_DAYS" });
    await getCampaignPerformance.execute(args, makeCtx());
    const url = captured.url ?? "";
    expect(url).toContain("dateRange=LAST_7_DAYS");
    expect(url).not.toContain("startDate=");
  });

  it("LAST_WEEK_SUN_SAT (the operator preset) → dateRange=LAST_WEEK_SUN_SAT", async () => {
    const captured = mockFetchOnce({ metrics: [] });
    const args = getCampaignPerformance.validate!({ range: "LAST_WEEK_SUN_SAT" });
    await getCampaignPerformance.execute(args, makeCtx());
    expect(captured.url ?? "").toContain("dateRange=LAST_WEEK_SUN_SAT");
  });
});

// ── Quarter literal also rides the pass-through path ───────────────────────

describe("quarter literals ride the pass-through path", () => {
  it("Q1 2026 → dateRange=2026-01-01,2026-03-31", async () => {
    const captured = mockFetchOnce({ metrics: [] });
    const args = getCampaignPerformance.validate!({ range: "Q1 2026" });
    await getCampaignPerformance.execute(args, makeCtx());
    expect(captured.url ?? "").toContain("dateRange=custom%3A2026-01-01%2C2026-03-31");
  });
});
