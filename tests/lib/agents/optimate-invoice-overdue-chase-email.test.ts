import { describe, expect, it } from "vitest";
import { buildOverdueChaseEmail } from "@/lib/agents/optimate-invoice/overdue-chase-email";
import { SAMPLE_STATEMENT_SNAPSHOT } from "@/lib/invoice-statement-email";

describe("buildOverdueChaseEmail", () => {
  it("writes a short check-in with the statement invoice list and no typographic dashes", () => {
    const email = buildOverdueChaseEmail(SAMPLE_STATEMENT_SNAPSHOT);

    expect(email.subject).toBe("Just checking in on a few outstanding invoices");
    expect(email.text).toContain("Hey Alex,");
    expect(email.text).toContain("Just checking in on these invoices. Can you look into it for us?");
    expect(email.text).toContain("- INV-2026-101 (Google Ads Management, March)");
    expect(email.text).not.toMatch(/[—–]/);
    expect(email.text).toContain("INV-2026-118");
    expect(email.text).toContain("INV-2026-134");
    expect(email.text).not.toMatch(/Quick consolidated summary/);
    expect(email.text).not.toMatch(/account with us/);
    expect(email.html).not.toMatch(/[—–]/);
    expect(email.subject).not.toMatch(/[—–]/);
    expect(email.html).toContain("<ul>");
    expect(email.html).toContain("INV-2026-101");
  });

  it("uses this invoice wording for a single overdue invoice", () => {
    const snapshot = {
      ...SAMPLE_STATEMENT_SNAPSHOT,
      unpaid: [SAMPLE_STATEMENT_SNAPSHOT.unpaid[0]!],
      unpaidCount: 1,
      overdueCount: 1,
      totalOutstanding: 2200,
      totalOverdue: 2200,
    };
    const email = buildOverdueChaseEmail(snapshot);
    expect(email.subject).toBe("Just checking in on INV-2026-101");
    expect(email.text).toContain("Just checking in on this invoice.");
  });
});
