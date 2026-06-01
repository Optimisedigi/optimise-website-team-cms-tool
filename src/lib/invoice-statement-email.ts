/**
 * Invoice Statement Email builder.
 *
 * Pure function — no I/O. Given a snapshot of outstanding invoices for a
 * single Xero contact, the editable global template values, the brand
 * signature HTML, and an optional custom message, returns `{ subject,
 * html, text }` ready to hand to Postmark.
 *
 * Layout (top \u2192 bottom):
 *   1. Greeting + optional custom message block
 *   2. Opening line
 *   3. Summary sentence with totals
 *   4. Outstanding invoices table (oldest first)
 *   5. Total outstanding footer row
 *   6. "PDFs attached" line (only if `attachmentsAttached`)
 *   7. Payment methods HTML block
 *   8. Closing line
 *   9. Sign-off
 *  10. Sender name
 *  11. Brand signature HTML
 */

export interface StatementInvoiceSnapshot {
  invoiceId: string;
  invoiceNumber: string;
  reference: string;
  date: string;
  dueDate: string;
  total: number;
  amountDue: number;
  status: string;
  onlineInvoiceUrl: string | null;
}

export interface StatementContactSnapshot {
  contactId: string;
  contactName: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
}

export interface StatementSnapshot {
  contact: StatementContactSnapshot;
  unpaid: StatementInvoiceSnapshot[];
  paid: StatementInvoiceSnapshot[];
  totalOutstanding: number;
  totalOverdue: number;
  unpaidCount: number;
  overdueCount: number;
  /** ISO timestamp when the snapshot was captured. Rendered as "Generated at". */
  capturedAt: string;
}

export interface StatementTemplateValues {
  subjectTemplate: string;
  greeting: string;
  openingLine: string;
  summaryTemplate: string;
  paymentMethodsHtml: string;
  closingLine: string;
  signOff: string;
  senderName: string;
}

export interface BuildStatementEmailInput {
  snapshot: StatementSnapshot;
  customMessage?: string | null;
  /** Per-draft override for the greeting line. Falls back to `templates.greeting` when blank. Placeholders are still substituted. */
  greetingOverride?: string | null;
  templates: StatementTemplateValues;
  signatureHtml: string;
  /** When true, append the "PDFs attached" line below the table. */
  attachmentsAttached?: boolean;
  /** Defaults to `Date.now()` — injected for deterministic tests. */
  now?: Date;
}

export interface StatementEmailOutput {
  subject: string;
  html: string;
  text: string;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAud(amount: number): string {
  return CURRENCY_FORMATTER.format(amount);
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Australia/Brisbane",
});

function formatDueDate(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return DATE_FORMATTER.format(d);
}

function dayDiff(target: Date, ref: Date): number {
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((target.getTime() - ref.getTime()) / MS);
}

interface InvoiceStatusPill {
  label: string;
  bg: string;
  fg: string;
  textColor: string;
}

function statusPill(dueDate: string, now: Date): InvoiceStatusPill {
  if (!dueDate) {
    return { label: "Due", bg: "#f3f4f6", fg: "#374151", textColor: "#374151" };
  }
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return { label: "Due", bg: "#f3f4f6", fg: "#374151", textColor: "#374151" };
  }
  const diff = dayDiff(due, now);
  if (diff < 0) {
    return {
      label: `${Math.abs(diff)}d overdue`,
      bg: "#fee2e2",
      fg: "#b91c1c",
      textColor: "#b91c1c",
    };
  }
  if (diff <= 7) {
    return {
      label: `Due in ${diff}d`,
      bg: "#fef3c7",
      fg: "#92400e",
      textColor: "#92400e",
    };
  }
  return {
    label: `Due in ${diff}d`,
    bg: "#dcfce7",
    fg: "#166534",
    textColor: "#166534",
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function deriveFirstName(snapshot: StatementContactSnapshot): string {
  if (snapshot.firstName?.trim()) return snapshot.firstName.trim();
  const fromName = snapshot.contactName?.trim().split(/\s+/)[0];
  return fromName ?? "";
}

function substitutePlaceholders(
  template: string,
  snapshot: StatementSnapshot,
): string {
  const firstName = deriveFirstName(snapshot.contact);
  return template
    .replaceAll("{totalOutstanding}", formatAud(snapshot.totalOutstanding))
    .replaceAll("{totalOverdue}", formatAud(snapshot.totalOverdue))
    .replaceAll("{unpaidCount}", String(snapshot.unpaidCount))
    .replaceAll("{overdueCount}", String(snapshot.overdueCount))
    .replaceAll("{contactName}", snapshot.contact.contactName)
    .replaceAll("{contactFirstName}", firstName || snapshot.contact.contactName);
}

export function buildStatementEmail(
  input: BuildStatementEmailInput,
): StatementEmailOutput {
  const { snapshot, customMessage, templates, signatureHtml } = input;
  const attachmentsAttached = input.attachmentsAttached ?? false;
  const now = input.now ?? new Date();

  const subject = substitutePlaceholders(templates.subjectTemplate, snapshot);
  const greetingTemplate = input.greetingOverride?.trim()
    ? input.greetingOverride.trim()
    : templates.greeting;
  const greeting = substitutePlaceholders(greetingTemplate, snapshot);
  const opening = substitutePlaceholders(templates.openingLine, snapshot);
  const summary = substitutePlaceholders(templates.summaryTemplate, snapshot);
  const closing = substitutePlaceholders(templates.closingLine, snapshot);

  // ── HTML body ─────────────────────────────────────────────────────────
  const tableRows = snapshot.unpaid
    .map((inv) => {
      const pill = statusPill(inv.dueDate, now);
      const dueStr = formatDueDate(inv.dueDate);
      const amount = formatAud(inv.amountDue);
      const number = escapeHtml(inv.invoiceNumber || inv.invoiceId);
      const description = escapeHtml(inv.reference || "");
      const payLinkCell = inv.onlineInvoiceUrl
        ? `<a href="${escapeHtml(inv.onlineInvoiceUrl)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;text-decoration:none;font-weight:600;">View &amp; pay &rarr;</a>`
        : `<span style="color:#9ca3af;">\u2014</span>`;
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;white-space:nowrap;">${number}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#4b5563;">${description}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#4b5563;white-space:nowrap;">${escapeHtml(dueStr)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;text-align:right;white-space:nowrap;">${escapeHtml(amount)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:13px;text-align:center;">
            <span style="display:inline-block;padding:3px 8px;background:${pill.bg};color:${pill.textColor};border-radius:10px;font-weight:600;white-space:nowrap;">${escapeHtml(pill.label)}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;text-align:right;white-space:nowrap;">${payLinkCell}</td>
        </tr>`;
    })
    .join("");

  const customMessageBlock = customMessage?.trim()
    ? `<p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;white-space:pre-wrap;">${escapeHtml(customMessage.trim())}</p>`
    : "";

  const attachmentsLine = attachmentsAttached
    ? `<p style="margin:12px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;">PDFs of all invoices are attached to this email.</p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table cellpadding="0" cellspacing="0" border="0" width="720" style="max-width:720px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;">
          <tr>
            <td style="padding:28px 32px 24px 32px;">
              <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${escapeHtml(greeting)}</p>
              ${customMessageBlock}
              <p style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;">${escapeHtml(opening)}</p>
              <p style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;"><strong>${escapeHtml(summary)}</strong></p>

              <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:left;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Invoice #</th>
                    <th style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:left;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Description</th>
                    <th style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:left;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Due</th>
                    <th style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:right;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Amount due</th>
                    <th style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:center;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Status</th>
                    <th style="padding:10px 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-align:right;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;border-bottom:1px solid #e5e7eb;">Pay</th>
                  </tr>
                </thead>
                <tbody>${tableRows}
                  <tr>
                    <td colspan="3" style="padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;text-align:right;font-weight:700;">Total outstanding</td>
                    <td style="padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;text-align:right;font-weight:700;white-space:nowrap;">${escapeHtml(formatAud(snapshot.totalOutstanding))}</td>
                    <td colspan="2"></td>
                  </tr>
                </tbody>
              </table>

              ${attachmentsLine}

              <div style="margin-top:20px;">${templates.paymentMethodsHtml}</div>

              <p style="margin:20px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.55;">${escapeHtml(closing)}</p>

              <p style="margin:20px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${escapeHtml(templates.signOff)}</p>
              <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${escapeHtml(templates.senderName)}</p>

              <div style="margin-top:8px;">${signatureHtml}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Plain-text fallback ───────────────────────────────────────────────
  const textRows = snapshot.unpaid
    .map((inv) => {
      const pill = statusPill(inv.dueDate, now);
      const due = formatDueDate(inv.dueDate);
      const amount = formatAud(inv.amountDue);
      const link = inv.onlineInvoiceUrl ? `\n    Pay: ${inv.onlineInvoiceUrl}` : "";
      return `  - ${inv.invoiceNumber || inv.invoiceId} \u2014 ${inv.reference || "(no description)"}\n    Due: ${due} \u2014 ${amount} \u2014 ${pill.label}${link}`;
    })
    .join("\n");

  const customMessageText = customMessage?.trim()
    ? `\n${customMessage.trim()}\n`
    : "";

  const text = [
    greeting,
    customMessageText,
    opening,
    "",
    summary,
    "",
    "Outstanding invoices:",
    textRows,
    "",
    `Total outstanding: ${formatAud(snapshot.totalOutstanding)}`,
    attachmentsAttached
      ? "\nPDFs of all invoices are attached to this email."
      : "",
    "",
    htmlToPlain(templates.paymentMethodsHtml),
    "",
    closing,
    "",
    templates.signOff,
    templates.senderName,
  ]
    .filter((line) => line !== "")
    .join("\n")
    // collapse runs of 3+ newlines to 2 — keeps section spacing tidy.
    .replace(/\n{3,}/g, "\n\n");

  return { subject, html, text };
}

/** Very small HTML→plain-text reducer for fallback text body. */
function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Sample fixture for live preview + tests ──────────────────────────────

export const SAMPLE_STATEMENT_SNAPSHOT: StatementSnapshot = {
  contact: {
    contactId: "sample-contact-1",
    contactName: "Acme Pty Ltd",
    firstName: "Alex",
    lastName: "Acme",
    emailAddress: "accounts@acme.example",
  },
  unpaid: [
    {
      invoiceId: "inv-001",
      invoiceNumber: "INV-2026-101",
      reference: "Google Ads Management — March",
      date: "2026-03-01",
      dueDate: "2026-03-15",
      total: 2200,
      amountDue: 2200,
      status: "AUTHORISED",
      onlineInvoiceUrl: "https://in.xero.com/sample/inv-001",
    },
    {
      invoiceId: "inv-002",
      invoiceNumber: "INV-2026-118",
      reference: "Google Ads Management — April",
      date: "2026-04-01",
      dueDate: "2026-04-15",
      total: 2200,
      amountDue: 2200,
      status: "AUTHORISED",
      onlineInvoiceUrl: "https://in.xero.com/sample/inv-002",
    },
    {
      invoiceId: "inv-003",
      invoiceNumber: "INV-2026-134",
      reference: "Google Ads Management — May",
      date: "2026-05-01",
      dueDate: "2026-05-15",
      total: 2200,
      amountDue: 2200,
      status: "AUTHORISED",
      onlineInvoiceUrl: "https://in.xero.com/sample/inv-003",
    },
  ],
  paid: [
    {
      invoiceId: "inv-000",
      invoiceNumber: "INV-2026-088",
      reference: "Google Ads Management — February",
      date: "2026-02-01",
      dueDate: "2026-02-15",
      total: 2200,
      amountDue: 0,
      status: "PAID",
      onlineInvoiceUrl: null,
    },
  ],
  totalOutstanding: 6600,
  totalOverdue: 4400,
  unpaidCount: 3,
  overdueCount: 2,
  capturedAt: "2026-05-02T08:00:00+10:00",
};
