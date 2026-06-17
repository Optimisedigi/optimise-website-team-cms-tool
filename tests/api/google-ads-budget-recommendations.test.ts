import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

interface MockPayload {
  auth: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  logger: { error: ReturnType<typeof vi.fn> };
}

const mockPayload: MockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  logger: { error: vi.fn() },
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}));

const globalFetch = vi.fn();
vi.stubGlobal("fetch", globalFetch);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  process.env.GROWTH_TOOLS_URL = "https://growth-tools.test";
  process.env.INTERNAL_API_KEY = "internal-key";
  mockPayload.find.mockImplementation(() => Promise.resolve({ docs: [], totalDocs: 0 }));
  mockPayload.create.mockResolvedValue({ id: 1 });
  mockPayload.update.mockResolvedValue({ id: 1 });
  mockPayload.delete.mockResolvedValue({ docs: [] });
});

import { GET } from "@/app/(frontend)/api/google-ads-budgets/monthly-recommendations/route";

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest(
    "http://localhost/api/google-ads-budgets/monthly-recommendations",
    {
      method: "GET",
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  );
}

describe("GET /api/google-ads-budgets/monthly-recommendations", () => {
  it("rejects requests without a CRON_SECRET bearer", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token", async () => {
    const res = await GET(makeRequest("Bearer wrong-token"));
    expect(res.status).toBe(401);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("computes and persists recommendations for a managed account, without pushing", async () => {
    // One managed audit with a monthly budget and a linked client CID.
    mockPayload.find.mockImplementation((args: { collection: string }) => {
      if (args.collection === "google-ads-audits") {
        return Promise.resolve({
          docs: [
            {
              id: 7,
              customerId: "111-222-3333",
              monthlyBudget: 3040,
              client: { id: 1, googleAdsCustomerId: "999-888-7777", dashboardConversionActions: "" },
            },
          ],
          totalDocs: 1,
        });
      }
      if (args.collection === "google-ads-campaign-budgets") {
        // No existing budget row → route should create.
        return Promise.resolve({ docs: [], totalDocs: 0 });
      }
      if (args.collection === "users") {
        return Promise.resolve({ docs: [{ id: 42 }], totalDocs: 1 });
      }
      return Promise.resolve({ docs: [], totalDocs: 0 });
    });

    // Growth Tools LAST_MONTH per-campaign metrics.
    globalFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
      json: () =>
        Promise.resolve({
          campaigns: [
            { campaignId: "c1", campaignName: "Brand", campaignStatus: "ENABLED", conversions: 20, cost: 1000, dailyBudget: 50 },
            { campaignId: "c2", campaignName: "Generic", campaignStatus: "ENABLED", conversions: 5, cost: 1000, dailyBudget: 40 },
          ],
        }),
    } as Response);

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.accountsProcessed).toBe(1);
    expect(body.accountsWithRecommendations).toBe(1);

    // Calls Growth Tools with LAST_MONTH and the linked client's CID (digits only).
    const fetchBody = JSON.parse((globalFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(fetchBody.dateRange).toBe("LAST_MONTH");
    expect(fetchBody.customerId).toBe("9998887777");

    // Persists recommendations (create, since no existing rows) and never pushes
    // to Google Ads (no campaign-budgets/push fetch).
    expect(mockPayload.create).toHaveBeenCalled();
    const pushed = globalFetch.mock.calls.some(([url]) =>
      String(url).includes("campaign-budgets/push"),
    );
    expect(pushed).toBe(false);

    // The created budget row carries an advisory recommendedDailyBudget.
    const createdBudget = mockPayload.create.mock.calls.find(
      ([args]: [{ collection: string }]) => args.collection === "google-ads-campaign-budgets",
    );
    expect(createdBudget).toBeDefined();
    expect(createdBudget![0].data.recommendedDailyBudget).toBeGreaterThan(0);

    const approval = mockPayload.create.mock.calls.find(
      ([args]: [{ collection: string }]) => args.collection === "agent-approval-queue",
    );
    expect(approval?.[0].data.rendered.internalMarkdown).toContain("Current daily budget");
    expect(approval?.[0].data.rendered.internalMarkdown).toContain("$50.00/day");

    // Notifies admins with the new kind.
    const notif = mockPayload.create.mock.calls.find(
      ([args]: [{ collection: string }]) => args.collection === "notifications",
    );
    expect(notif).toBeDefined();
    expect(notif![0].data.kind).toBe("google-ads-budget-review");
  });
});
