import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The scaffold route reaches Google Ads data through Growth Tools, so the tests
 * that matter are the ones proving it cannot be driven by an anonymous caller
 * and that it never invents landing copy.
 */

const payloadMock = {
  auth: vi.fn(),
  findByID: vi.fn(),
};

vi.mock("payload", () => ({ getPayload: vi.fn(async () => payloadMock) }));
vi.mock("@/payload.config", () => ({ default: {} }));

import { GET, slugifyAdGroup } from "@/app/(frontend)/api/landing/v1/ad-group-scaffold/route";

const ENABLED_GROUPS = {
  adGroups: [
    {
      adGroupId: "111",
      adGroupName: "Offshore Development Team",
      campaignName: "Search - Dev",
      status: "ENABLED",
      campaignStatus: "ENABLED",
    },
    {
      adGroupId: "222",
      adGroupName: "Paused Group",
      campaignName: "Search - Dev",
      status: "PAUSED",
      campaignStatus: "ENABLED",
    },
    {
      adGroupId: "333",
      adGroupName: "Offshore Development Team",
      campaignName: "Search - Brand",
      status: "ENABLED",
      campaignStatus: "ENABLED",
    },
  ],
};

const KEYWORDS = {
  keywords: [
    { adGroupId: "111", text: "offshore development team", matchType: "EXACT" },
    { adGroupId: "111", text: "hire offshore developers", matchType: "PHRASE" },
    { adGroupId: "111", text: "offshore development team", matchType: "PHRASE" },
    { adGroupId: "999", text: "unrelated", matchType: "EXACT" },
  ],
};

function request(params = "client=7") {
  return new NextRequest(`http://localhost/api/landing/v1/ad-group-scaffold?${params}`);
}

describe("slugifyAdGroup", () => {
  it("produces filename-safe slugs the page generator accepts", () => {
    expect(slugifyAdGroup("Offshore Development Team")).toBe("offshore-development-team");
    expect(slugifyAdGroup("  Hire Devs / Vietnam!  ")).toBe("hire-devs-vietnam");
    expect(slugifyAdGroup("A".repeat(90)).length).toBeLessThanOrEqual(60);
    expect(slugifyAdGroup("Offshore Development Team")).toMatch(/^[a-z0-9][a-z0-9-]{1,60}$/);
  });
});

describe("landing ad-group scaffold route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("GROWTH_TOOLS_URL", "https://growth.example.com");
    vi.stubEnv("INTERNAL_API_KEY", "internal-key");
    payloadMock.auth.mockReset();
    payloadMock.findByID.mockReset();
    vi.restoreAllMocks();
  });

  it("refuses an anonymous caller before touching Growth Tools", async () => {
    payloadMock.auth.mockResolvedValue({ user: null });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires a client id", async () => {
    payloadMock.auth.mockResolvedValue({ user: { id: 1 } });
    const res = await GET(request(""));
    expect(res.status).toBe(400);
  });

  it("rejects a client with no Google Ads customer id", async () => {
    payloadMock.auth.mockResolvedValue({ user: { id: 1 } });
    payloadMock.findByID.mockResolvedValue({ id: 7, googleAdsCustomerId: "" });

    const res = await GET(request());
    expect(res.status).toBe(400);
  });

  it("returns only enabled groups, unique slugs, and deduplicated keywords", async () => {
    payloadMock.auth.mockResolvedValue({ user: { id: 1 } });
    payloadMock.findByID.mockResolvedValue({ id: 7, googleAdsCustomerId: "123-456-7890" });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/ad-groups/list") ? ENABLED_GROUPS : KEYWORDS;
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const res = await GET(request());
    expect(res.status).toBe(200);

    const body = await res.json();

    // The paused group is excluded.
    expect(body.adGroups).toHaveLength(2);
    const slugs = body.adGroups.map((row: { slug: string }) => row.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    const first = body.adGroups[0];
    expect(first.adGroupId).toBe("111");
    // Duplicate keyword text across match types collapses to one entry.
    expect(first.keywords).toEqual(["offshore development team", "hire offshore developers"]);

    // Copy fields are deliberately left for a human to write.
    expect(first.headline).toBe("");
    expect(first.lede).toBe("");
    expect(first.title).toBe("");
  });

  it("still returns ad groups when the keyword lookup fails", async () => {
    payloadMock.auth.mockResolvedValue({ user: { id: 1 } });
    payloadMock.findByID.mockResolvedValue({ id: 7, googleAdsCustomerId: "1234567890" });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("/keywords/list")) return new Response("", { status: 500 });
      return new Response(JSON.stringify(ENABLED_GROUPS), { status: 200 });
    });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.keywordsUnavailable).toBe(true);
    expect(body.adGroups[0].keywords).toEqual([]);
  });

  it("reports a Growth Tools outage rather than returning an empty scaffold", async () => {
    payloadMock.auth.mockResolvedValue({ user: { id: 1 } });
    payloadMock.findByID.mockResolvedValue({ id: 7, googleAdsCustomerId: "1234567890" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 502 }));

    const res = await GET(request());
    expect(res.status).toBe(502);
  });
});
