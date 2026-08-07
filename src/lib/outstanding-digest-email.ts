/**
 * Internal "Outstanding Invoices" digest email builder.
 *
 * Pure function — no I/O. Given one row per client with outstanding invoices
 * (already enriched with the CMS retainer + tenure), returns
 * `{ subject, html, text }` ready to hand to Brevo.
 *
 * This is an ADMIN-ONLY snapshot sent to the agency owner at the start of each
 * month. It is deliberately separate from `invoice-statement-email.ts`, which
 * builds the client-facing chase emails — nothing here is ever sent to a
 * client.
 *
 * Layout (top → bottom):
 *   1. Headline totals (clients, invoices, outstanding, overdue)
 *   2. One row per client: outstanding, # invoices, overdue, retainer, tenure
 *   3. Totals footer row
 *   4. Link into the CMS invoice statements queue
 */

import { escapeHtml, formatAud } from "./invoice-statement-email";
import { normaliseClientName } from "./xero-client-match";

export interface DigestClientRow {
  /** Xero contact name — the billing entity. */
  contactName: string;
  /** Matched CMS client name, when a match was found. */
  clientName?: string | null;
  totalOutstanding: number;
  totalOverdue: number;
  unpaidCount: number;
  overdueCount: number;
  /** Net monthly retainer from the CMS client record ($). */
  monthlyRetainer?: number | null;
  /** Whole months since the client's start date. */
  monthsActive?: number | null;
  /** Oldest unpaid invoice due date (ISO), used for the "oldest" column. */
  oldestDueDate?: string | null;
}

export interface BuildOutstandingDigestInput {
  rows: DigestClientRow[];
  /** Absolute URL to the CMS invoice statements queue. */
  adminUrl?: string;
  /** Defaults to `Date.now()` — injected for deterministic tests. */
  now?: Date;
}

export interface OutstandingDigestOutput {
  subject: string;
  html: string;
  text: string;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  month: "long",
  year: "numeric",
  timeZone: "Australia/Brisbane",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Australia/Brisbane",
});

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_FORMATTER.format(d);
}

/** "1y 4m" / "7m" / "—" when the client start date is unknown. */
export function formatTenure(months: number | null | undefined): string {
  if (months === null || months === undefined || !Number.isFinite(months)) {
    return "—";
  }
  const whole = Math.max(0, Math.trunc(months));
  if (whole < 1) return "<1m";
  const years = Math.floor(whole / 12);
  const rest = whole % 12;
  if (years === 0) return `${rest}m`;
  if (rest === 0) return `${years}y`;
  return `${years}y ${rest}m`;
}

function formatRetainer(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${formatAud(value)}/mo`;
}

/** Days between an ISO due date and `now`; positive when overdue. */
function daysOverdue(dueDate: string | null | undefined, now: Date): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((now.getTime() - due.getTime()) / MS);
}

/**
 * Sort by outstanding amount (largest first) so the biggest exposure is at the
 * top of the email, then by name for a stable order on ties.
 */
export function sortDigestRows(rows: DigestClientRow[]): DigestClientRow[] {
  return [...rows].sort((a, b) => {
    if (b.totalOutstanding !== a.totalOutstanding) {
      return b.totalOutstanding - a.totalOutstanding;
    }
    return a.contactName.localeCompare(b.contactName);
  });
}

const TD = "padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;";
const TH =
  "padding:10px 12px;border-bottom:2px solid #d1d5db;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;text-align:left;";

export function buildOutstandingDigestEmail(
  input: BuildOutstandingDigestInput,
): OutstandingDigestOutput {
  const now = input.now ?? new Date();
  const rows = sortDigestRows(input.rows);
  const period = MONTH_FORMATTER.format(now);

  const totalOutstanding = rows.reduce((sum, r) => sum + (r.totalOutstanding || 0), 0);
  const totalOverdue = rows.reduce((sum, r) => sum + (r.totalOverdue || 0), 0);
  const totalInvoices = rows.reduce((sum, r) => sum + (r.unpaidCount || 0), 0);
  const totalRetainer = rows.reduce(
    (sum, r) => sum + (Number.isFinite(r.monthlyRetainer as number) ? (r.monthlyRetainer as number) : 0),
    0,
  );

  const subject =
    rows.length === 0
      ? `Outstanding invoices — ${period}: all clear`
      : `Outstanding invoices — ${period}: ${formatAud(totalOutstanding)} across ${rows.length} client${
          rows.length === 1 ? "" : "s"
        }`;

  const bodyRows = rows
    .map((row) => {
      const name = escapeHtml(row.clientName || row.contactName);
      // Only show the Xero billing name when it's meaningfully different from
      // the CMS client name — a pure case/punctuation difference ("EPG engines"
      // vs "EPG Engines") is noise, not information.
      const sub =
        row.clientName &&
        normaliseClientName(row.clientName) !== normaliseClientName(row.contactName)
          ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(row.contactName)}</div>`
          : "";
      const overdueDays = daysOverdue(row.oldestDueDate, now);
      const overdueCell =
        row.overdueCount > 0
          ? `<span style="color:#b91c1c;font-weight:600;">${formatAud(row.totalOverdue)}</span>` +
            `<div style="font-size:12px;color:#b91c1c;">${row.overdueCount} invoice${
              row.overdueCount === 1 ? "" : "s"
            }${overdueDays !== null && overdueDays > 0 ? ` · oldest ${overdueDays}d` : ""}</div>`
          : `<span style="color:#6b7280;">—</span>`;

      return `<tr>
  <td style="${TD}">${name}${sub}</td>
  <td style="${TD}text-align:right;font-weight:600;">${formatAud(row.totalOutstanding)}</td>
  <td style="${TD}text-align:center;">${row.unpaidCount}</td>
  <td style="${TD}">${overdueCell}</td>
  <td style="${TD}text-align:right;">${escapeHtml(formatRetainer(row.monthlyRetainer))}</td>
  <td style="${TD}text-align:right;">${escapeHtml(formatTenure(row.monthsActive))}</td>
  <td style="${TD}">${escapeHtml(formatDate(row.oldestDueDate))}</td>
</tr>`;
    })
    .join("\n");

  const table =
    rows.length === 0
      ? `<p style="margin:0;font-size:15px;color:#166534;background:#dcfce7;padding:14px 16px;border-radius:8px;">No clients have outstanding invoices right now. 🎉</p>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0;">
  <thead>
    <tr>
      <th style="${TH}">Client</th>
      <th style="${TH}text-align:right;">Outstanding</th>
      <th style="${TH}text-align:center;">Invoices</th>
      <th style="${TH}">Overdue</th>
      <th style="${TH}text-align:right;">Retainer</th>
      <th style="${TH}text-align:right;">With us</th>
      <th style="${TH}">Oldest due</th>
    </tr>
  </thead>
  <tbody>
${bodyRows}
  </tbody>
  <tfoot>
    <tr>
      <td style="${TD}font-weight:700;border-top:2px solid #d1d5db;">Total (${rows.length} client${
        rows.length === 1 ? "" : "s"
      })</td>
      <td style="${TD}text-align:right;font-weight:700;border-top:2px solid #d1d5db;">${formatAud(totalOutstanding)}</td>
      <td style="${TD}text-align:center;font-weight:700;border-top:2px solid #d1d5db;">${totalInvoices}</td>
      <td style="${TD}font-weight:700;color:#b91c1c;border-top:2px solid #d1d5db;">${formatAud(totalOverdue)}</td>
      <td style="${TD}text-align:right;font-weight:700;border-top:2px solid #d1d5db;">${escapeHtml(
        formatRetainer(totalRetainer),
      )}</td>
      <td style="${TD}border-top:2px solid #d1d5db;"></td>
      <td style="${TD}border-top:2px solid #d1d5db;"></td>
    </tr>
  </tfoot>
</table>`;

  const adminLink = input.adminUrl
    ? `<p style="margin:24px 0 0;font-size:14px;color:#374151;">
  <a href="${escapeHtml(input.adminUrl)}" style="color:#1d4ed8;">Open the invoice statements queue →</a>
</p>`
    : "";

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
  <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Internal snapshot · ${escapeHtml(
    period,
  )}</p>
  <h1 style="margin:0 0 20px;font-size:22px;color:#111827;">Clients with outstanding invoices</h1>
  <p style="margin:0 0 20px;font-size:15px;color:#374151;">
    ${rows.length} client${rows.length === 1 ? "" : "s"} · ${totalInvoices} unpaid invoice${
      totalInvoices === 1 ? "" : "s"
    } · <strong>${formatAud(totalOutstanding)}</strong> outstanding${
      totalOverdue > 0 ? `, of which <strong style="color:#b91c1c;">${formatAud(totalOverdue)}</strong> is overdue` : ""
    }.
  </p>
  ${table}
  ${adminLink}
  <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;">
    Sent automatically at the start of each month. This is an internal view only — clients do not receive it.
  </p>
</div>
</body>
</html>`;

  const textLines = [
    `Clients with outstanding invoices — ${period}`,
    "",
    `${rows.length} client(s) · ${totalInvoices} unpaid invoice(s) · ${formatAud(totalOutstanding)} outstanding` +
      (totalOverdue > 0 ? ` (${formatAud(totalOverdue)} overdue)` : ""),
    "",
    ...rows.map(
      (row) =>
        `- ${row.clientName || row.contactName}: ${formatAud(row.totalOutstanding)} across ${row.unpaidCount} invoice(s)` +
        (row.overdueCount > 0 ? `, ${formatAud(row.totalOverdue)} overdue` : "") +
        ` | retainer ${formatRetainer(row.monthlyRetainer)} | with us ${formatTenure(row.monthsActive)}`,
    ),
    "",
    `Total: ${formatAud(totalOutstanding)} across ${totalInvoices} invoice(s).`,
    ...(input.adminUrl ? ["", input.adminUrl] : []),
  ];

  return { subject, html, text: textLines.join("\n") };
}
