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
  it("forwards CUSTOM quarter ranges as a comma-span dateRange (Growth Tools accepts BETWEEN since 2026)", async () => {
    // Q1 2026 resolves to CUSTOM startDate=2026-01-01..2026-03-31. Growth
    // Tools' getSearchTerms now accepts 'YYYY-MM-DD,YYYY-MM-DD' in the
    // `dateRange` arg and substitutes it into a GAQL BETWEEN clause, so we
    // pass the bounds straight through instead of snapping to a preset.
    // No separate startDate / endDate query params — Growth Tools ignores
    // them once the dateRange carries the span.
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
    expect(url).not.toContain("dateRange=CUSTOM");
    expect(url).not.toContain("startDate=");
    expect(url).not.toContain("endDate=");
    // The forwarded dateRange must be the comma-span. URLSearchParams URL-encodes ',' as '%2C'.
    expect(url).toContain("dateRange=custom%3A2026-01-01%2C2026-03-31");
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
