import { getQuarterlySnapshotSchedule, selectDueSnapshot, snapshotAlreadyExists, splitBrandNonBrand } from "@/lib/quarterly-organic-growth";

describe("quarterly-organic-growth", () => {
  it("creates month-one and quarterly schedule entries", () => {
    const entries = getQuarterlySnapshotSchedule(new Date("2026-01-15T00:00:00Z"), new Date("2026-07-02T00:00:00Z"));
    expect(entries).toEqual([
      { snapshotDate: "2026-02-01", snapshotType: "month_1", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
      { snapshotDate: "2026-05-01", snapshotType: "quarterly", periodStart: "2026-02-01", periodEnd: "2026-04-30" },
    ]);
  });

  it("uses stored brand and non-brand GSC data when present", () => {
    const metrics = splitBrandNonBrand({ totalClicks: 100, totalImpressions: 1000, brandedData: { clicks: 20, impressions: 100 }, nonBrandedData: { clicks: 80, impressions: 900 } });
    expect(metrics.brandClicks).toBe(20);
    expect(metrics.nonBrandImpressions).toBe(900);
  });

  it("falls back to brand keyword matching against top queries", () => {
    const metrics = splitBrandNonBrand({
      totalClicks: 100,
      totalImpressions: 1000,
      topKeywords: [
        { keyword: "acme pricing", clicks: 15, impressions: 150 },
        { keyword: "generic service", clicks: 85, impressions: 850 },
      ],
    }, "acme");
    expect(metrics.brandClicks).toBe(15);
    expect(metrics.nonBrandClicks).toBe(85);
  });

  it("detects duplicates by period/type or source GSC snapshot", () => {
    const existing = [{ client: 1, periodEnd: "2026-04-30", snapshotType: "quarterly", sourceGscSnapshot: 99 }];
    expect(snapshotAlreadyExists(existing, 1, "2026-04-30", "quarterly", null)).toBe(true);
    expect(snapshotAlreadyExists(existing, 1, "2026-05-31", "manual", 99)).toBe(true);
    expect(snapshotAlreadyExists(existing, 2, "2026-04-30", "quarterly", 99)).toBe(false);
  });

  it("selects the latest due snapshot that has not already been created", () => {
    const due = selectDueSnapshot(
      new Date("2026-01-15T00:00:00Z"),
      new Date("2026-07-02T00:00:00Z"),
      [{ client: 1, periodEnd: "2026-04-30", snapshotType: "quarterly" }],
      1,
    );
    expect(due).toEqual({ snapshotDate: "2026-02-01", snapshotType: "month_1", periodStart: "2026-01-01", periodEnd: "2026-01-31" });
  });
});
