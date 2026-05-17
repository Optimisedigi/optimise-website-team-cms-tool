import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

interface MockPayload {
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  logger: { error: ReturnType<typeof vi.fn> };
}

const mockPayload: MockPayload = {
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
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
  process.env.STATEMENT_MIN_OUTSTANDING = "2";
  process.env.STATEMENT_SWEEP_MAX_DRAFTS = "200";
  // Reset find default to "no rows" / "no admins".
  mockPayload.find.mockImplementation(() =>
    Promise.resolve({ docs: [], totalDocs: 0 }),
  );
  mockPayload.create.mockResolvedValue({ id: 1 });
  mockPayload.update.mockResolvedValue({ id: 1 });
  mockPayload.delete.mockResolvedValue({ docs: [] });
  // Default: assume no pending drafts after sweep — individual tests
  // override this when they expect a notification to fire.
  mockPayload.count.mockResolvedValue({ totalDocs: 0 });
});

import { GET } from "@/app/(frontend)/api/invoice-statements/sweep/route";

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest("http://localhost/api/invoice-statements/sweep", {
    method: "GET",
    headers: authHeader ? { Authorization: authHeader } : {},
  });
}

function mockGrowthToolsResponse(
  rows: unknown[],
  status = 200,
): void {
  globalFetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(""),
    json: () => Promise.resolve(rows),
  } as Response);
}

const SAMPLE_CONTACT = {
  contactId: "xero-contact-1",
  contactName: "Acme Pty Ltd",
  firstName: "Alex",
  lastName: "Acme",
  emailAddress: "alex@acme.example",
  unpaid: [
    {
      invoiceId: "inv-1",
      invoiceNumber: "INV-001",
      reference: "Retainer",
      date: "2026-03-01",
      dueDate: "2026-03-15",
      total: 2200,
      amountDue: 2200,
      status: "AUTHORISED",
      onlineInvoiceUrl: "https://in.xero.com/inv-1",
    },
    {
      invoiceId: "inv-2",
      invoiceNumber: "INV-002",
      reference: "Retainer",
      date: "2026-04-01",
      dueDate: "2026-04-15",
      total: 2200,
      amountDue: 2200,
      status: "AUTHORISED",
      onlineInvoiceUrl: "https://in.xero.com/inv-2",
    },
  ],
  paid: [],
  totalOutstanding: 4400,
  totalOverdue: 2200,
  unpaidCount: 2,
  overdueCount: 1,
};

describe("GET /api/invoice-statements/sweep", () => {
  it("rejects requests without a CRON_SECRET bearer", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects a wrong bearer token", async () => {
    const res = await GET(makeRequest("Bearer wrong-token"));
    expect(res.status).toBe(401);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("creates a new pending draft when no existing pending row exists", async () => {
    mockGrowthToolsResponse([SAMPLE_CONTACT]);
    mockPayload.find.mockImplementation((args: { collection?: string; where?: unknown }) => {
      if (args?.collection === "invoice-statement-drafts") {
        return Promise.resolve({ docs: [] });
      }
      return Promise.resolve({ docs: [] });
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generated).toBe(1);
    expect(body.updatedPending).toBe(0);
    expect(body.contactsProcessed).toBe(1);

    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "invoice-statement-drafts",
        data: expect.objectContaining({
          status: "pending",
          xeroContactId: "xero-contact-1",
          contactName: "Acme Pty Ltd",
          recipientEmail: "alex@acme.example",
          totalOutstanding: 4400,
          unpaidCount: 2,
        }),
      }),
    );
  });

  it("updates the existing pending row instead of creating a duplicate", async () => {
    mockGrowthToolsResponse([SAMPLE_CONTACT]);
    let findCallCount = 0;
    mockPayload.find.mockImplementation((args: { collection?: string }) => {
      findCallCount++;
      if (args?.collection === "invoice-statement-drafts" && findCallCount === 1) {
        // First call: existing pending check.
        return Promise.resolve({
          docs: [{ id: 99, status: "pending" }],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generated).toBe(0);
    expect(body.updatedPending).toBe(1);

    expect(mockPayload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: "invoice-statement-drafts" }),
    );
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "invoice-statement-drafts", id: 99 }),
    );
  });

  it("expires pending rows older than 14 days", async () => {
    mockGrowthToolsResponse([]);
    mockPayload.find.mockImplementation((args: { where?: unknown }) => {
      const where = args?.where as
        | { and?: Array<{ generatedAt?: { less_than?: string } }> }
        | undefined;
      const isExpiryQuery = where?.and?.some((c) => c.generatedAt?.less_than);
      if (isExpiryQuery) {
        return Promise.resolve({
          docs: [{ id: 42 }, { id: 43 }],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expired).toBe(2);

    const expireCalls = mockPayload.update.mock.calls.filter(
      ([arg]) =>
        (arg as { data?: { status?: string } }).data?.status === "expired",
    );
    expect(expireCalls).toHaveLength(2);
  });

  it("aborts with 500 when the sweep cap is exceeded", async () => {
    process.env.STATEMENT_SWEEP_MAX_DRAFTS = "1";
    mockGrowthToolsResponse([SAMPLE_CONTACT, { ...SAMPLE_CONTACT, contactId: "x2" }]);

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("cap exceeded");
    expect(mockPayload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: "invoice-statement-drafts" }),
    );
  });

  it("creates notifications for every admin user when drafts were generated", async () => {
    mockGrowthToolsResponse([SAMPLE_CONTACT]);
    // 4 pending drafts in the queue after this sweep — the notification
    // title should reflect the total, not just this sweep's delta.
    mockPayload.count.mockResolvedValue({ totalDocs: 4 });
    let findCallCount = 0;
    mockPayload.find.mockImplementation((args: { collection?: string }) => {
      findCallCount++;
      if (args?.collection === "invoice-statement-drafts") {
        return Promise.resolve({ docs: [] });
      }
      if (args?.collection === "users") {
        return Promise.resolve({
          docs: [
            { id: 1, role: "admin" },
            { id: 2, role: "admin" },
          ],
        });
      }
      if (args?.collection === "clients") {
        return Promise.resolve({ docs: [] });
      }
      return Promise.resolve({ docs: [] });
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(2);

    // Stale invoice-statements-ready notifications are superseded before
    // new ones are created.
    expect(mockPayload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "notifications",
        where: { kind: { equals: "invoice-statements-ready" } },
      }),
    );

    const notifCalls = mockPayload.create.mock.calls.filter(
      ([arg]) => (arg as { collection?: string }).collection === "notifications",
    );
    expect(notifCalls).toHaveLength(2);
    expect(notifCalls[0][0].data).toMatchObject({
      kind: "invoice-statements-ready",
      url: "/admin/finance/invoice-statements",
      title: "4 client statements ready to review",
    });
  });

  it("does not notify or skip drafts when contacts list is empty", async () => {
    mockGrowthToolsResponse([]);
    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generated).toBe(0);
    expect(body.notified).toBe(0);
    const notifCalls = mockPayload.create.mock.calls.filter(
      ([arg]) => (arg as { collection?: string }).collection === "notifications",
    );
    expect(notifCalls).toHaveLength(0);
  });

  it("includes a contact with a single overdue invoice (overdue rule)", async () => {
    // Single unpaid invoice, but it's overdue — should still qualify.
    const singleOverdue = {
      ...SAMPLE_CONTACT,
      contactId: "single-overdue",
      unpaid: [SAMPLE_CONTACT.unpaid[0]],
      unpaidCount: 1,
      overdueCount: 1,
      totalOutstanding: 2200,
      totalOverdue: 2200,
    };
    mockGrowthToolsResponse([singleOverdue]);

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generated).toBe(1);
    expect(body.contactsProcessed).toBe(1);
  });

  it("excludes a contact with one unpaid invoice that is not overdue", async () => {
    // Single unpaid, none overdue — fails both rules, must not become a draft.
    const singleNotOverdue = {
      ...SAMPLE_CONTACT,
      contactId: "single-not-overdue",
      unpaid: [SAMPLE_CONTACT.unpaid[0]],
      unpaidCount: 1,
      overdueCount: 0,
      totalOutstanding: 2200,
      totalOverdue: 0,
    };
    mockGrowthToolsResponse([singleNotOverdue]);

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generated).toBe(0);
    expect(body.contactsProcessed).toBe(0);
    expect(mockPayload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: "invoice-statement-drafts" }),
    );
  });

  it("expires pending drafts whose contact no longer qualifies", async () => {
    // Growth Tools no longer returns the ghost contact, but a pending draft
    // for it still exists — it should be auto-expired.
    mockGrowthToolsResponse([SAMPLE_CONTACT]);
    mockPayload.find.mockImplementation((args: { collection?: string; where?: unknown }) => {
      const where = args?.where as
        | { and?: Array<{ generatedAt?: { less_than?: string } }> }
        | { status?: { equals?: string } }
        | undefined;
      // First find: per-contact existing-pending check for the sweep contact.
      // Second find: 14-day expiry query (has generatedAt clause).
      // Third find: all-pending query for state-based expiry.
      if (
        where &&
        "and" in where &&
        where.and?.some((c) => c.generatedAt?.less_than)
      ) {
        return Promise.resolve({ docs: [] });
      }
      if (
        where &&
        "status" in where &&
        (where as { status: { equals: string } }).status?.equals === "pending"
      ) {
        // All-pending query — includes a ghost contact not in qualifying set.
        return Promise.resolve({
          docs: [
            { id: 77, xeroContactId: "ghost-no-longer-qualifies" },
            { id: 78, xeroContactId: SAMPLE_CONTACT.contactId },
          ],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expired).toBe(1);
    // The ghost row (id 77) is expired; the row matching this sweep (id 78) is not.
    const expireCalls = mockPayload.update.mock.calls.filter(
      ([arg]) =>
        (arg as { id?: number; data?: { status?: string } }).data?.status ===
          "expired",
    );
    expect(expireCalls).toHaveLength(1);
    expect((expireCalls[0][0] as { id: number }).id).toBe(77);
  });
});
