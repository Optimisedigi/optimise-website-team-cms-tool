import { describe, expect, it } from "vitest";
import {
  buildOutstandingDigestEmail,
  formatTenure,
  sortDigestRows,
  type DigestClientRow,
} from "@/lib/outstanding-digest-email";

const NOW = new Date("2026-05-02T08:00:00+10:00");

const ROWS: DigestClientRow[] = [
  {
    contactName: "Acme Pty Ltd",
    clientName: "Acme",
    totalOutstanding: 2200,
    totalOverdue: 0,
    unpaidCount: 2,
    overdueCount: 0,
    monthlyRetainer: 1100,
    monthsActive: 14,
    oldestDueDate: "2026-05-20",
  },
  {
    contactName: "Zebra Dental",
    clientName: "Zebra Dental",
    totalOutstanding: 6600,
    totalOverdue: 3300,
    unpaidCount: 3,
    overdueCount: 1,
    monthlyRetainer: 3300,
    monthsActive: 7,
    oldestDueDate: "2026-04-02",
  },
];

describe("formatTenure", () => {
  it("formats years and months", () => {
    expect(formatTenure(14)).toBe("1y 2m");
    expect(formatTenure(24)).toBe("2y");
    expect(formatTenure(7)).toBe("7m");
    expect(formatTenure(0)).toBe("<1m");
    expect(formatTenure(null)).toBe("—");
    expect(formatTenure(undefined)).toBe("—");
  });
});

describe("sortDigestRows", () => {
  it("orders by outstanding amount descending", () => {
    const sorted = sortDigestRows(ROWS);
    expect(sorted.map((r) => r.contactName)).toEqual([
      "Zebra Dental",
      "Acme Pty Ltd",
    ]);
  });

  it("does not mutate the input", () => {
    const input = [...ROWS];
    sortDigestRows(input);
    expect(input[0]?.contactName).toBe("Acme Pty Ltd");
  });
});

describe("buildOutstandingDigestEmail", () => {
  it("summarises totals in the subject", () => {
    const out = buildOutstandingDigestEmail({ rows: ROWS, now: NOW });
    expect(out.subject).toBe(
      "Outstanding invoices — May 2026: $8,800.00 across 2 clients",
    );
  });

  it("renders each client with amount, invoice count, retainer and tenure", () => {
    const out = buildOutstandingDigestEmail({ rows: ROWS, now: NOW });
    expect(out.html).toContain("Zebra Dental");
    expect(out.html).toContain("$6,600.00");
    expect(out.html).toContain("$1,100.00/mo");
    expect(out.html).toContain("1y 2m");
    // Totals footer.
    expect(out.html).toContain("$8,800.00");
    expect(out.html).toContain("Total (2 clients)");
  });

  it("flags overdue amounts and the oldest overdue age", () => {
    const out = buildOutstandingDigestEmail({ rows: ROWS, now: NOW });
    expect(out.html).toContain("$3,300.00");
    expect(out.html).toContain("oldest 30d");
  });

  it("produces a plain-text fallback listing every client", () => {
    const out = buildOutstandingDigestEmail({ rows: ROWS, now: NOW });
    expect(out.text).toContain(
      "- Zebra Dental: $6,600.00 across 3 invoice(s), $3,300.00 overdue | retainer $3,300.00/mo | with us 7m",
    );
    expect(out.text).toContain("- Acme: $2,200.00 across 2 invoice(s)");
  });

  it("shows the Xero billing name only when it differs meaningfully", () => {
    const out = buildOutstandingDigestEmail({
      rows: [
        {
          contactName: "Berendsen Fluid Power",
          clientName: "Berendsen",
          totalOutstanding: 100,
          totalOverdue: 0,
          unpaidCount: 1,
          overdueCount: 0,
        },
        {
          // Differs from the CMS name by case only — should not render a subline.
          contactName: "EPG Engines",
          clientName: "EPG engines",
          totalOutstanding: 50,
          totalOverdue: 0,
          unpaidCount: 1,
          overdueCount: 0,
        },
      ],
      now: NOW,
    });
    expect(out.html).toContain("Berendsen Fluid Power");
    expect(out.html).not.toContain("EPG Engines");
    expect(out.html).toContain("EPG engines");
  });

  it("handles an all-clear month", () => {
    const out = buildOutstandingDigestEmail({ rows: [], now: NOW });
    expect(out.subject).toBe("Outstanding invoices — May 2026: all clear");
    expect(out.html).toContain("No clients have outstanding invoices");
  });

  it("escapes client names", () => {
    const out = buildOutstandingDigestEmail({
      rows: [
        {
          contactName: "<script>x</script>",
          totalOutstanding: 100,
          totalOverdue: 0,
          unpaidCount: 1,
          overdueCount: 0,
        },
      ],
      now: NOW,
    });
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).not.toContain("<script>x</script>");
  });

  it("includes the admin queue link when a base URL is supplied", () => {
    const out = buildOutstandingDigestEmail({
      rows: ROWS,
      now: NOW,
      adminUrl: "https://cms.example.com/admin/finance/invoice-statements",
    });
    expect(out.html).toContain(
      'href="https://cms.example.com/admin/finance/invoice-statements"',
    );
  });
});
