// `_growth-tools.ts` reads INTERNAL_API_KEY at module-load time, so we must
// set it BEFORE importing the tool. Top-level statements are hoisted above
// imports by Vitest's transform when written this way.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.GROWTH_TOOLS_URL = "https://growth.test";
process.env.INTERNAL_API_KEY = "test-key";

const { getSearchTerms } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-search-terms"
);

function makeCtx() {
  return {
    agentName: "optimate-google-ads",
    agentRunId: "run-1",
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

describe("get_search_terms tool", () => {
  it("snaps CUSTOM quarter ranges to a preset (Growth Tools rejects literal CUSTOM in GAQL DURING)", async () => {
    // Q1 2026 resolves to CUSTOM startDate=2026-01-01..2026-03-31. Growth
    // Tools' search-terms endpoint substitutes dateRange into a GAQL DURING
    // clause verbatim and rejects "CUSTOM". The snap layer converts that to
    // the smallest LAST_N_DAYS preset that fully covers the requested span
    // (here: ~90 days back from "now" since the quarter is in the past).
    // We assert the request shape; the response's `coercedFrom` / `note`
    // tells the agent honestly that the window was widened.
    const captured = mockFetchOnce({
      searchTerms: [
        { searchTerm: "shoes", impressions: 1000, clicks: 50, cost: 40, conversions: 2, segment: "2026-01" },
      ],
    });

    const args = getSearchTerms.validate!({ range: "Q1 2026", segment: "month" });
    const res = await getSearchTerms.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const url = captured.url ?? "";
    expect(url).toContain("/api/google-ads/search-terms");
    expect(url).toContain("segment=month");
    // Snap must have stripped these so Growth Tools doesn't see CUSTOM.
    expect(url).not.toContain("dateRange=CUSTOM");
    expect(url).not.toContain("startDate=");
    expect(url).not.toContain("endDate=");
    // The forwarded dateRange must be one of the LAST_N_DAYS presets.
    expect(url).toMatch(/dateRange=LAST_\d+_DAYS/);
  });

  it("returns one row per (term, segment) sorted by term then segment when segmenting", async () => {
    mockFetchOnce({
      searchTerms: [
        { searchTerm: "boots", impressions: 100, clicks: 5, cost: 20, conversions: 0, segment: "2026-02" },
        { searchTerm: "shoes", impressions: 800, clicks: 30, cost: 40, conversions: 1, segment: "2026-02" },
        { searchTerm: "shoes", impressions: 500, clicks: 20, cost: 25, conversions: 0, segment: "2026-01" },
      ],
    });

    const args = getSearchTerms.validate!({ range: "Q1 2026", segment: "month" });
    const res = await getSearchTerms.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const data = res.data as any;
    expect(data.segmentation).toBe("month");
    expect(data.segmentationUnavailable).toBeUndefined();
    expect(data.terms).toHaveLength(3);
    // boots(2026-02), shoes(2026-01), shoes(2026-02) — alpha by term, then segment.
    expect(data.terms[0]).toMatchObject({ term: "boots", segment: "2026-02" });
    expect(data.terms[1]).toMatchObject({ term: "shoes", segment: "2026-01" });
    expect(data.terms[2]).toMatchObject({ term: "shoes", segment: "2026-02" });
  });

  it("flags segmentationUnavailable when caller asked for a segment but rows came back without one", async () => {
    mockFetchOnce({
      searchTerms: [
        { searchTerm: "shoes", impressions: 1000, clicks: 50, cost: 40, conversions: 2 },
        { searchTerm: "boots", impressions: 500, clicks: 25, cost: 20, conversions: 0 },
      ],
    });

    const args = getSearchTerms.validate!({ range: "LAST_30_DAYS", segment: "month" });
    const res = await getSearchTerms.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const data = res.data as any;
    expect(data.segmentation).toBe("month");
    expect(data.segmentationUnavailable).toBe(true);
    // Falls back to spend-desc sort because upstream didn't segment.
    expect(data.terms[0].term).toBe("shoes");
  });

  it("omits segmentation from the URL when segment is not supplied", async () => {
    const captured = mockFetchOnce({ searchTerms: [] });

    const args = getSearchTerms.validate!({ range: "LAST_30_DAYS" });
    const res = await getSearchTerms.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    expect(captured.url ?? "").not.toContain("segment=");
  });

  it("rejects an invalid segment value in validate()", () => {
    expect(() => getSearchTerms.validate!({ segment: "fortnight" })).toThrow(
      /segment must be/,
    );
  });
});
