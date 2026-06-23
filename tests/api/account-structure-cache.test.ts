import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.GROWTH_TOOLS_URL = "https://growth.example";
  process.env.INTERNAL_API_KEY = "internal-key";
});

const mockPayload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  logger: { error: vi.fn() },
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

import { GET as getClientAccountStructure } from "@/app/(frontend)/api/client/[slug]/google-ads/account-structure/route";
import { getYesterdayWindow } from "@/lib/google-ads-account-structure-cache";

function request(path: string): NextRequest {
  return new NextRequest(`https://cms.example${path}`);
}

const client = {
  id: 123,
  name: "Away Digital",
  googleAdsCustomerId: "342-535-3766",
};

const livePayload = {
  partner: "Away Digital Teams",
  campaignCount: 1,
  campaigns: [{ id: "c1", name: "Campaign", adGroups: [] }],
};
const defaultConversionFilterKey = JSON.stringify({
  conversionActions: "",
  phoneCallActions: "",
  formSubmitActions: "",
  conversionActionCategories: "",
});

describe("account structure cache routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayload.create.mockResolvedValue({ id: 10, capturedAt: "2026-06-22T07:00:00.000Z" });
    mockPayload.update.mockResolvedValue({ id: 10, capturedAt: "2026-06-22T07:00:00.000Z" });
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(livePayload),
    })) as any;
  });

  it("returns cached payload without calling Growth Tools", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [client] })
      .mockResolvedValueOnce({
        docs: [{
          id: 1,
          client: 123,
          source: "cron",
          capturedAt: "2026-06-22T07:00:00.000Z",
          dateRangeStart: "2026-05-22",
          dateRangeEnd: "2026-06-21",
          payload: { ...livePayload, _conversionFilterKey: defaultConversionFilterKey },
        }],
      });

    const res = await getClientAccountStructure(request("/api/client/away-digital/google-ads/account-structure"), {
      params: Promise.resolve({ slug: "away-digital" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.campaignCount).toBe(1);
    expect(json._cache.source).toBe("cron");
    expect(json._conversionFilterKey).toBe(defaultConversionFilterKey);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refresh=live calls Growth Tools and writes through to cache", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [client] })
      .mockResolvedValueOnce({ docs: [] });

    const res = await getClientAccountStructure(request("/api/client/away-digital/google-ads/account-structure?refresh=live&from=2026-05-22&to=2026-06-21"), {
      params: Promise.resolve({ slug: "away-digital" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(String((globalThis.fetch as any).mock.calls[0][0])).toContain("/api/google-ads/account-structure/3425353766");
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: "google-ads-account-structure-snapshots",
      data: expect.objectContaining({
        source: "manual_refresh",
        payload: expect.objectContaining(livePayload),
      }),
    }));
    expect(json._cache.source).toBe("manual_refresh");
  });

  it("cold cache falls back to one live fetch and writes the cache", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [client] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    const res = await getClientAccountStructure(request("/api/client/away-digital/google-ads/account-structure"), {
      params: Promise.resolve({ slug: "away-digital" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mockPayload.create).toHaveBeenCalledTimes(1);
    expect(json._cache.source).toBe("cold_cache_live_fill");
  });
});

describe("getYesterdayWindow", () => {
  it("returns a 30-day window ending yesterday", () => {
    expect(getYesterdayWindow(new Date("2026-06-23T15:30:00.000Z"))).toEqual({
      from: "2026-05-23",
      to: "2026-06-22",
    });
  });
});
