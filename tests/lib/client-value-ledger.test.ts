import { buildLedgerSummary, normaliseImpactValue } from "@/lib/client-value-ledger";

describe("client-value-ledger", () => {
  it("normalises impact values", () => {
    expect(normaliseImpactValue("12.345")).toBe(12.35);
    expect(normaliseImpactValue("nope")).toBeNull();
  });

  it("builds category and impact totals", () => {
    const summary = buildLedgerSummary([
      { client: 1, occurredAt: "2026-01-01", category: "seo", title: "A", summary: "A", impactValue: 10, impactUnit: "clicks" },
      { client: 1, occurredAt: "2026-02-01", category: "seo", title: "B", summary: "B", impactValue: 5, impactUnit: "clicks" },
      { client: 1, occurredAt: "2026-01-15", category: "content", title: "C", summary: "C", impactValue: 1, impactUnit: "posts" },
    ]);
    expect(summary.totalItems).toBe(3);
    expect(summary.byCategory).toEqual({ content: 1, seo: 2 });
    expect(summary.impactTotals).toEqual({ clicks: 15, posts: 1 });
    expect(summary.latestOccurredAt).toBe("2026-02-01");
  });
});
