import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutstandingContactRow } from "@/lib/invoice-statement-snapshot";

const fetchOutstandingContacts = vi.fn();
const getValidGmailToken = vi.fn();
const createGmailDraft = vi.fn();
const loadStatementTemplates = vi.fn();
const getPayload = vi.fn();

vi.mock("payload", () => ({ getPayload: (...args: unknown[]) => getPayload(...args) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/invoice-statement-snapshot", async () => {
  const actual = await vi.importActual<typeof import("@/lib/invoice-statement-snapshot")>(
    "@/lib/invoice-statement-snapshot",
  );
  return {
    ...actual,
    fetchOutstandingContacts: (...args: unknown[]) => fetchOutstandingContacts(...args),
  };
});
vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: (...args: unknown[]) => getValidGmailToken(...args),
}));
vi.mock("@/lib/gmail-service", () => ({
  createGmailDraft: (...args: unknown[]) => createGmailDraft(...args),
}));
vi.mock("@/lib/invoice-statement-templates", () => ({
  loadStatementTemplates: (...args: unknown[]) => loadStatementTemplates(...args),
}));

import { executeOverdueEmailTool } from "@/lib/agents/optimate-invoice/overdue-email-tools";

const TEMPLATES = {
  subjectTemplate: "Outstanding with Optimise Digital — {totalOutstanding}",
  greeting: "Hi {contactFirstName},",
  openingLine: "Please action or pay the overdue invoices below.",
  summaryTemplate:
    "Total outstanding: {totalOutstanding} across {unpaidCount} invoices, with {totalOverdue} overdue.",
  paymentMethodsHtml: "<p>Pay via the invoice link.</p>",
  closingLine: "Any questions, reply to this email.",
  signOff: "Thanks,",
  senderName: "Maria",
};

function overdueRow(
  overrides: Partial<OutstandingContactRow> = {},
): OutstandingContactRow {
  return {
    contactId: "xero-1",
    contactName: "We Can Quit",
    firstName: "Alex",
    lastName: "Quit",
    emailAddress: "alex@wecanquit.example",
    unpaid: [
      {
        invoiceId: "inv-177",
        invoiceNumber: "INV-000177",
        reference: "Monthly Web Hosting, May 2026",
        date: "2026-05-01",
        dueDate: "2026-06-01",
        total: 76,
        amountDue: 76,
        status: "AUTHORISED",
        onlineInvoiceUrl: "https://in.xero.com/inv-177",
      },
    ],
    paid: [],
    totalOutstanding: 76,
    totalOverdue: 76,
    unpaidCount: 1,
    overdueCount: 1,
    ...overrides,
  };
}

const admin = { id: 7, role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  getPayload.mockResolvedValue({});
  loadStatementTemplates.mockResolvedValue({
    templates: TEMPLATES,
    signatureHtml: "<p>Optimise</p>",
  });
  fetchOutstandingContacts.mockResolvedValue({
    ok: true,
    rows: [
      overdueRow(),
      overdueRow({
        contactId: "xero-2",
        contactName: "Current Client",
        emailAddress: "now@example.com",
        overdueCount: 0,
        totalOverdue: 0,
      }),
      overdueRow({
        contactId: "xero-3",
        contactName: "No Email Co",
        firstName: "Sam",
        lastName: "None",
        emailAddress: "",
        totalOutstanding: 150,
        totalOverdue: 150,
      }),
    ],
  });
  getValidGmailToken.mockResolvedValue({
    ok: true,
    accessToken: "token",
    email: "peter@optimisedigital.online",
    userEmail: "peter@optimisedigital.online",
  });
  createGmailDraft.mockResolvedValue({ draftId: "d1", messageId: "m1" });
});

describe("InvoiceMate overdue statement emails", () => {
  it("groups overdue clients and previews templated emails without Gmail", async () => {
    const result = (await executeOverdueEmailTool(
      "previewOverdueStatementEmails",
      {},
      admin,
    )) as {
      overdueClientCount: number;
      missingEmailCount: number;
      askNext: string;
      clients: Array<{ contactName: string; recipientEmail: string; skipReason?: string; subject: string; text: string }>;
    };

    expect(result.overdueClientCount).toBe(2);
    expect(result.missingEmailCount).toBe(1);
    expect(result.askNext).toContain("Would you like to send this to Gmail Draft?");
    expect(result.clients.map((c) => c.contactName)).toEqual([
      "No Email Co",
      "We Can Quit",
    ]);
    const withEmail = result.clients.find((c) => c.contactName === "We Can Quit");
    const missing = result.clients.find((c) => c.contactName === "No Email Co");
    expect(withEmail?.recipientEmail).toBe("alex@wecanquit.example");
    expect(withEmail?.subject).toBe("Just checking in on INV-000177");
    expect(withEmail?.text).toContain("Just checking in on this invoice. Can you look into it for us?");
    expect(withEmail?.text).toContain("INV-000177");
    expect(withEmail?.text).not.toMatch(/Quick consolidated summary/);
    expect(missing?.skipReason).toMatch(/No stored email/i);
    expect(createGmailDraft).not.toHaveBeenCalled();
  });

  it("refuses Gmail drafts until the user confirms", async () => {
    const result = await executeOverdueEmailTool(
      "createOverdueStatementGmailDrafts",
      {},
      admin,
    );
    expect(result).toMatchObject({
      error: expect.stringContaining("would you like to send this to Gmail Draft?"),
    });
    expect(createGmailDraft).not.toHaveBeenCalled();
  });

  it("creates one Gmail draft per overdue client using the stored email", async () => {
    const result = (await executeOverdueEmailTool(
      "createOverdueStatementGmailDrafts",
      { confirmed: true },
      admin,
    )) as {
      createdCount: number;
      skipped: Array<{ contactName: string }>;
      created: Array<{ to: string; contactName: string }>;
    };

    expect(createGmailDraft).toHaveBeenCalledTimes(1);
    expect(createGmailDraft.mock.calls[0][1]).toMatchObject({
      to: "alex@wecanquit.example",
    });
    expect(createGmailDraft.mock.calls[0][1].htmlBody).toContain("INV-000177");
    expect(createGmailDraft.mock.calls[0][1].htmlBody).toContain("Just checking in on this invoice");
    expect(createGmailDraft.mock.calls[0][1].htmlBody).not.toMatch(/[—–]/);
    expect(createGmailDraft.mock.calls[0][1].subject).toBe("Just checking in on INV-000177");
    expect(result.createdCount).toBe(1);
    expect(result.created[0].to).toBe("alex@wecanquit.example");
    expect(result.skipped).toEqual([
      expect.objectContaining({ contactName: "No Email Co" }),
    ]);
  });

  it("refuses invoice-less users", async () => {
    const result = await executeOverdueEmailTool(
      "previewOverdueStatementEmails",
      {},
      { id: 3, role: "specialist", featureAccess: [] },
    );
    expect(result).toEqual({ error: "You do not have access to invoices." });
    expect(fetchOutstandingContacts).not.toHaveBeenCalled();
  });

  it("does not invent a recipient when Gmail is disconnected", async () => {
    getValidGmailToken.mockResolvedValue({ ok: false, reason: "not-connected" });
    const result = await executeOverdueEmailTool(
      "createOverdueStatementGmailDrafts",
      { confirmed: true },
      admin,
    );
    expect(result).toMatchObject({
      error: expect.stringContaining("Gmail is not connected"),
    });
    expect(createGmailDraft).not.toHaveBeenCalled();
  });
});
