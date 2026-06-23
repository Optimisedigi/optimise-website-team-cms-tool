// `_growth-tools.ts` reads INTERNAL_API_KEY at module-load time, so we must
// set it BEFORE importing the tool. Top-level statements are hoisted above
// imports by Vitest's transform when written this way.
import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.GROWTH_TOOLS_URL = "https://growth.test";
process.env.INTERNAL_API_KEY = "test-key";

const { getAdAssetPerformance } = await import(
  "@/lib/agents/optimate-google-ads/tools/get-ad-asset-performance"
);

function makeCtx() {
  return {
    agentName: "optimate-google-ads",
    agentRunId: "run-1",
    context: { customerId: "1234567890" },
    log: () => {},
  };
}

function mockFetchOnce(payload: unknown) {
  const captured: { url?: string; headers?: Record<string, string> } = {};
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    captured.url = String(url);
    captured.headers = init?.headers as Record<string, string> | undefined;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return captured;
}

function mockFetchFailureOnce(status: number, body: string) {
  globalThis.fetch = vi.fn(async () => {
    return new Response(body, { status });
  }) as unknown as typeof fetch;
}

/** Convenience builder for a single upstream asset row. */
function asset(overrides: Partial<{
  adId: string;
  adGroupId: string;
  campaignId: string;
  assetId: string;
  text: string;
  fieldType: string;
  performanceLabel: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
}> = {}) {
  return {
    adId: overrides.adId ?? "333",
    adResourceName: `customers/123/adGroupAds/${overrides.adGroupId ?? "222"}~${overrides.adId ?? "333"}`,
    adGroupId: overrides.adGroupId ?? "222",
    adGroupName: "Group A",
    campaignId: overrides.campaignId ?? "111",
    campaignName: "Camp A",
    assetId: overrides.assetId ?? "444",
    assetResourceName: `customers/123/assets/${overrides.assetId ?? "444"}`,
    text: overrides.text ?? "Free Delivery Today",
    fieldType: overrides.fieldType ?? "HEADLINE",
    performanceLabel: overrides.performanceLabel ?? "GOOD",
    impressions: overrides.impressions ?? 12400,
    clicks: overrides.clicks ?? 187,
    cost: overrides.cost ?? 0,
    conversions: overrides.conversions ?? 0,
    ctr: overrides.ctr ?? 0.015,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("get_ad_asset_performance — validate()", () => {
  it("defaults fieldType is left unset (tool layer applies HEADLINE default)", () => {
    const out = getAdAssetPerformance.validate!({});
    expect(out.fieldType).toBeUndefined();
  });

  it("accepts HEADLINE / DESCRIPTION / ALL case-insensitively", () => {
    expect(getAdAssetPerformance.validate!({ fieldType: "headline" }).fieldType).toBe("HEADLINE");
    expect(getAdAssetPerformance.validate!({ fieldType: "Description" }).fieldType).toBe(
      "DESCRIPTION",
    );
    expect(getAdAssetPerformance.validate!({ fieldType: "ALL" }).fieldType).toBe("ALL");
  });

  it("rejects an unknown fieldType", () => {
    expect(() => getAdAssetPerformance.validate!({ fieldType: "callout" })).toThrow(
      /fieldType must be/,
    );
  });

  it("rejects adGroupIds that aren't an array", () => {
    expect(() => getAdAssetPerformance.validate!({ adGroupIds: "111,222" })).toThrow(
      /adGroupIds must be an array/,
    );
  });

  it("strips non-numeric characters and dedups adGroupIds", () => {
    const out = getAdAssetPerformance.validate!({
      adGroupIds: ["111", "abc222", "111", " 333 "],
    });
    expect(out.adGroupIds).toEqual(["111", "222", "333"]);
  });

  it("drops adGroupIds entirely when none remain after sanitisation", () => {
    const out = getAdAssetPerformance.validate!({ adGroupIds: ["abc", "!@#"] });
    expect(out.adGroupIds).toBeUndefined();
  });

  it("clamps limit to <= 1000 and >= 1", () => {
    expect(getAdAssetPerformance.validate!({ limit: 5000 }).limit).toBe(1000);
    expect(() => getAdAssetPerformance.validate!({ limit: 0 })).toThrow(/limit must be/);
  });
});

describe("get_ad_asset_performance — execute()", () => {
  it("returns an error when customerId is missing from agent context", async () => {
    const res = await getAdAssetPerformance.execute(
      {},
      { ...makeCtx(), context: {} },
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/customerId/);
  });

  it("calls /api/google-ads/ad-asset-performance with default range, HEADLINE and customerId", async () => {
    const captured = mockFetchOnce({ assets: [], count: 0 });
    const args = getAdAssetPerformance.validate!({});
    const res = await getAdAssetPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const url = captured.url ?? "";
    expect(url).toContain("/api/google-ads/ad-asset-performance");
    expect(url).toContain("customerId=1234567890");
    expect(url).toContain("fieldType=HEADLINE");
    expect(url).toContain("dateRange=LAST_30_DAYS");
    expect(url).not.toContain("adGroupIds=");
  });

  it("forwards adGroupIds as a CSV", async () => {
    const captured = mockFetchOnce({ assets: [] });
    const args = getAdAssetPerformance.validate!({
      adGroupIds: ["111", "222", "333"],
    });
    await getAdAssetPerformance.execute(args, makeCtx());
    // URLSearchParams URL-encodes commas as %2C.
    expect(captured.url ?? "").toContain("adGroupIds=111%2C222%2C333");
  });

  it("forwards CUSTOM quarter ranges as a comma-span dateRange", async () => {
    const captured = mockFetchOnce({ assets: [] });
    const args = getAdAssetPerformance.validate!({ range: "Q1 2026" });
    const res = await getAdAssetPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    expect(captured.url ?? "").toContain("dateRange=2026-01-01%2C2026-03-31");
  });

  it("returns assets in upstream order (Growth Tools already sorts by impressions desc)", async () => {
    mockFetchOnce({
      assets: [
        asset({ assetId: "1", text: "High", impressions: 50_000 }),
        asset({ assetId: "2", text: "Mid", impressions: 5_000 }),
        asset({ assetId: "3", text: "Low", impressions: 100 }),
      ],
    });

    const args = getAdAssetPerformance.validate!({});
    const res = await getAdAssetPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const data = res.data as any;
    expect(data.count).toBe(3);
    expect(data.assets.map((a: any) => a.text)).toEqual(["High", "Mid", "Low"]);
  });

  it("clamps the response to `limit` rows", async () => {
    mockFetchOnce({
      assets: [
        asset({ assetId: "1", text: "a", impressions: 100 }),
        asset({ assetId: "2", text: "b", impressions: 90 }),
        asset({ assetId: "3", text: "c", impressions: 80 }),
      ],
    });

    const args = getAdAssetPerformance.validate!({ limit: 2 });
    const res = await getAdAssetPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const data = res.data as any;
    expect(data.assets).toHaveLength(2);
    expect(data.count).toBe(2);
  });

  it("rounds CTR to 4dp and cost to 2dp in the response", async () => {
    mockFetchOnce({
      assets: [
        asset({ ctr: 0.01432139, cost: 12.345678 }),
      ],
    });

    const args = getAdAssetPerformance.validate!({});
    const res = await getAdAssetPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(true);
    const data = res.data as any;
    expect(data.assets[0].ctr).toBe(0.0143);
    expect(data.assets[0].cost).toBe(12.35);
  });

  it("propagates upstream errors as ok=false with the error message", async () => {
    mockFetchFailureOnce(503, "Google Ads API not configured");

    const args = getAdAssetPerformance.validate!({});
    const res = await getAdAssetPerformance.execute(args, makeCtx());

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/503/);
  });

  it("sends the x-internal-key header", async () => {
    const captured = mockFetchOnce({ assets: [] });
    const args = getAdAssetPerformance.validate!({});
    await getAdAssetPerformance.execute(args, makeCtx());
    expect(captured.headers?.["x-internal-key"]).toBe("test-key");
  });

  it("preserves performanceLabel and fieldType verbatim from the upstream row", async () => {
    mockFetchOnce({
      assets: [
        asset({ performanceLabel: "LOW", fieldType: "HEADLINE", text: "underperformer" }),
      ],
    });
    const args = getAdAssetPerformance.validate!({});
    const res = await getAdAssetPerformance.execute(args, makeCtx());
    expect(res.ok).toBe(true);
    const a = (res.data as any).assets[0];
    expect(a.performanceLabel).toBe("LOW");
    expect(a.fieldType).toBe("HEADLINE");
  });

  it("registers under the read-google-ads category", async () => {
    const { TOOL_CATEGORY_MAP } = await import(
      "@/lib/agents/optimate-google-ads/tool-catalog"
    );
    expect(TOOL_CATEGORY_MAP["get_ad_asset_performance"]).toBe("read-google-ads");
  }, 15000);
});
