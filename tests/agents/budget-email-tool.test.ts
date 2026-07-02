/**
 * get_budget_management_email tool.
 *
 * Mocks `payload.findByID` (audit + linked client loaded server-side) and
 * `global.fetch` (the self-call to /api/google-ads-budgets/[id]/list and
 * /api/google-ads-audits/[id]/last-month-recap). Verifies:
 *   - missing auditId in context returns ok:false
 *   - this_month hits the /list endpoint with x-api-key and returns HTML
 *     containing the business name + monthly label
 *   - last_month hits the recap endpoint with x-api-key and renders the recap
 *     HTML
 *   - upstream HTTP errors propagate as ok:false
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFindByID = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({
    findByID: mockFindByID,
  })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { getBudgetManagementEmail } from "@/lib/agents/optimate-google-ads/tools/get-budget-management-email";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (extra: Partial<ToolContext["context"]> = {}): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_budget_email",
  context: { auditId: 7, clientId: 42, ...extra },
  log: vi.fn(),
});

beforeEach(() => {
  mockFindByID.mockReset();
  // Stable env so the tool can self-call.
  process.env.AUDIT_API_KEY = "test-key";
  process.env.CMS_BASE_URL = "http://localhost:3004";
  // Reset fetch between tests.
  // @ts-expect-error - test override
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("get_budget_management_email", () => {
  it("returns ok:false when auditId is missing from context", async () => {
    const ctx: ToolContext = {
      agentName: "optimate-google-ads",
      agentRunId: "run_no_audit",
      context: {},
      log: vi.fn(),
    };
    const args = getBudgetManagementEmail.validate!({ mode: "this_month" });
    const result = await getBudgetManagementEmail.execute(args, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/auditId/);
  });

  it("rejects an unknown mode at validate time", () => {
    expect(() => getBudgetManagementEmail.validate!({ mode: "yesterday" })).toThrow(
      /mode must be/i,
    );
  });

  it("accepts an explicit auditId for portfolio-mode per-client drafts", () => {
    expect(getBudgetManagementEmail.validate!({ mode: "this_month", auditId: 7 })).toEqual({
      mode: "this_month",
      auditId: 7,
    });
  });

  it("this_month: accepts LAST_MONTH campaign metrics for monthly report breakdowns", () => {
    expect(getBudgetManagementEmail.validate!({ mode: "this_month", campaignMetricsRange: "LAST_MONTH", auditId: 7 })).toEqual({
      mode: "this_month",
      campaignMetricsRange: "LAST_MONTH",
      auditId: 7,
    });
  });

  it("this_month: hits /list with x-api-key and returns HTML containing the business name", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 7,
      businessName: "Acme Plumbing",
      monthlyBudget: 1000,
      client: { id: 42, slug: "acme", clientPin: "1234" },
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          monthlyBudget: 1000,
          campaigns: [
            {
              campaignId: "c1",
              campaignName: "Brand Search",
              budgetPercentage: 100,
              calculatedDailyBudget: 33,
              actualDailyBudget: 30,
              bidStrategy: "manual_cpc",
              impressions: 1000,
              clicks: 80,
              avgCpc: 1.25,
              conversions: 5,
              mtdSpend: 200,
              enabled: true,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getBudgetManagementEmail.validate!({ mode: "this_month" });
    const result = await getBudgetManagementEmail.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://localhost:3004/api/google-ads-budgets/7/list?reportOnly=1");
    expect((init as RequestInit).method).toBe("GET");
    expect(((init as RequestInit).headers as Record<string, string>)["x-api-key"]).toBe(
      "test-key",
    );

    const data = result.data as { mode: string; subject: string; html: string; monthLabel: string };
    expect(data.mode).toBe("this_month");
    expect(data.subject).toContain("Acme Plumbing");
    expect(data.subject).toContain("Google Ads Budget Report");
    expect(data.html.startsWith('<div style="font-family:Arial')).toBe(true);
    // Campaign breakdown row renders the campaign name verbatim.
    expect(data.html).toContain("Brand Search");
    expect(data.html).toContain("google-dashboard/acme");
    expect(data.html).toContain("PIN: 1234");
  });

  it("this_month with LAST_MONTH campaign metrics: passes range=LAST_MONTH to the list route and renders full completed-month budget math", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));

    mockFindByID.mockResolvedValueOnce({
      id: 7,
      businessName: "Acme Plumbing",
      monthlyBudget: 1000,
      client: { id: 42, slug: "acme", clientPin: "1234" },
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          monthlyBudget: 1000,
          campaigns: [
            {
              campaignId: "c1",
              campaignName: "Last Month Search",
              budgetPercentage: 100,
              calculatedDailyBudget: 33,
              actualDailyBudget: 30,
              bidStrategy: "manual_cpc",
              impressions: 2000,
              clicks: 120,
              avgCpc: 1.5,
              conversions: 8,
              mtdSpend: 360,
              enabled: true,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getBudgetManagementEmail.validate!({ mode: "this_month", campaignMetricsRange: "LAST_MONTH" });
    const result = await getBudgetManagementEmail.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://localhost:3004/api/google-ads-budgets/7/list?reportOnly=1&range=LAST_MONTH&skipPersist=1");
    const data = result.data as { html: string; monthLabel: string; subject: string };
    expect(data.monthLabel).toBe("June 2026");
    expect(data.subject).toBe("Acme Plumbing - Google Ads Budget Report - June 2026");
    expect(data.html).toContain("Last Month Search");
    expect(data.html).toContain("Vertical line shows target spend to date: $1,000 (100% of month).");
    expect(data.html).toContain("Behind expected pace by $640");
    expect(data.html).toContain("$360");
  });

  it("last_month: hits last-month-recap with x-api-key and renders recap HTML", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 7,
      businessName: "Acme Plumbing",
      monthlyBudget: 1000,
      client: { id: 42, slug: "acme", clientPin: "1234" },
    });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          monthLabel: "April 2026",
          monthlyBudget: 1000,
          totals: {
            spend: 950,
            clicks: 200,
            impressions: 5000,
            conversions: 12,
            ctr: 4,
            avgCpc: 4.75,
            cpl: 79.17,
          },
          campaigns: [
            {
              campaignId: "c1",
              campaignName: "Brand Search",
              impressions: 5000,
              clicks: 200,
              cost: 950,
              conversions: 12,
              ctr: 4,
              avgCpc: 4.75,
              cpl: 79.17,
            },
          ],
          topByClicks: [],
          topByConversions: [],
          topBySpend: [],
          insights: [],
          searchTermsAvailable: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getBudgetManagementEmail.validate!({ mode: "last_month" });
    const result = await getBudgetManagementEmail.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3004/api/google-ads-audits/7/last-month-recap",
    );
    expect((init as RequestInit).method).toBe("POST");
    expect(((init as RequestInit).headers as Record<string, string>)["x-api-key"]).toBe(
      "test-key",
    );

    const data = result.data as { mode: string; subject: string; html: string; monthLabel: string };
    expect(data.mode).toBe("last_month");
    expect(data.monthLabel).toBe("April 2026");
    expect(data.subject).toBe("Acme Plumbing - Google Ads Recap - April 2026");
    expect(data.html).toContain("April 2026 Recap");
    expect(data.html).toContain("Brand Search");
  });

  it("propagates upstream 5xx errors as ok:false with the status + body after retrying twice", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 7,
      businessName: "Acme",
      monthlyBudget: 0,
      client: null,
    });

    // Both attempts return 502 — must fail after two tries.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream broken: db timeout", { status: 502 }))
      .mockResolvedValueOnce(new Response("upstream broken: db timeout", { status: 502 }));
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getBudgetManagementEmail.validate!({ mode: "this_month" });
    const result = await getBudgetManagementEmail.execute(args, baseCtx());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/502/);
    // Richer error surface: the body should be included, not stripped.
    expect(result.error).toMatch(/db timeout/);
    // Confirm we actually retried.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx (caller's fault, retry won't help)", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 7,
      businessName: "Acme",
      monthlyBudget: 0,
      client: null,
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("missing audit", { status: 404 }));
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getBudgetManagementEmail.validate!({ mode: "this_month" });
    const result = await getBudgetManagementEmail.execute(args, baseCtx());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/404/);
    // 4xx: bail immediately, no retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("succeeds on retry when the first attempt 5xxs but the second succeeds", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 7,
      businessName: "Acme Plumbing",
      monthlyBudget: 1000,
      client: { id: 42, slug: "acme", clientPin: "1234" },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("transient", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            monthlyBudget: 1000,
            campaigns: [
              {
                campaignId: "c1",
                campaignName: "Brand Search",
                budgetPercentage: 100,
                calculatedDailyBudget: 33,
                actualDailyBudget: 30,
                bidStrategy: "manual_cpc",
                impressions: 1000,
                clicks: 80,
                avgCpc: 1.25,
                conversions: 5,
                mtdSpend: 200,
                enabled: true,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getBudgetManagementEmail.validate!({ mode: "this_month" });
    const result = await getBudgetManagementEmail.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const data = result.data as { html: string };
    expect(data.html).toContain("Brand Search");
  });

  it("retries once on network error before failing", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 7,
      businessName: "Acme",
      monthlyBudget: 0,
      client: null,
    });

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"));
    // @ts-expect-error - test override
    globalThis.fetch = fetchMock;

    const args = getBudgetManagementEmail.validate!({ mode: "this_month" });
    const result = await getBudgetManagementEmail.execute(args, baseCtx());

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECONNRESET/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false when AUDIT_API_KEY is not configured", async () => {
    delete process.env.AUDIT_API_KEY;
    const args = getBudgetManagementEmail.validate!({ mode: "this_month" });
    const result = await getBudgetManagementEmail.execute(args, baseCtx());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/AUDIT_API_KEY/);
  });
});
