import { describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";
import {
  buildMailClientContext,
  formatMailClientContext,
  MAX_CLIENT_CONTEXT_CHARS,
  type MailClientFacts,
} from "@/lib/mail/client-context";

const NOW = new Date("2026-10-21T02:00:00.000Z");

function profile() {
  return {
    id: 7,
    name: "Acme Pty Ltd",
    slug: "acme",
    isActive: true,
    generatedAt: NOW.toISOString(),
    groupsReturned: [],
    identity: { websiteUrl: null, websiteType: null, services: ["google_ads", "seo"], clientType: null, isAgency: false },
    contact: {
      contactName: "Jo",
      contactEmail: "jo@acme.com",
      contactPhone: null,
      additionalContacts: [],
      accountManagers: [{ name: "Sam Lee", email: "sam@optimise.com" }],
    },
    commercial: {
      clientStartDate: null,
      campaignStartDate: null,
      retainerStartDate: null,
      monthlyRetainer: 9876,
      monthlyAdSpendBudget: 3000,
      monthlyAdSpendBudgetSource: "budget_management",
      setupFee: 5432,
      revenueSharePercent: 17,
      oneOffProjects: [],
      historicalRevenueByYear: [{ year: 2025, amount: 123456 }],
    },
    contracts: {
      totalCount: 1,
      returned: 1,
      latest: {
        contractTitle: "SEO + Ads 2026",
        status: "signed",
        contractStartDate: "2026-02-01T00:00:00.000Z",
        contractEndDate: "2027-01-31T00:00:00.000Z",
        contractTerm: "12 months",
        clientSignedAt: "2026-01-20T03:00:00.000Z",
        monthlyRetainer: 9876,
        setupFee: 5432,
      },
      items: [],
    },
    invoices: {
      source: "invoice-statement-drafts",
      totalDrafts: 1,
      returned: 1,
      latest: {
        totalOutstanding: 4400,
        totalOverdue: 2200,
        snapshotCapturedAt: "2026-10-20T00:00:00.000Z",
        unpaidInvoices: [
          { invoiceNumber: "INV-101", dueDate: "2026-10-01", amountDue: 2200 },
          { invoiceNumber: "INV-102", dueDate: "2026-11-01", amountDue: 2200 },
        ],
      },
      items: [],
    },
  };
}

const profileMock = vi.fn();
vi.mock("@/lib/optimate-client-profile", () => ({
  buildOptimateClientProfile: (...args: unknown[]) => profileMock(...args),
}));

function fakePayload(failing: string[] = []): Payload {
  const docs: Record<string, unknown[]> = {
    "gsc-snapshots": [
      { periodStart: "2026-09-01", totalClicks: 1200, totalImpressions: 40000 },
      { periodStart: "2026-08-01", totalClicks: 1000, totalImpressions: 36000 },
      { periodStart: "2025-09-01", totalClicks: 800, totalImpressions: 30000 },
    ],
    "google-ads-snapshots": [
      { dateRangeLabel: "MONTH_2026-09", rows: [{ clicks: 300, conversions: 20, spend: 1000 }] },
      { dateRangeLabel: "MONTH_2026-08", rows: [{ clicks: 250, conversions: 25, spend: 1000 }] },
    ],
    "client-email-summaries": [{ emailDate: "2026-10-10T00:00:00.000Z", summary: "Jo asked for a quote on a new landing page." }],
  };
  return {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (failing.includes(collection)) throw new Error(`${collection} down`);
      return { docs: docs[collection] ?? [] };
    }),
  } as unknown as Payload;
}

describe("buildMailClientContext", () => {
  it("includes contract, invoice, GSC, Ads and timeline facts and excludes internal fields", async () => {
    profileMock.mockResolvedValueOnce(profile());
    const ctx = await buildMailClientContext(fakePayload(), 7, NOW);
    expect(ctx?.clientId).toBe(7);
    expect(ctx?.clientName).toBe("Acme Pty Ltd");
    const text = ctx?.text ?? "";
    expect(text).toContain("Services we provide: Google Ads, SEO");
    expect(text).toContain("Account managers: Sam Lee");
    expect(text).toContain('Latest contract: "SEO + Ads 2026", status signed, starts 2026-02-01, ends 2027-01-31');
    expect(text).toContain("$4,400.00 outstanding, $2,200.00 overdue");
    expect(text).toContain("Overdue invoice INV-101 $2,200.00, due 2026-10-01");
    expect(text).not.toContain("INV-102");
    expect(text).toContain("Google Search Console clicks, 2026-09: 1,200 (+20% vs previous month, +50% vs same month last year)");
    expect(text).toContain("Google Ads, 2026-09: 300 clicks, 20 conversions, CPA $50.00");
    expect(text).toContain("Monthly Google Ads budget: $3,000.00");
    expect(text).toContain("2026-10-10: Jo asked for a quote");
    expect(text).not.toMatch(/9,?876|5,?432|123,?456|17%|retainer|revenue share|setup/i);
  });

  it("drops only the failing source's section", async () => {
    profileMock.mockResolvedValueOnce(profile());
    const ctx = await buildMailClientContext(fakePayload(["gsc-snapshots", "client-email-summaries"]), 7, NOW);
    const text = ctx?.text ?? "";
    expect(text).not.toContain("Search Console");
    expect(text).not.toContain("Recent email timeline");
    expect(text).toContain("Google Ads, 2026-09");
    expect(text).toContain("Latest contract");
  });

  it("returns null when the client does not exist", async () => {
    profileMock.mockResolvedValueOnce(null);
    expect(await buildMailClientContext(fakePayload(), 99, NOW)).toBeNull();
  });
});

describe("formatMailClientContext", () => {
  it("caps the block at MAX_CLIENT_CONTEXT_CHARS on a line boundary", () => {
    const facts: MailClientFacts = {
      clientName: "Acme",
      services: [],
      accountManagers: [],
      contract: null,
      invoices: {
        totalOutstanding: 1,
        totalOverdue: 1,
        asOf: null,
        overdue: [],
      },
      organic: null,
      ads: null,
      monthlyAdBudget: null,
      recentEmails: Array.from({ length: 30 }, (_, i) => ({ date: "2026-10-01", summary: `${i} ${"x".repeat(390)}` })),
    };
    const text = formatMailClientContext(facts);
    expect(text.length).toBeLessThanOrEqual(MAX_CLIENT_CONTEXT_CHARS);
    expect(text.endsWith("x")).toBe(true);
  });
});
