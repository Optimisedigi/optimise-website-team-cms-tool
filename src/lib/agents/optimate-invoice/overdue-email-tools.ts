import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import type { ToolDef } from "@/lib/agents/_shared/llm/types";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { createGmailDraft } from "@/lib/gmail-service";
import { buildOverdueChaseEmail } from "@/lib/agents/optimate-invoice/overdue-chase-email";
import {
  fetchOutstandingContacts,
  outstandingRowToSnapshot,
  type OutstandingContactRow,
} from "@/lib/invoice-statement-snapshot";
import { loadStatementTemplates } from "@/lib/invoice-statement-templates";

export const OVERDUE_EMAIL_TOOL_NAMES = new Set([
  "previewOverdueStatementEmails",
  "createOverdueStatementGmailDrafts",
]);

const MAX_DRAFTS_PER_CALL = Number(
  process.env.INVOICE_MATE_OVERDUE_GMAIL_DRAFT_CAP ?? "25",
);

const EMAIL_RE = /.+@.+\..+/;

export const overdueEmailTools: ToolDef[] = [
  {
    name: "previewOverdueStatementEmails",
    description:
      "Group overdue Xero invoices by client and build one short chase email per client using statement invoice data (not the monthly account-statement template). Use when the user asks to chase overdue/outstanding invoices, email overdue clients, or draft payment reminders. Returns a per-client preview (contact, stored email, totals, invoice list, subject, plain-text body). Never sends mail. After showing the previews, ask: would you like to send this to Gmail Draft?",
    inputSchema: {
      type: "object",
      properties: {
        contactName: {
          type: "string",
          description:
            "Optional contact name filter. Omit to include every overdue client.",
        },
      },
      required: [],
    },
  },
  {
    name: "createOverdueStatementGmailDrafts",
    description:
      "Create one Gmail draft per overdue client using the short chase email (statement invoice data, stored Xero email). Never sends mail. Call only after previewOverdueStatementEmails and an explicit yes to 'would you like to send this to Gmail Draft?'. Requires the logged-in user's Gmail connection.",
    inputSchema: {
      type: "object",
      properties: {
        contactName: {
          type: "string",
          description:
            "Optional contact name filter matching the preview. Omit to draft every overdue client that has a stored email.",
        },
        confirmed: {
          type: "boolean",
          description:
            "Must be true. The user must have just confirmed they want Gmail drafts created.",
        },
      },
      required: ["confirmed"],
    },
  },
];

export interface OverdueEmailPreview {
  contactId: string;
  contactName: string;
  firstName: string;
  recipientEmail: string;
  totalOutstanding: number;
  totalOverdue: number;
  unpaidCount: number;
  overdueCount: number;
  invoices: Array<{
    invoiceNumber: string;
    amountDue: number;
    dueDate: string;
    description: string;
  }>;
  subject: string;
  text: string;
  skipReason?: string;
}

function canAccessInvoiceMate(user: unknown): boolean {
  return userHasFeature(user, "nav:invoices");
}

function matchesContactName(row: OutstandingContactRow, filter?: string): boolean {
  if (!filter?.trim()) return true;
  const needle = filter.trim().toLowerCase();
  return (
    row.contactName.toLowerCase().includes(needle) ||
    `${row.firstName} ${row.lastName}`.toLowerCase().includes(needle)
  );
}

function overdueRows(rows: OutstandingContactRow[], contactName?: string) {
  return rows
    .filter((row) => row.overdueCount >= 1)
    .filter((row) => matchesContactName(row, contactName))
    .sort((a, b) => b.totalOverdue - a.totalOverdue);
}

function userIdOf(user: unknown): number | null {
  if (!user || typeof user !== "object") return null;
  const id = (user as { id?: unknown }).id;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  return null;
}

async function loadSignatureHtml(): Promise<string> {
  const payload = await getPayload({ config });
  const loaded = await loadStatementTemplates(payload);
  return loaded.signatureHtml;
}

async function buildPreviews(
  rows: OutstandingContactRow[],
): Promise<OverdueEmailPreview[]> {
  const signatureHtml = await loadSignatureHtml();
  const capturedAt = new Date().toISOString();

  return rows.map((row) => {
    const snapshot = outstandingRowToSnapshot(row, capturedAt);
    const email = snapshot.contact.emailAddress.trim();
    const skipReason = EMAIL_RE.test(email)
      ? undefined
      : "No stored email address on this Xero contact";
    const built = buildOverdueChaseEmail(snapshot, signatureHtml);
    return {
      contactId: row.contactId,
      contactName: row.contactName,
      firstName: row.firstName,
      recipientEmail: email,
      totalOutstanding: row.totalOutstanding,
      totalOverdue: row.totalOverdue,
      unpaidCount: row.unpaidCount,
      overdueCount: row.overdueCount,
      invoices: row.unpaid.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        amountDue: inv.amountDue,
        dueDate: inv.dueDate,
        description: inv.reference,
      })),
      subject: built.subject,
      text: built.text,
      skipReason,
    };
  });
}

export async function executeOverdueEmailTool(
  name: string,
  args: Record<string, unknown>,
  user: unknown,
): Promise<unknown> {
  if (!OVERDUE_EMAIL_TOOL_NAMES.has(name)) {
    return { error: `Unknown overdue email tool: ${name}` };
  }
  if (!canAccessInvoiceMate(user)) {
    return { error: "You do not have access to invoices." };
  }

  if (name === "createOverdueStatementGmailDrafts" && args.confirmed !== true) {
    return {
      error:
        "Gmail drafts were not created. Preview the emails first, then ask the user: would you like to send this to Gmail Draft? Call again with confirmed=true only after they say yes.",
    };
  }

  const contactName =
    typeof args.contactName === "string" ? args.contactName : undefined;

  const fetched = await fetchOutstandingContacts();
  if (!fetched.ok) return { error: fetched.error };

  const rows = overdueRows(fetched.rows, contactName);

  if (name === "previewOverdueStatementEmails") {
    const previews = await buildPreviews(rows);
    return {
      overdueClientCount: previews.length,
      missingEmailCount: previews.filter((p) => p.skipReason).length,
      askNext:
        "Would you like to send this to Gmail Draft? Say yes and I will create one Gmail draft per client that has a stored email. Nothing is sent.",
      clients: previews,
    };
  }

  const userId = userIdOf(user);
  if (userId == null) {
    return { error: "Could not resolve the logged-in user for Gmail." };
  }

  const token = await getValidGmailToken(userId);
  if (!token.ok) {
    return {
      error:
        "Gmail is not connected for this user. Connect Gmail in OptiMate, then try again.",
      reason: token.reason,
    };
  }

  const previews = await buildPreviews(rows);
  const eligible = previews.filter((p) => !p.skipReason);
  const skipped = previews.filter((p) => p.skipReason);

  if (eligible.length > MAX_DRAFTS_PER_CALL) {
    return {
      error: `Too many overdue clients (${eligible.length}) to draft in one go. Cap is ${MAX_DRAFTS_PER_CALL}. Filter by contactName or raise INVOICE_MATE_OVERDUE_GMAIL_DRAFT_CAP.`,
      overdueClientCount: eligible.length,
      cap: MAX_DRAFTS_PER_CALL,
    };
  }

  const signatureHtml = await loadSignatureHtml();
  const capturedAt = new Date().toISOString();
  const created: Array<{
    contactName: string;
    to: string;
    subject: string;
    draftId: string;
    messageId: string;
  }> = [];
  const failed: Array<{ contactName: string; to: string; error: string }> = [];

  for (const preview of eligible) {
    const row = rows.find((r) => r.contactId === preview.contactId);
    if (!row) continue;
    const snapshot = outstandingRowToSnapshot(row, capturedAt);
    const built = buildOverdueChaseEmail(snapshot, signatureHtml);
    try {
      const draft = await createGmailDraft(token.accessToken, {
        to: preview.recipientEmail,
        subject: built.subject,
        htmlBody: built.html,
        appendSignature: false,
      });
      created.push({
        contactName: preview.contactName,
        to: preview.recipientEmail,
        subject: built.subject,
        draftId: draft.draftId,
        messageId: draft.messageId,
      });
    } catch (err) {
      failed.push({
        contactName: preview.contactName,
        to: preview.recipientEmail,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    createdCount: created.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    created,
    failed,
    skipped: skipped.map((p) => ({
      contactName: p.contactName,
      skipReason: p.skipReason,
    })),
  };
}
