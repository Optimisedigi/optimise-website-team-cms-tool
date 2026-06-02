/**
 * Budget endpoint auth fallback test.
 *
 * Confirms that the four /api/google-ads-budgets/[id]/* endpoints accept
 * `x-api-key: AUDIT_API_KEY` as a substitute for a Payload session, per
 * the Phase 0 patch in optimate-phase0-cms-scaffolding.md. The agent will
 * call these endpoints from inside its Budget Re-allocation tool.
 *
 * We do NOT exercise the full route logic here; just the auth check at the
 * top of each route. The full happy paths are covered by their own tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

process.env.AUDIT_API_KEY = "test-audit-key-12345";
process.env.GROWTH_TOOLS_URL = "https://growth-tools.test";
process.env.INTERNAL_API_KEY = "internal-key";

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

// Stub out internal imports the routes use so the modules import cleanly
// even when we never reach those code paths in the auth-only tests.
vi.mock("@/lib/access", () => ({}));

import { GET as listGet } from "@/app/(frontend)/api/google-ads-budgets/[id]/list/route";
import { GET as adGroupsGet } from "@/app/(frontend)/api/google-ads-budgets/[id]/ad-groups/route";
import { POST as updatePost } from "@/app/(frontend)/api/google-ads-budgets/[id]/update/route";
import { POST as pushPost } from "@/app/(frontend)/api/google-ads-budgets/[id]/push/route";
import { POST as refreshPost } from "@/app/(frontend)/api/google-ads-budgets/[id]/refresh-metrics/route";

const TEST_KEY = "test-audit-key-12345";
const params = Promise.resolve({ id: "1" });

beforeEach(() => {
  process.env.AUDIT_API_KEY = TEST_KEY;
  process.env.GROWTH_TOOLS_URL = "https://growth-tools.test";
  process.env.INTERNAL_API_KEY = "internal-key";
  mockPayload.auth.mockResolvedValue({ user: null });
  mockPayload.findByID.mockReset();
  mockPayload.find.mockReset();
  mockPayload.create.mockReset();
  mockPayload.update.mockReset();
  // findByID returns "audit not found" so each route exits with a 4xx after
  // passing the auth gate. We only care about auth here.
  mockPayload.findByID.mockRejectedValue(new Error("not found"));
  mockPayload.find.mockResolvedValue({ docs: [] });
});

function makeRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Budget endpoints reject when neither user nor API key", () => {
  it("list returns 401 without auth", async () => {
    const req = makeRequest("http://localhost/api/google-ads-budgets/1/list", "GET");
    const res = await listGet(req, { params });
    expect(res.status).toBe(401);
  });

  it("update returns 401 without auth", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/update",
      "POST",
      { campaignId: "1" },
    );
    const res = await updatePost(req, { params });
    expect(res.status).toBe(401);
  });

  it("push returns 401 without auth", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/push",
      "POST",
      { campaigns: [] },
    );
    const res = await pushPost(req, { params });
    expect(res.status).toBe(401);
  });

  it("refresh-metrics returns 401 without auth", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/refresh-metrics",
      "POST",
      {},
    );
    const res = await refreshPost(req, { params });
    expect(res.status).toBe(401);
  });

  it("ad-groups returns 401 without auth", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/ad-groups?campaignId=c1",
      "GET",
    );
    const res = await adGroupsGet(req, { params });
    expect(res.status).toBe(401);
  });
});

describe("Budget endpoints accept x-api-key fallback", () => {
  it("list passes auth gate with x-api-key", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/list",
      "GET",
      undefined,
      { "x-api-key": TEST_KEY },
    );
    const res = await listGet(req, { params });
    // Should NOT be 401. (Will be 4xx for "audit not found" downstream, that's fine.)
    expect(res.status).not.toBe(401);
  });

  it("update passes auth gate with x-api-key", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/update",
      "POST",
      { campaignId: "1" },
      { "x-api-key": TEST_KEY },
    );
    const res = await updatePost(req, { params });
    expect(res.status).not.toBe(401);
  });

  it("push passes auth gate with x-api-key", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/push",
      "POST",
      { campaigns: [] },
      { "x-api-key": TEST_KEY },
    );
    const res = await pushPost(req, { params });
    expect(res.status).not.toBe(401);
  });

  it("refresh-metrics passes auth gate with x-api-key", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/refresh-metrics",
      "POST",
      {},
      { "x-api-key": TEST_KEY },
    );
    const res = await refreshPost(req, { params });
    expect(res.status).not.toBe(401);
  });

  it("ad-groups passes auth gate with x-api-key", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/ad-groups?campaignId=c1",
      "GET",
      undefined,
      { "x-api-key": TEST_KEY },
    );
    const res = await adGroupsGet(req, { params });
    expect(res.status).not.toBe(401);
  });
});

describe("Budget endpoints reject wrong x-api-key", () => {
  it("list returns 401 when x-api-key does not match AUDIT_API_KEY", async () => {
    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/list",
      "GET",
      undefined,
      { "x-api-key": "WRONG-KEY" },
    );
    const res = await listGet(req, { params });
    expect(res.status).toBe(401);
  });
});

describe("Budget ad-group metrics", () => {
  it("returns ad-group rows with normalized impression share and lost-to-budget metrics", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 9, email: "team@example.com" } });
    mockPayload.findByID.mockResolvedValue({
      id: 1,
      businessName: "Acme",
      customerId: "123-456-7890",
      client: {
        id: 22,
        googleAdsCustomerId: "987-654-3210",
        dashboardConversionActions: "Lead\nPhone Call",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              adGroups: [
                {
                  adGroupId: "ag1",
                  adGroupName: "Emergency Pumps",
                  impressions: 1000,
                  clicks: 50,
                  cost: 123.45,
                  conversions: 4,
                  search_impression_share: "62.5%",
                  search_budget_lost_impression_share: 18.2,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      ),
    );

    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/ad-groups?campaignId=c1",
      "GET",
    );

    const res = await adGroupsGet(req, { params });
    const data = await res.json();
    expect({ status: res.status, data }).toEqual({ status: 200, data: expect.any(Object) });
    expect(data.adGroups[0]).toMatchObject({
      adGroupId: "ag1",
      adGroupName: "Emergency Pumps",
      searchImpressionShare: 0.625,
      searchBudgetLostIS: 0.182,
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://growth-tools.test/api/google-ads/ad-groups/list",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          customerId: "9876543210",
          campaignId: "c1",
          dateRange: "THIS_MONTH",
          conversionActions: ["Lead", "Phone Call"],
        }),
      }),
    );
  });
});

describe("Budget push activity logging", () => {
  it("creates an activity-feed row after a successful push", async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 9, email: "team@example.com" } });
    mockPayload.findByID
      .mockResolvedValueOnce({
        id: 1,
        businessName: "Acme",
        customerId: "123-456-7890",
        client: 22,
      })
      .mockResolvedValueOnce({
        id: 22,
        name: "Acme Client",
        googleAdsCustomerId: "987-654-3210",
      });
    mockPayload.find.mockResolvedValue({ totalDocs: 0, docs: [] });
    mockPayload.update.mockResolvedValue({});
    mockPayload.create.mockResolvedValue({ id: 77 });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ pushedCount: 1, results: [{ campaignId: "c1", success: true }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    const req = makeRequest(
      "http://localhost/api/google-ads-budgets/1/push",
      "POST",
      { campaigns: [{ campaignId: "c1", dailyBudget: 42 }] },
    );

    const res = await pushPost(req, { params });
    expect(res.status).toBe(200);
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "activity-log",
        overrideAccess: true,
        data: expect.objectContaining({
          type: "google_ads_budget_pushed",
          title: "Google Ads budget pushed: Acme Client",
          client: 22,
        }),
      }),
    );
  });
});
