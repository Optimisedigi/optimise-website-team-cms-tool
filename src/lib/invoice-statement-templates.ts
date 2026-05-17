/**
 * Loads the editable Invoice Statement template values + signature HTML from
 * the `email-templates` global. Falls back to sensible defaults if any field
 * is blank (e.g. during initial setup).
 */

import type { Payload } from "payload";
import type { StatementTemplateValues } from "./invoice-statement-email";

interface EmailTemplatesGlobal {
  statementFromEmail?: string | null;
  statementReplyToEmail?: string | null;
  statementCcEmails?: string | null;
  statementSubjectTemplate?: string | null;
  statementGreeting?: string | null;
  statementOpeningLine?: string | null;
  statementSummaryTemplate?: string | null;
  statementPaymentMethodsHtml?: string | null;
  statementClosingLine?: string | null;
  statementSignOff?: string | null;
  statementSenderName?: string | null;
  signatureHtml?: string | null;
}

export interface LoadedStatementTemplates {
  fromEmail: string;
  replyToEmail: string;
  ccEmails: string;
  templates: StatementTemplateValues;
  signatureHtml: string;
}

const FALLBACK = {
  fromEmail: "accounts@optimisedigital.online",
  ccEmails: "peter@optimisedigital.online",
  subject:
    "Your account with Optimise Digital — {totalOutstanding} outstanding across {unpaidCount} invoices",
  greeting: "Hi {contactFirstName},",
  opening:
    "Quick consolidated summary of your account with us — here's everything currently open in one place.",
  summary:
    "Total outstanding: {totalOutstanding} across {unpaidCount} invoices, with {totalOverdue} overdue.",
  paymentMethods: `<p>Bank deposit: <strong>BSB 062-692, Account 45576894</strong> — reference your invoice number(s).</p>`,
  closing: "Any questions, just reply to this email.",
  signOff: "Thanks,",
  senderName: "Maria",
  signature: "",
};

export async function loadStatementTemplates(
  payload: Payload,
): Promise<LoadedStatementTemplates> {
  const global = (await payload.findGlobal({
    slug: "email-templates" as never,
    depth: 0,
    overrideAccess: true,
  })) as unknown as EmailTemplatesGlobal;

  const pick = (val: string | null | undefined, fallback: string): string =>
    val && val.trim() ? val : fallback;

  return {
    fromEmail: pick(global.statementFromEmail, FALLBACK.fromEmail),
    replyToEmail: pick(
      global.statementReplyToEmail,
      pick(global.statementFromEmail, FALLBACK.fromEmail),
    ),
    ccEmails: pick(global.statementCcEmails, FALLBACK.ccEmails),
    templates: {
      subjectTemplate: pick(global.statementSubjectTemplate, FALLBACK.subject),
      greeting: pick(global.statementGreeting, FALLBACK.greeting),
      openingLine: pick(global.statementOpeningLine, FALLBACK.opening),
      summaryTemplate: pick(
        global.statementSummaryTemplate,
        FALLBACK.summary,
      ),
      paymentMethodsHtml: pick(
        global.statementPaymentMethodsHtml,
        FALLBACK.paymentMethods,
      ),
      closingLine: pick(global.statementClosingLine, FALLBACK.closing),
      signOff: pick(global.statementSignOff, FALLBACK.signOff),
      senderName: pick(global.statementSenderName, FALLBACK.senderName),
    },
    signatureHtml: pick(global.signatureHtml, FALLBACK.signature),
  };
}
