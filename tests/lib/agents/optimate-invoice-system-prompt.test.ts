import { describe, expect, it } from "vitest";
import { buildInvoiceMateSystemPrompt } from "@/lib/agents/optimate-invoice/system-prompt";

describe("InvoiceMate system prompt", () => {
  it("requires markdown bullet lists for unpaid invoices", () => {
    const prompt = buildInvoiceMateSystemPrompt(new Date("2026-08-27T00:00:00.000Z"));
    expect(prompt).toContain("markdown bullet list");
    expect(prompt).toContain("Never indent invoices as plain text");
    expect(prompt).toContain("**INV-000177**");
    expect(prompt).toContain("Today's date is 2026-08-27");
  });

  it("requires a Gmail Draft confirmation before creating overdue statement drafts", () => {
    const prompt = buildInvoiceMateSystemPrompt(new Date("2026-08-27T00:00:00.000Z"));
    expect(prompt).toContain("previewOverdueStatementEmails");
    expect(prompt).toContain("Would you like to send this to Gmail Draft?");
    expect(prompt).toContain("Never send mail");
    expect(prompt).toContain("stored email");
    expect(prompt).toContain("do not use the monthly account-statement wording");
    expect(prompt).toContain("paste the full To, Subject, and body");
  });
});
