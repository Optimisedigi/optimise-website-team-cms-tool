import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

interface MockPayload {
  findByID: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  findGlobal: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  auth: ReturnType<typeof vi.fn>;
}

const mockPayload: MockPayload = {
  findByID: vi.fn(),
  find: vi.fn(),
  findGlobal: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  auth: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/activity-log", () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}));

const globalFetch = vi.fn();
vi.stubGlobal("fetch", globalFetch);

import { POST as approveSend } from "@/app/(frontend)/api/invoice-statements/[id]/approve-send/route";

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
  customMessage: null,
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
    capturedAt: "2026-05-02T08:00:00+10:00",
  },
};

function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost/api/invoice-statements/7/approve-send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PARAMS = { params: Promise.resolve({ id: "7" }) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BREVO_API_KEY = "brevo-test";
  process.env.GROWTH_TOOLS_URL = "https://growth.test";
  process.env.INTERNAL_API_KEY = "internal";
  process.env.STATEMENT_MAX_PER_MONTH = "1000";
  process.env.STATEMENT_MAX_PER_HOUR = "50";
  process.env.STATEMENT_MIN_DAYS_BETWEEN_SENDS = "20";

  mockPayload.auth.mockResolvedValue({ user: { id: 99, featureAccess: ["nav:invoices"] } });
  mockPayload.findByID.mockResolvedValue(DRAFT_ROW);
  mockPayload.findGlobal.mockResolvedValue(TEMPLATES_GLOBAL);
  mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
  mockPayload.update.mockResolvedValue({ id: 7 });

  // Default fetch: PDFs return bytes, Brevo returns success.
  globalFetch.mockImplementation(async (url: string) => {
    if (url.includes("/pdf")) {
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from("PDF").buffer),
      } as Response;
    }
    if (url.includes("brevo.com")) {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ messageId: "msg-abc" }),
      } as Response;
    }
    return { ok: false, status: 404, json: () => Promise.resolve({}) } as Response;
  });
});

describe("POST /api/invoice-statements/:id/approve-send", () => {
  it("rejects unauthenticated requests", async () => {
    mockPayload.auth.mockResolvedValueOnce({ user: null });
    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(401);
    expect(globalFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("brevo.com"),
      expect.anything(),
    );
  });

  it("returns 400 when recipient email is empty", async () => {
    mockPayload.findByID.mockResolvedValueOnce({
      ...DRAFT_ROW,
      recipientEmail: "",
    });
    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Recipient");
  });

  it("returns 400 when the CC list contains an invalid email", async () => {
    mockPayload.findGlobal.mockResolvedValueOnce({
      ...TEMPLATES_GLOBAL,
      statementCcEmails: "peter@optimisedigital.online, not-an-email",
    });
    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not-an-email");
    expect(globalFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("brevo.com"),
      expect.anything(),
    );
  });

  it("trips the monthly cap with a 429", async () => {
    process.env.STATEMENT_MAX_PER_MONTH = "1";
    mockPayload.find.mockImplementation(() =>
      Promise.resolve({ docs: [], totalDocs: 5 }),
    );
    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("monthly cap");
  });

  it("does not block sends for the per-contact cooldown", async () => {
    mockPayload.find.mockImplementation((args: { where?: { and?: Array<{ xeroContactId?: unknown }> } }) => {
      const isCooldownQuery = args?.where?.and?.some(
        (c) => c.xeroContactId !== undefined,
      );
      if (isCooldownQuery) {
        return Promise.resolve({ docs: [], totalDocs: 1 });
      }
      return Promise.resolve({ docs: [], totalDocs: 0 });
    });

    const res = await approveSend(makeRequest(), PARAMS);

    expect(res.status).toBe(200);
  });

  it("calls Brevo with correct recipient + cc + attachments and persists success", async () => {
    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(200);

    const brevoCall = globalFetch.mock.calls.find(([url]) =>
      String(url).includes("brevo.com"),
    );
    expect(brevoCall).toBeDefined();
    const brevoBody = JSON.parse(brevoCall![1].body);
    expect(brevoBody.to).toEqual([
      { email: "alex@acme.example", name: "Acme Pty Ltd" },
    ]);
    expect(brevoBody.cc).toEqual([
      { email: "peter@optimisedigital.online" },
    ]);
    expect(brevoBody.sender).toEqual({
      email: "accounts@optimisedigital.online",
      name: "Optimise Digital",
    });
    expect(brevoBody.attachment).toHaveLength(2); // both PDFs fetched
    expect(brevoBody.htmlContent).toContain("BRAND_SIG");
    expect(brevoBody.subject).toContain("$4,400.00");

    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "invoice-statement-drafts",
        id: "7",
        data: expect.objectContaining({
          status: "approved",
          postmarkMessageId: "msg-abc",
          ccList: "peter@optimisedigital.online",
        }),
      }),
    );
  });

  it("flips status to failed and returns 502 when Brevo errors", async () => {
    globalFetch.mockImplementation(async (url: string) => {
      if (url.includes("/pdf")) {
        return {
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from("PDF").buffer),
        } as Response;
      }
      return {
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({ code: "unauthorized", message: "Invalid api-key" }),
      } as Response;
    });

    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(502);

    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          sendError: expect.stringContaining("Invalid api-key"),
        }),
      }),
    );
  });

  it("accepts a comma-separated list of recipient emails", async () => {
    mockPayload.findByID.mockResolvedValueOnce({
      ...DRAFT_ROW,
      recipientEmail: "alex@acme.example, accounts@acme.example",
    });
    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(200);

    const brevoCall = globalFetch.mock.calls.find(([url]) =>
      String(url).includes("brevo.com"),
    );
    const brevoBody = JSON.parse(brevoCall![1].body);
    expect(brevoBody.to).toEqual([
      { email: "alex@acme.example", name: "Acme Pty Ltd" },
      { email: "accounts@acme.example" },
    ]);

    // recipientEmail persisted back normalised (single space after comma).
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmail: "alex@acme.example, accounts@acme.example",
        }),
      }),
    );
  });

  it("returns 400 when one recipient in the comma-separated list is invalid", async () => {
    const res = await approveSend(
      makeRequest({ recipientEmailOverride: "alex@acme.example, not-an-email" }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("not-an-email");
    expect(globalFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("brevo.com"),
      expect.anything(),
    );
  });

  it("allows resending a draft that is already approved", async () => {
    mockPayload.findByID.mockResolvedValueOnce({
      ...DRAFT_ROW,
      status: "approved",
    });
    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(200);
  });

  it("allows retry from a failed draft", async () => {
    mockPayload.findByID.mockResolvedValueOnce({
      ...DRAFT_ROW,
      status: "failed",
    });
    const res = await approveSend(makeRequest(), PARAMS);
    expect(res.status).toBe(200);
  });
});

// ── reject route ────────────────────────────────────────────────────────

import { POST as reject } from "@/app/(frontend)/api/invoice-statements/[id]/reject/route";

describe("POST /api/invoice-statements/:id/reject", () => {
  it("rejects unauthenticated requests", async () => {
    mockPayload.auth.mockResolvedValueOnce({ user: null });
    const res = await reject(
      makeRequest({ reason: "duplicate" }),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("flips status to rejected and stores the reason", async () => {
    const res = await reject(makeRequest({ reason: "duplicate" }), PARAMS);
    expect(res.status).toBe(200);
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "rejected",
          rejectionReason: "duplicate",
        }),
      }),
    );
  });

  it("refuses to reject an already-approved draft", async () => {
    mockPayload.findByID.mockResolvedValueOnce({
      ...DRAFT_ROW,
      status: "approved",
    });
    const res = await reject(makeRequest(), PARAMS);
    expect(res.status).toBe(409);
  });
});
