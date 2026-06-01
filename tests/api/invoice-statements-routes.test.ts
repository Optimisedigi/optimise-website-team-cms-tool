import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  findGlobal: vi.fn(),
  update: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

const mockLogActivity = vi.fn(() => Promise.resolve());
vi.mock("@/lib/activity-log", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

const globalFetch = vi.fn();
vi.stubGlobal("fetch", globalFetch);

const TEMPLATES_GLOBAL = {
  statementFromEmail: "accounts@optimisedigital.online",
  statementReplyToEmail: "",
  statementCcEmails: "peter@optimisedigital.online",
  statementSubjectTemplate:
    "Your account with Optimise Digital — {totalOutstanding} outstanding across {unpaidCount} invoices",
  statementGreeting: "Hi {contactFirstName},",
  statementOpeningLine: "Quick consolidated summary of your account.",
  statementSummaryTemplate:
    "Total outstanding: {totalOutstanding} across {unpaidCount} invoices.",
  statementPaymentMethodsHtml: "<p>Bank deposit: BSB 062-692, Account 1117 6620</p>",
  statementClosingLine: "Any questions, just reply.",
  statementSignOff: "Thanks,",
  statementSenderName: "Maria",
  signatureHtml: "<div>BRAND_SIG</div>",
};

const DRAFT_ROW = {
  id: 7,
  status: "pending",
  xeroContactId: "xero-1",
  contactName: "Acme Pty Ltd",
  recipientEmail: "alex@acme.example",
  customMessage: "Saved note",
  greetingOverride: null,
  snapshot: {
    contact: {
      contactId: "xero-1",
      contactName: "Acme Pty Ltd",
      firstName: "Alex",
      lastName: "Acme",
      emailAddress: "alex@acme.example",
    },
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
    ],
    paid: [],
    totalOutstanding: 2200,
    totalOverdue: 2200,
    unpaidCount: 1,
    overdueCount: 1,
    capturedAt: "2026-05-02T08:00:00+10:00",
  },
};

const PARAMS = { params: Promise.resolve({ id: "7" }) };

function postRequest(path: string, body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROWTH_TOOLS_URL = "https://growth.test";
  process.env.INTERNAL_API_KEY = "internal";
  process.env.STATEMENT_REFRESH_BACKOFF_MS = "0";
  mockPayload.auth.mockResolvedValue({ user: { id: 99, email: "admin@example.com" } });
  mockPayload.findByID.mockResolvedValue(DRAFT_ROW);
  mockPayload.findGlobal.mockResolvedValue(TEMPLATES_GLOBAL);
  mockPayload.update.mockResolvedValue({ id: 7 });
  globalFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) } as Response);
});

describe("invoice statement preview route", () => {
  it("rejects unauthenticated previews before loading the draft", async () => {
    const { POST } = await import("@/app/(frontend)/api/invoice-statements/[id]/preview/route");
    mockPayload.auth.mockResolvedValueOnce({ user: null });

    const res = await POST(postRequest("/api/invoice-statements/7/preview"), PARAMS);

    expect(res.status).toBe(401);
    expect(mockPayload.findByID).not.toHaveBeenCalled();
  });

  it("renders preview from an unsaved custom message and greeting override without persisting the message", async () => {
    const { POST } = await import("@/app/(frontend)/api/invoice-statements/[id]/preview/route");

    const res = await POST(
      postRequest("/api/invoice-statements/7/preview", {
        customMessage: "Please prioritise this today.",
        greetingOverride: "Hi accounts team,",
      }),
      PARAMS,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.subject).toContain("$2,200.00");
    expect(body.html).toContain("Please prioritise this today.");
    expect(body.html).toContain("Hi accounts team,");
    // The unsaved custom message is never written back to the draft.
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("is read-only: renders the stored snapshot without hitting Xero or writing to the DB", async () => {
    // Preview fires on every debounced keystroke, so it must not re-pull from
    // Xero (no fetch) and must not persist (no update). Freshness is handled
    // on modal open via /refresh-snapshot.
    const { POST } = await import("@/app/(frontend)/api/invoice-statements/[id]/preview/route");

    const res = await POST(postRequest("/api/invoice-statements/7/preview"), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    // Renders the stored snapshot's existing link.
    expect(body.html).toContain("https://in.xero.com/inv-1");
    expect(globalFetch).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
  });
});

describe("invoice statement refresh-snapshot route", () => {
  it("returns 502 and leaves the draft untouched when every Growth Tools attempt fails", async () => {
    const { POST } = await import("@/app/(frontend)/api/invoice-statements/[id]/refresh-snapshot/route");
    // The helper retries with backoff; all attempts must fail to surface 502.
    globalFetch.mockResolvedValue({ ok: false, status: 503 } as Response);

    const res = await POST(postRequest("/api/invoice-statements/7/refresh-snapshot"), PARAMS);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: "Growth Tools fetch failed (503)" });
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("updates the draft with fresh totals and falls back to the canonical Xero contact email", async () => {
    const { POST } = await import("@/app/(frontend)/api/invoice-statements/[id]/refresh-snapshot/route");
    globalFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              contactId: "xero-1",
              contactName: "Acme Pty Ltd",
              firstName: "Alex",
              lastName: "Acme",
              emailAddress: "",
              unpaid: [
                {
                  invoiceId: "inv-2",
                  invoiceNumber: "INV-002",
                  reference: "Retainer",
                  date: "2026-04-01",
                  dueDate: "2026-04-15",
                  total: 3300,
                  amountDue: 3300,
                  status: "AUTHORISED",
                  onlineInvoiceUrl: "https://in.xero.com/inv-2",
                },
              ],
              paid: [],
              totalOutstanding: 3300,
              totalOverdue: 3300,
              unpaidCount: 1,
              overdueCount: 1,
            },
          ]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { contactId: "xero-1", name: "Acme Pty Ltd", emailAddress: "accounts@acme.example" },
          ]),
      } as Response);

    const res = await POST(postRequest("/api/invoice-statements/7/refresh-snapshot"), PARAMS);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.snapshot.totalOutstanding).toBe(3300);
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "invoice-statement-drafts",
        id: "7",
        data: expect.objectContaining({
          recipientEmail: "accounts@acme.example",
          totalOutstanding: 3300,
          unpaidCount: 1,
        }),
      }),
    );
  });

  it("zeroes the snapshot and reports allPaid when the contact no longer has outstanding rows", async () => {
    const { POST } = await import("@/app/(frontend)/api/invoice-statements/[id]/refresh-snapshot/route");
    globalFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response);

    const res = await POST(postRequest("/api/invoice-statements/7/refresh-snapshot"), PARAMS);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ allPaid: true });
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalOutstanding: 0,
          totalOverdue: 0,
          unpaidCount: 0,
          overdueCount: 0,
        }),
      }),
    );
  });
});

describe("invoice statement reject route", () => {
  it("rejects only pending or failed drafts and never sends external email", async () => {
    const { POST } = await import("@/app/(frontend)/api/invoice-statements/[id]/reject/route");
    mockPayload.findByID.mockResolvedValueOnce({ ...DRAFT_ROW, status: "approved" });

    const res = await POST(postRequest("/api/invoice-statements/7/reject", { reason: "Paid" }), PARAMS);

    expect(res.status).toBe(409);
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("marks a failed draft rejected with reviewer and trims a long reason", async () => {
    const { POST } = await import("@/app/(frontend)/api/invoice-statements/[id]/reject/route");
    mockPayload.findByID.mockResolvedValueOnce({ ...DRAFT_ROW, status: "failed" });
    const reason = "x".repeat(2100);

    const res = await POST(postRequest("/api/invoice-statements/7/reject", { reason }), PARAMS);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "invoice-statement-drafts",
        id: "7",
        data: expect.objectContaining({
          status: "rejected",
          reviewedBy: 99,
          rejectionReason: "x".repeat(2000),
        }),
      }),
    );
    expect(globalFetch).not.toHaveBeenCalled();
  });
});
