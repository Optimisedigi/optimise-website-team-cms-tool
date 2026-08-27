import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVOICE_MATE_STARTER_QUESTIONS,
  INVOICE_MATE_OVERDUE_CHASE_STARTER,
  mergeStarterQuestions,
  resolveStarterQuestions,
} from "@/lib/agents/_shared/optimate-starter-questions";

describe("InvoiceMate starter questions", () => {
  it("replaces the retainer chip with the overdue chase starter", () => {
    expect(DEFAULT_INVOICE_MATE_STARTER_QUESTIONS).toContain(
      INVOICE_MATE_OVERDUE_CHASE_STARTER,
    );
    expect(DEFAULT_INVOICE_MATE_STARTER_QUESTIONS.join("\n")).not.toMatch(
      /create this month/i,
    );
  });

  it("rewrites a saved retainer chip to the chase starter", () => {
    const resolved = resolveStarterQuestions(
      [
        { question: "Show unpaid invoices" },
        { question: "Create this month’s retainer" },
      ],
      DEFAULT_INVOICE_MATE_STARTER_QUESTIONS,
    );
    expect(resolved).toContain(INVOICE_MATE_OVERDUE_CHASE_STARTER);
    expect(resolved.join("\n")).not.toMatch(/create this month/i);
  });

  it("appends the chase starter onto older saved lists", () => {
    const merged = mergeStarterQuestions(
      ["Show unpaid invoices"],
      DEFAULT_INVOICE_MATE_STARTER_QUESTIONS,
    );
    expect(merged).toContain(INVOICE_MATE_OVERDUE_CHASE_STARTER);
  });
});
