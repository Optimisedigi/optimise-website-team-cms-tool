import { removeForbiddenDashes } from "@/lib/agents/_shared/forbidden-dash-sanitizer";
import {
  escapeHtml,
  formatAud,
  type StatementSnapshot,
} from "@/lib/invoice-statement-email";

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

function firstNameOf(snapshot: StatementSnapshot): string {
  const first = snapshot.contact.firstName?.trim();
  if (first) return first;
  return snapshot.contact.contactName.trim().split(/\s+/)[0] || "there";
}

function invoiceNoun(count: number): string {
  return count === 1 ? "this invoice" : "these invoices";
}

export interface OverdueChaseEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Short personal chase. Uses statement snapshot invoice rows, not the
 * monthly account-statement template.
 */
export function buildOverdueChaseEmail(
  snapshot: StatementSnapshot,
  signatureHtml = "",
): OverdueChaseEmail {
  const invoices = snapshot.unpaid;
  const count = invoices.length;
  const firstName = firstNameOf(snapshot);
  const noun = invoiceNoun(count);
  const total = formatAud(snapshot.totalOutstanding);

  const subject = removeForbiddenDashes(
    count === 1 && invoices[0]?.invoiceNumber
      ? `Just checking in on ${invoices[0].invoiceNumber}`
      : `Just checking in on a few outstanding invoices`,
  );
  const intro = `Hey ${firstName},\n\nJust checking in on ${noun}. Can you look into it for us?`;

  const textLines = invoices.map((inv) => {
    const due = formatDueDate(inv.dueDate);
    const amount = formatAud(inv.amountDue);
    const desc = inv.reference ? ` (${removeForbiddenDashes(inv.reference)})` : "";
    const pay = inv.onlineInvoiceUrl ? `\n    Pay: ${inv.onlineInvoiceUrl}` : "";
    return `  - ${inv.invoiceNumber}${desc}, ${amount}, due ${due}${pay}`;
  });

  const htmlItems = invoices
    .map((inv) => {
      const due = escapeHtml(formatDueDate(inv.dueDate));
      const amount = escapeHtml(formatAud(inv.amountDue));
      const number = escapeHtml(inv.invoiceNumber || inv.invoiceId);
      const desc = inv.reference
        ? ` ${escapeHtml(removeForbiddenDashes(inv.reference))},`
        : "";
      const pay = inv.onlineInvoiceUrl
        ? ` <a href="${escapeHtml(inv.onlineInvoiceUrl)}" target="_blank" rel="noopener noreferrer">Pay</a>`
        : "";
      return `<li><strong>${number}</strong>${desc} ${amount}, due ${due}${pay}</li>`;
    })
    .join("");

  const signatureBlock = signatureHtml.trim()
    ? `<div style="margin-top:16px;">${signatureHtml}</div>`
    : "";

  const html = [
    `<p>Hey ${escapeHtml(firstName)},</p>`,
    `<p>Just checking in on ${escapeHtml(noun)}. Can you look into it for us?</p>`,
    `<ul>${htmlItems}</ul>`,
    `<p>That's ${escapeHtml(total)} outstanding in total.</p>`,
    `<p>Thanks</p>`,
    signatureBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const text = removeForbiddenDashes(
    [
      intro,
      "",
      ...textLines,
      "",
      `That's ${total} outstanding in total.`,
      "",
      "Thanks",
    ].join("\n"),
  );

  return {
    subject,
    html: removeForbiddenDashes(html),
    text,
  };
}
