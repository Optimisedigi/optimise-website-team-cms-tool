import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.GROWTH_TOOLS_URL = "https://growth.test";
process.env.INTERNAL_API_KEY = "test-key";

const { getAdGroupPerformance } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-ad-group-performance"
);

function makeCtx(context: Record<string, unknown> = {}) {
  return {
    agentName: "optimate-google-ads",
    agentRunId: "run-1",
    context: {
      customerId: "123-456-7890",
      conversionActions: "Phone call lead, Form submit",
      ...context,
    },
    log: () => {},
  };
}

function mockFetchOnce(payload: unknown) {
  const captured: { url?: string; method?: string; headers?: Record<string, string>; body?: unknown } = {};
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    captured.url = String(url);
    captured.method = init?.method;
    captured.headers = init?.headers as Record<string, string> | undefined;
    captured.body = init?.body ? JSON.parse(String(init.body)) : undefined;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return captured;
}

function mockFetchFailureOnce(status: number, body: string) {
  globalThis.fetch = vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("get_ad_group_performance — validate()", () => {
  it("accepts an omitted campaignId for account-wide ad group lookups", () => {
    expect(getAdGroupPerformance.validate!({}).campaignId).toBeUndefined();
    expect(getAdGroupPerformance.validate!({ campaignId: "customers/123/campaigns/987" }).campaignId).toBe("123987");
    expect(() => getAdGroupPerformance.validate!({ campaignId: "abc" })).toThrow(/campaignId/);
  });

  it("normalises ad group name and conversion action filters, and clamps limit", () => {
    const args = getAdGroupPerformance.validate!({
      campaignId: "987",
      adGroupNameContains: " SEO ",
      adGroupNames: [" Brand ", "", "Generic"],
      conversionActions: [" Phone call lead ", "", "Form submit"],
      limit: 999,
    });
    expect(args.adGroupNameContains).toBe("SEO");
    expect(args.adGroupNames).toEqual(["Brand", "Generic"]);
    expect(args.conversionActions).toEqual(["Phone call lead", "Form submit"]);
    expect(args.limit).toBe(500);
  });
});

describe("get_ad_group_performance — execute()", () => {
  it("POSTs to the Growth Tools ad-groups endpoint with conversion action filters", async () => {
    const captured = mockFetchOnce({ success: true, campaignId: "987", adGroups: [] });
    const args = getAdGroupPerformance.validate!({ campaignId: "987", range: "LAST_MONTH" });
    const res = await getAdGroupPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    expect(captured.url).toBe("https://growth.test/api/google-ads/ad-groups/list");
    expect(captured.method).toBe("POST");
    expect(captured.headers?.["x-internal-key"]).toBe("test-key");
    expect(captured.headers?.["content-type"]).toBe("application/json");
    expect(captured.body).toEqual({
      customerId: "1234567890",
      campaignId: "987",
      dateRange: "LAST_MONTH",
      conversionActions: ["Phone call lead", "Form submit"],
    });
  });

  it("calculates CPA, CTR, filters by ad group name across campaigns, and sorts by spend", async () => {
    mockFetchOnce({
      success: true,
      campaignId: "987",
      totalCount: 3,
      adGroups: [
        { campaignId: "987", campaignName: "Search", adGroupId: "1", adGroupName: "Brand AU", impressions: 1000, clicks: 100, cost: 200, conversions: 4 },
        { campaignId: "654", campaignName: "Search Generic", adGroupId: "2", adGroupName: "Generic NSW", impressions: 2000, clicks: 80, cost: 800, conversions: 8 },
        { campaignId: "321", campaignName: "Search Competitor", adGroupId: "3", adGroupName: "Competitor", impressions: 500, clicks: 10, cost: 50, conversions: 0 },
      ],
    });

    const args = getAdGroupPerformance.validate!({
      adGroupNameContains: "generic",
    });
    const res = await getAdGroupPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const data = res.data as any;
    expect(data.conversionActionsApplied).toEqual(["Phone call lead", "Form submit"]);
    expect(data.adGroups.map((row: any) => row.adGroupName)).toEqual(["Generic NSW"]);
    expect(data.adGroups[0].campaignName).toBe("Search Generic");
    expect(data.adGroups[0].cpa).toBe(100);
    expect(data.adGroups[0].ctr).toBe(4);
  });

  it("forwards custom month ranges and per-call conversion action overrides", async () => {
    const captured = mockFetchOnce({ success: true, adGroups: [] });
    const args = getAdGroupPerformance.validate!({
      range: "2026-05-01..2026-05-31",
      conversionActions: ["Qualified lead"],
    });
    await getAdGroupPerformance.execute(args, makeCtx({ conversionActions: "" }));
    expect(captured.body).toMatchObject({
      dateRange: "2026-05-01,2026-05-31",
      conversionActions: ["Qualified lead"],
    });
    expect((captured.body as any).campaignId).toBeUndefined();
  });

  it("returns an error when customerId is missing", async () => {
    const args = getAdGroupPerformance.validate!({ campaignId: "987" });
    const res = await getAdGroupPerformance.execute(args, { ...makeCtx(), context: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/customerId/);
  });

  it("propagates upstream errors", async () => {
    mockFetchFailureOnce(503, "Google Ads API not configured");
    const args = getAdGroupPerformance.validate!({ campaignId: "987" });
    const res = await getAdGroupPerformance.execute(args, makeCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/503/);
  });
});
