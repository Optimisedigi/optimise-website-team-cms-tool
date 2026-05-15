/**
 * Annual Review Reminder Email builder.
 *
 * Pure function — no I/O. Given a contract + recipient + which reminder
 * (11-month or 11.5-month), returns `{ subject, html, text }` ready to
 * hand to Postmark.
 *
 * Two reminder variants share the same shape; only the lead-time phrasing
 * differs. Trim is intentional: this is internal-team email, not client-
 * facing branded mail.
 */

import type { ReminderKind } from "./contract-reminders";

export interface ReminderEmailInput {
  kind: ReminderKind;
  recipientName: string | null | undefined;
  clientName: string | null | undefined;
  contractTitle: string | null | undefined;
  /** ISO date string of the contract effective date. */
  contractDate: string | Date;
  /** The reminder's `sendAt` — used to derive the 12-month anniversary. */
  anniversaryDate: string | Date;
  /** Absolute URL to the contract edit page in admin. */
  contractAdminUrl: string;
}

export interface ReminderEmailOutput {
  subject: string;
  html: string;
  text: string;
}

const SUBJECT_LEAD: Record<ReminderKind, string> = {
  "11-month": "Annual review due in ~30 days",
  "11.5-month": "Annual review due in ~2 weeks",
};

const BODY_LEAD: Record<ReminderKind, string> = {
  "11-month":
    "This contract reaches its 12-month anniversary in about four weeks. Time to start the annual review and tier adjustment.",
  "11.5-month":
    "Final nudge: this contract's 12-month anniversary is about two weeks away. The annual review and tier adjustment should be locked in by then.",
};

/**
 * Format a date as a long-form Australian date ("15 May 2026") in UTC.
 * Using UTC avoids timezone drift on dates rendered to email; a one-day
 * shift on a 30-day-out reminder is invisible to the reader anyway.
 */
export function formatAnniversaryDate(date: string | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "(invalid date)";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * 12-month anniversary date. For the 11-month reminder this is
 * `anniversaryDate + 1 month`; for the 11.5-month it's
 * `anniversaryDate + 15 days`. The contract anniversary itself is
 * `contractDate + 12 months`, so we derive it from contractDate directly.
 */
function computeAnniversary(contractDate: string | Date): Date {
  const d = contractDate instanceof Date ? contractDate : new Date(contractDate);
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + 12);
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReminderEmail(
  input: ReminderEmailInput,
): ReminderEmailOutput {
  const clientName = input.clientName?.trim() || "Client";
  const contractTitle = input.contractTitle?.trim() || "Contract";
  const recipientGreeting = input.recipientName?.trim() || "team";
  const anniversary = computeAnniversary(input.contractDate);
  const anniversaryStr = formatAnniversaryDate(anniversary);
  const effectiveStr = formatAnniversaryDate(input.contractDate);

  const subject = `${SUBJECT_LEAD[input.kind]} \u2014 ${clientName}`;
  const leadParagraph = BODY_LEAD[input.kind];

  const text = [
    `Hi ${recipientGreeting},`,
    "",
    leadParagraph,
    "",
    `Client: ${clientName}`,
    `Contract: ${contractTitle}`,
    `Effective date: ${effectiveStr}`,
    `12-month anniversary: ${anniversaryStr}`,
    "",
    `Open contract in admin: ${input.contractAdminUrl}`,
    "",
    "This is part of the agreed annual-review process: review trailing media spend, confirm the tier, and either accept the next-tier retainer or note any adjustments.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#222;line-height:1.55;max-width:560px;">
  <p>Hi ${escapeHtml(recipientGreeting)},</p>
  <p>${escapeHtml(leadParagraph)}</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Client</td><td style="padding:4px 0;"><strong>${escapeHtml(clientName)}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Contract</td><td style="padding:4px 0;">${escapeHtml(contractTitle)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">Effective date</td><td style="padding:4px 0;">${escapeHtml(effectiveStr)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666;">12-month anniversary</td><td style="padding:4px 0;"><strong>${escapeHtml(anniversaryStr)}</strong></td></tr>
  </table>
  <p>
    <a href="${escapeHtml(input.contractAdminUrl)}" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:500;">Open contract in admin</a>
  </p>
  <p style="font-size:12px;color:#888;margin-top:24px;">
    Part of the agreed annual-review process: review trailing media spend, confirm the tier, and either accept the next-tier retainer or note any adjustments.
  </p>
</body>
</html>`;

  return { subject, html, text };
}
