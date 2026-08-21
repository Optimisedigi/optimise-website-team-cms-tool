/**
 * Tests for `GET /api/dashboard/landing-pages`.
 *
 * This route feeds the landing dashboard's page list and its preview iframes, so
 * two properties matter and neither is covered by typechecking:
 *
 *  1. Both callers can read it. The per-client dashboard authenticates with a
 *     PIN token; the internal one uses a Payload admin session. The route
 *     originally lived under /api/landing-admin and was admin-only, which locked
 *     the PIN-authenticated dashboard out entirely - the exact regression these
 *     tests exist to catch if the auth is ever narrowed again.
 *  2. Nobody else can, and nothing off-host reaches an iframe. The manifest is
 *     fetched over the network, so it is treated as untrusted: entries pointing
 *     anywhere but our host are dropped rather than rendered.
 *
 * `fetch` is stubbed so the manifest is fixture data - the test must not depend
 * on the live site being up, or on how many pages it currently publishes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockValidateDashboardToken = vi.fn();
vi.mock("@/app/(frontend)/api/dashboard/verify/route", () => ({
  validateDashboardToken: (...args: unknown[]) => mockValidateDashboardToken(...args),
}));

const mockAuth = vi.fn();
vi.mock("payload", () => ({
  getPayload: vi.fn(() =>
    Promise.resolve({
      auth: (...args: unknown[]) => mockAuth(...args),
      find: (...args: unknown[]) => mockFind(...args),
      db: { drizzle: { run: (...args: unknown[]) => mockRun(...args) } },
    }),
  ),
}));

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

const mockFind = vi.fn();
const mockRun = vi.fn();

import { GET } from "@/app/(frontend)/api/dashboard/landing-pages/route";

const SLUG = "away-digital-teams";

const MANIFEST = {
  pages: [
    {
      pageId: "ag-bpo-services-au",
      slug: "bpo-services-au",
      market: "AU",
      url: "https://hire.awaydigitalteams.com/lp/bpo-services-au",
      title: "BPO Services in Vietnam",
      headline: "BPO services without the churn",
      adGroupIds: ["197465406426", "190142943741"],
      noindex: true,
    },
    {
      pageId: "ag-rpo-recruitment-us",
      slug: "rpo-recruitment-us",
      market: "US",
      url: "https://hire.awaydigitalteams.com/lp/rpo-recruitment-us",
      title: "RPO in Vietnam",
      headline: "Recruitment support that scales with you",
      adGroupIds: ["197453679839"],
      noindex: true,
    },
  ],
};

function get(params = `?slug=${SLUG}`, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost/api/dashboard/landing-pages${params}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function stubManifest(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok, status, json: () => Promise.resolve(body) })),
  );
}

describe("GET /api/dashboard/landing-pages", () => {
  beforeEach(() => {
    mockValidateDashboardToken.mockReset();
    mockAuth.mockReset();
    mockFind.mockReset();
    mockRun.mockReset();
    // Default: a client with no ad account and no stored events, so the base
    // tests exercise the list itself rather than its decoration.
    mockFind.mockResolvedValue({ docs: [{ id: 7 }] });
    mockRun.mockResolvedValue({ rows: [] });
    stubManifest(MANIFEST);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the pages for a client holding a valid PIN token", async () => {
    mockValidateDashboardToken.mockReturnValue(true);

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=valid-token"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pages).toHaveLength(4);
    expect(body.pages[0].pageId).toBe("ag-bpo-services-au");
    expect(mockValidateDashboardToken).toHaveBeenCalledWith("valid-token", SLUG);
    // A valid client token must not require an admin session as well.
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("returns the pages for a Payload admin session with no PIN token", async () => {
    mockValidateDashboardToken.mockReturnValue(false);
    mockAuth.mockResolvedValue({ user: { id: 1, email: "admin@example.test" } });

    const res = await GET(get());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pages).toHaveLength(4);
    expect(mockAuth).toHaveBeenCalled();
  });

  it("rejects a caller with neither a valid token nor a session", async () => {
    mockValidateDashboardToken.mockReturnValue(false);
    mockAuth.mockResolvedValue({ user: null });

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=forged"));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("rejects a token minted for a different client", async () => {
    // The token is only good for the slug it was issued against, so one client
    // cannot read another's dashboard by changing the query string.
    mockValidateDashboardToken.mockImplementation((_t: string, slug: string) => slug === "other-client");
    mockAuth.mockResolvedValue({ user: null });

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=token-for-other-client"));

    expect(res.status).toBe(401);
  });

  it("requires a slug before doing any auth work", async () => {
    const res = await GET(get(""));

    expect(res.status).toBe(400);
    expect(mockValidateDashboardToken).not.toHaveBeenCalled();
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("drops manifest entries that point off our host", async () => {
    mockValidateDashboardToken.mockReturnValue(true);
    stubManifest({
      pages: [
        ...MANIFEST.pages,
        { ...MANIFEST.pages[0], pageId: "ag-evil", slug: "evil", url: "https://evil.example.com/lp/evil" },
        { ...MANIFEST.pages[0], pageId: "ag-insecure", slug: "insecure", url: "http://hire.awaydigitalteams.com/lp/x" },
        { ...MANIFEST.pages[0], pageId: "ag-traversal", slug: "../../etc/passwd" },
      ],
    });

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=valid-token"));
    const body = await res.json();

    // The two valid manifest entries and two trusted legacy pages survive.
    expect(body.pages).toHaveLength(4);
    expect(body.pages.map((p: { pageId: string }) => p.pageId)).toEqual([
      "ag-bpo-services-au",
      "ag-rpo-recruitment-us",
      "offshore-teams-au",
      "offshore-teams-us",
    ]);
  });

  it("keeps only numeric ad group ids", async () => {
    mockValidateDashboardToken.mockReturnValue(true);
    stubManifest({
      pages: [{ ...MANIFEST.pages[0], adGroupIds: ["197465406426", "not-an-id", "12x34", ""] }],
    });

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=valid-token"));

    expect((await res.json()).pages[0].adGroupIds).toEqual(["197465406426"]);
  });

  it("reports a 502 rather than an empty list when the manifest is unreachable", async () => {
    mockValidateDashboardToken.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=valid-token"));
    const body = await res.json();

    // An empty list would read as "no pages exist", which is a different and
    // much more alarming statement than "the manifest could not be fetched".
    expect(res.status).toBe(502);
    expect(body.error).toContain("network down");
  });

  it("reports a 502 when the manifest responds with an error status", async () => {
    mockValidateDashboardToken.mockReturnValue(true);
    stubManifest(null, false, 404);

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=valid-token"));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("404");
  });

  it("returns the complete manifest without running metric queries in catalog mode", async () => {
    mockValidateDashboardToken.mockReturnValue(true);

    const res = await GET(get(`?slug=${SLUG}&catalog=1`, "dashboard_token=valid-token"));
    const body = await res.json();

    expect(body.pages.map((page: { pageId: string }) => page.pageId)).toEqual([
      "ag-bpo-services-au",
      "ag-rpo-recruitment-us",
    ]);
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe("GET /api/dashboard/landing-pages decoration", () => {
  beforeEach(() => {
    mockValidateDashboardToken.mockReset();
    mockValidateDashboardToken.mockReturnValue(true);
    mockAuth.mockReset();
    mockFind.mockReset();
    mockRun.mockReset();
    mockRun.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROWTH_TOOLS_URL;
    delete process.env.INTERNAL_API_KEY;
  });

  it("totals clicks and spend from the ad groups pointing at each page", async () => {
    process.env.GROWTH_TOOLS_URL = "http://growth.test";
    process.env.INTERNAL_API_KEY = "k";
    mockFind.mockResolvedValue({ docs: [{ id: 7, googleAdsCustomerId: "342-535-3766" }] });

    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(
        String(url).includes("ad-groups/list")
          ? {
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  success: true,
                  adGroups: [
                    { adGroupId: "197465406426", adGroupName: "bpo", campaignName: "Search - AU", clicks: 22, cost: 1189.82, conversions: 1 },
                    { adGroupId: "190142943741", adGroupName: "bpo exact", campaignName: "Search - AU", clicks: 27, cost: 150.5, conversions: 0 },
                  ],
                }),
            }
          : { ok: true, status: 200, json: () => Promise.resolve(MANIFEST) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      get(`?slug=${SLUG}&start=2026-08-19&end=2026-08-20`, "dashboard_token=valid-token"),
    );
    const body = await res.json();
    const bpo = body.pages.find((p: { slug: string }) => p.slug === "bpo-services-au");

    expect(body.adMetricsAvailable).toBe(true);
    expect(bpo.clicks).toBe(49);
    expect(bpo.cost).toBe(1340.32);
    // The names, not the ids: an id says nothing about what someone searched.
    expect(bpo.adGroups.map((g: { name: string }) => g.name)).toEqual(["bpo", "bpo exact"]);
    // The campaign travels with the ad group so the UI can label which is which.
    expect(bpo.adGroups[0].campaign).toBe("Search - AU");
    // A page whose ad groups returned no metrics must not claim zero spend it
    // cannot vouch for beyond an empty list.
    expect(body.pages.find((p: { slug: string }) => p.slug === "rpo-recruitment-us").adGroups).toEqual([]);

    const [, adGroupInit] = fetchMock.mock.calls.find(([url]) => String(url).includes("ad-groups/list"))!;
    expect(adGroupInit).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": "k" },
    });
    expect(JSON.parse(String(adGroupInit?.body))).toEqual({
      customerId: "3425353766",
      dateRange: "2026-08-19,2026-08-20",
      statusFilter: "ALL",
    });
  });
  it("still returns the pages when Google Ads is unreachable", async () => {
    process.env.GROWTH_TOOLS_URL = "http://growth.test";
    process.env.INTERNAL_API_KEY = "k";
    mockFind.mockResolvedValue({ docs: [{ id: 7, googleAdsCustomerId: "3425353766" }] });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        String(url).includes("ad-groups/list")
          ? Promise.reject(new Error("growth tools down"))
          : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(MANIFEST) }),
      ),
    );

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=valid-token"));
    const body = await res.json();

    // The list is the point; the spend is decoration on top of it.
    expect(res.status).toBe(200);
    expect(body.pages).toHaveLength(4);
    expect(body.adMetricsAvailable).toBe(false);
  });

  it("derives bounce rate and time on site per page from stored sessions", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 7 }] });
    stubManifest(MANIFEST);
    // Two statements run: engagement first, then timing.
    mockRun
      .mockResolvedValueOnce({
        rows: [
          // 10 sessions, 7 bounced -> 70%.
          {
            page_id: "ag-bpo-services-au",
            sessions: 10,
            bounced: 7,
            paid: 4,
            engaged: 6,
            paid_engaged: 3,
            converted: 2,
            paid_converted: 1,
          },
          {
            page_id: "ag-rpo-recruitment-us",
            sessions: 5,
            bounced: 0,
            paid: 5,
            engaged: 2,
            paid_engaged: 2,
            converted: 0,
            paid_converted: 0,
          },
          {
            page_id: "offshore-teams-au",
            sessions: 20,
            bounced: 4,
            paid: 12,
            engaged: 9,
            paid_engaged: 7,
            converted: 1,
            paid_converted: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          // Three measured sessions total 114s; all 10 visits produce 11s average time on site.
          { page_id: "ag-bpo-services-au", session_ms: 4000, paid: 1 },
          { page_id: "ag-bpo-services-au", session_ms: 20000, paid: 1 },
          { page_id: "ag-bpo-services-au", session_ms: 90000, paid: 0 },
        ],
      });

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=valid-token"));
    const body = await res.json();
    const bpo = body.pages.find((p: { slug: string }) => p.slug === "bpo-services-au");
    const rpo = body.pages.find((p: { slug: string }) => p.slug === "rpo-recruitment-us");
    const legacyAu = body.pages.find((p: { pageId: string }) => p.pageId === "offshore-teams-au");

    expect(bpo.sessions).toBe(10);
    expect(bpo.bounceRate).toBe(70);
    expect(bpo.medianSeconds).toBe(20);
    expect(bpo.paidSessions).toBe(4);
    expect(bpo.engagedSessions).toBe(6);
    expect(bpo.paidEngagedSessions).toBe(3);
    expect(bpo.trackedConversions).toBe(2);
    expect(bpo.paidTrackedConversions).toBe(1);
    expect(bpo.averageSeconds).toBe(11);
    // Two paid timing samples total 24s; all four paid visits produce a 6s average.
    expect(bpo.paidAverageSeconds).toBe(6);
    expect(bpo.paidMedianSeconds).toBe(4);
    expect(legacyAu.url).toBe("https://hire.awaydigitalteams.com/outsourcing-au");
    expect(legacyAu.engagedSessions).toBe(9);
    expect(legacyAu.paidEngagedSessions).toBe(7);

    expect(rpo.bounceRate).toBe(0);
    // No dwell beacon means unknown, not zero: "0s" would claim they left at once.
    expect(rpo.averageSeconds).toBeNull();
    expect(rpo.medianSeconds).toBeNull();
    expect(rpo.paidAverageSeconds).toBeNull();
    expect(rpo.paidMedianSeconds).toBeNull();

  });

  it("reports no engagement rather than failing when the query errors", async () => {
    mockFind.mockResolvedValue({ docs: [{ id: 7 }] });
    stubManifest(MANIFEST);
    mockRun.mockRejectedValue(new Error("no such column"));

    const res = await GET(get(`?slug=${SLUG}`, "dashboard_token=valid-token"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pages[0].bounceRate).toBeNull();
    expect(body.pages[0].medianSeconds).toBeNull();
    expect(body.pages[0].sessions).toBe(0);
  });
});
