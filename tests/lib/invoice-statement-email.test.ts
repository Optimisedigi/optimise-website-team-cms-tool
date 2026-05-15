import { describe, expect, it } from "vitest";
import {
  buildStatementEmail,
  SAMPLE_STATEMENT_SNAPSHOT,
  formatAud,
  escapeHtml,
  type StatementSnapshot,
  type StatementTemplateValues,
} from "@/lib/invoice-statement-email";

const SIGNATURE_HTML = `<div class="brand-signature"><img src="https://example.com/logo.gif" /></div>`;

const TEMPLATES: StatementTemplateValues = {
  subjectTemplate:
    "Your account with Optimise Digital — {totalOutstanding} outstanding across {unpaidCount} invoices",
  greeting: "Hi {contactFirstName},",
  openingLine:
    "Quick consolidated summary of your account with us — here's everything currently open in one place.",
  summaryTemplate:
    "Total outstanding: {totalOutstanding} across {unpaidCount} invoices, with {totalOverdue} overdue.",
  paymentMethodsHtml:
    '<p style="margin:0;">Bank deposit: <strong>BSB 062-692</strong></p>',
  closingLine: "Any questions, just reply to this email.",
  signOff: "Thanks,",
  senderName: "Maria",
};

// Fixed reference date for deterministic "Xd overdue" status pills.
// Matches the sample snapshot's invoice dates (Mar/Apr/May 2026).
const NOW = new Date("2026-05-02T08:00:00+10:00");

describe("formatAud", () => {
  it("renders AUD with two decimal places", () => {
    expect(formatAud(6600)).toBe("$6,600.00");
    expect(formatAud(0)).toBe("$0.00");
    expect(formatAud(1234.5)).toBe("$1,234.50");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML metacharacters", () => {
    expect(escapeHtml(`<a href="x&y">'O'</a>`)).toBe(
      "&lt;a href=&quot;x&amp;y&quot;&gt;&#39;O&#39;&lt;/a&gt;",
    );
  });
});

describe("buildStatementEmail", () => {
  it("substitutes placeholders in the subject and summary", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });

    expect(out.subject).toBe(
      "Your account with Optimise Digital — $6,600.00 outstanding across 3 invoices",
    );
    expect(out.html).toContain(
      "Total outstanding: $6,600.00 across 3 invoices, with $4,400.00 overdue.",
    );
  });

  it("renders three rows + a total footer for the sample snapshot", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });

    expect(out.html).toContain("INV-2026-101");
    expect(out.html).toContain("INV-2026-118");
    expect(out.html).toContain("INV-2026-134");
    // Total outstanding row appears in the table footer.
    const totalCount = (out.html.match(/\$6,600\.00/g) ?? []).length;
    expect(totalCount).toBeGreaterThanOrEqual(2); // summary line + footer row
  });

  it("renders the View & pay link for invoices with onlineInvoiceUrl", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(out.html).toContain(
      `<a href="https://in.xero.com/sample/inv-001"`,
    );
    expect(out.html).toContain("View &amp; pay &rarr;");
  });

  it("renders a dash placeholder when an invoice has no onlineInvoiceUrl", () => {
    const snapshot: StatementSnapshot = {
      ...SAMPLE_STATEMENT_SNAPSHOT,
      unpaid: SAMPLE_STATEMENT_SNAPSHOT.unpaid.map((inv, idx) =>
        idx === 0 ? { ...inv, onlineInvoiceUrl: null } : inv,
      ),
    };
    const out = buildStatementEmail({
      snapshot,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    // First row no longer has the View & pay link, but later rows still do.
    expect(out.html.indexOf("View &amp; pay")).toBeGreaterThan(0);
    expect(out.html).toContain('<span style="color:#9ca3af;">\u2014</span>');
  });

  it("colour-codes status pills as overdue / due-soon / due-later", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    // Mar 15 → 48d overdue (red), Apr 15 → 17d overdue (red), May 15 → 13d (green: >7d)
    expect(out.html).toContain("48d overdue");
    expect(out.html).toContain("17d overdue");
    expect(out.html).toContain("Due in 13d");
    expect(out.html).toContain("#fee2e2"); // red bg
    expect(out.html).toContain("#dcfce7"); // green bg
  });

  it("renders the custom message block when provided, omits it otherwise", () => {
    const withMessage = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      customMessage: "Thanks for sticking with us through the rebuild.",
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(withMessage.html).toContain(
      "Thanks for sticking with us through the rebuild.",
    );
    expect(withMessage.html).toContain("border-left:3px solid #1a73e8");

    const withoutMessage = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(withoutMessage.html).not.toContain("border-left:3px solid #1a73e8");
  });

  it("escapes HTML metacharacters in contact name", () => {
    const snapshot: StatementSnapshot = {
      ...SAMPLE_STATEMENT_SNAPSHOT,
      contact: {
        ...SAMPLE_STATEMENT_SNAPSHOT.contact,
        contactName: "Smith & <Co>",
        firstName: "",
      },
    };
    const templates: StatementTemplateValues = {
      ...TEMPLATES,
      greeting: "Hi {contactName},",
    };
    const out = buildStatementEmail({
      snapshot,
      templates,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    // Placeholder substitution happens before escaping in the HTML stage.
    expect(out.html).toContain("Hi Smith &amp; &lt;Co&gt;,");
  });

  it("renders the attachments line only when attachmentsAttached is true", () => {
    const without = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(without.html).not.toContain("PDFs of all invoices");

    const withPdf = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      attachmentsAttached: true,
      now: NOW,
    });
    expect(withPdf.html).toContain(
      "PDFs of all invoices are attached to this email.",
    );
    expect(withPdf.text).toContain(
      "PDFs of all invoices are attached to this email.",
    );
  });

  it("renders sign-off and sender name ABOVE the brand signature, not inside it", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });

    const signOffIdx = out.html.indexOf(">Thanks,<");
    const senderNameIdx = out.html.indexOf(">Maria<");
    const signatureIdx = out.html.indexOf(SIGNATURE_HTML);

    expect(signOffIdx).toBeGreaterThan(-1);
    expect(senderNameIdx).toBeGreaterThan(-1);
    expect(signatureIdx).toBeGreaterThan(-1);
    expect(signOffIdx).toBeLessThan(senderNameIdx);
    expect(senderNameIdx).toBeLessThan(signatureIdx);
    // Sign-off + name must not appear *inside* the signature block.
    expect(SIGNATURE_HTML).not.toContain("Maria");
    expect(SIGNATURE_HTML).not.toContain("Thanks,");
  });

  it("uses greetingOverride when provided, ignoring template greeting", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      greetingOverride: "Hi team,",
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(out.html).toContain("Hi team,");
    expect(out.html).not.toContain("Hi Alex,");
  });

  it("falls back to template greeting when greetingOverride is blank/whitespace", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      greetingOverride: "   ",
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(out.html).toContain("Hi Alex,");
  });

  it("substitutes placeholders inside greetingOverride too", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      greetingOverride: "Hi {contactName} team,",
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(out.html).toContain("Hi Acme Pty Ltd team,");
  });

  it("falls back to first word of contactName when firstName is blank", () => {
    const snapshot: StatementSnapshot = {
      ...SAMPLE_STATEMENT_SNAPSHOT,
      contact: {
        ...SAMPLE_STATEMENT_SNAPSHOT.contact,
        firstName: "",
        contactName: "Acme Pty Ltd",
      },
    };
    const out = buildStatementEmail({
      snapshot,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(out.html).toContain("Hi Acme,");
  });

  it("produces a plain-text fallback with each invoice line", () => {
    const out = buildStatementEmail({
      snapshot: SAMPLE_STATEMENT_SNAPSHOT,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(out.text).toContain("Hi Alex,");
    expect(out.text).toContain("INV-2026-101");
    expect(out.text).toContain("Pay: https://in.xero.com/sample/inv-001");
    expect(out.text).toContain("Total outstanding: $6,600.00");
    expect(out.text).toContain("Thanks,");
    expect(out.text).toContain("Maria");
    // Plain-text version of the payment methods block (HTML stripped).
    expect(out.text).toContain("BSB 062-692");
  });

  it("supports a two-invoice mixed overdue + due-soon case", () => {
    const snapshot: StatementSnapshot = {
      ...SAMPLE_STATEMENT_SNAPSHOT,
      unpaid: SAMPLE_STATEMENT_SNAPSHOT.unpaid.slice(0, 2),
      paid: [],
      totalOutstanding: 4400,
      totalOverdue: 4400,
      unpaidCount: 2,
      overdueCount: 2,
    };
    const out = buildStatementEmail({
      snapshot,
      templates: TEMPLATES,
      signatureHtml: SIGNATURE_HTML,
      now: NOW,
    });
    expect(out.subject).toContain("$4,400.00");
    expect(out.subject).toContain("across 2 invoices");
    expect(out.html).toContain("INV-2026-101");
    expect(out.html).toContain("INV-2026-118");
    expect(out.html).not.toContain("INV-2026-134");
  });
});
