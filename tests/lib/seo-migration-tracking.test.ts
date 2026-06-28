import { describe, expect, it } from "vitest";
import { buildChecklistIssueReport, buildPostMigrationFlags, buildPostMigrationTrackingSnapshots, getDueMilestoneDay } from "@/lib/seo-migration-tracking";

const overall = [
  { date: "2026-06-10", clicks: 10, impressions: 100, ctr: 10, position: 2 },
  { date: "2026-06-11", clicks: 8, impressions: 80, ctr: 10, position: 2.4 },
];

describe("seo migration tracking", () => {
  it("returns the highest unsent due milestone", () => {
    expect(getDueMilestoneDay("2026-06-10", new Date("2026-06-17T12:00:00Z"), 3)).toBe(7);
    expect(getDueMilestoneDay("2026-06-10", new Date("2026-06-17T12:00:00Z"), 7)).toBeNull();
  });

  it("merges overall and branded rows into daily snapshots", () => {
    const snapshots = buildPostMigrationTrackingSnapshots({
      cutoverDate: "2026-06-10",
      startDate: "2026-06-09",
      availableEndDate: "2026-06-11",
      overall,
      brand: [{ date: "2026-06-10", clicks: 4, impressions: 40, ctr: 10, position: 1 }],
      nonBrand: [{ date: "2026-06-10", clicks: 6, impressions: 60, ctr: 10, position: 3 }],
      now: new Date("2026-06-15T00:00:00Z"),
    });
    expect(snapshots).toHaveLength(3);
    expect(snapshots[0]).toMatchObject({ date: "2026-06-09", daysSinceCutover: -1, clicks: 0, brandClicks: 0, genericClicks: 0 });
    expect(snapshots[1]).toMatchObject({ date: "2026-06-10", daysSinceCutover: 1, clicks: 10, brandClicks: 4, genericClicks: 6 });
    expect(snapshots[2]).toMatchObject({ date: "2026-06-11", clicks: 0, brandClicks: 0, genericClicks: 0 });
  });

  it("accepts a full ISO datetime cutover (Payload date field format)", () => {
    const snapshots = buildPostMigrationTrackingSnapshots({
      cutoverDate: "2026-06-10T00:00:00.000Z",
      startDate: "2026-06-09",
      availableEndDate: "2026-06-11",
      overall,
      now: new Date("2026-06-15T00:00:00Z"),
    });
    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]).toMatchObject({ date: "2026-06-10", daysSinceCutover: 1, clicks: 10 });
    expect(getDueMilestoneDay("2026-06-10T00:00:00.000Z", new Date("2026-06-17T12:00:00Z"), 3)).toBe(7);
  });

  it("flags material traffic drops and missing brand terms", () => {
    const snapshots = buildPostMigrationTrackingSnapshots({ cutoverDate: "2026-06-10", availableEndDate: "2026-06-11", overall, now: new Date("2026-06-15T00:00:00Z") });
    const flags = buildPostMigrationFlags({
      snapshots,
      hasBrandTerms: false,
      performance: { before: { clicks: 100, impressions: 1000, ctr: 10, position: 2 }, after: { clicks: 18, impressions: 180, ctr: 10, position: 2 }, windowDays: 2, clicksChangePct: -82, impressionsChangePct: -82, positionDelta: 0, pageWinners: [], pageLosers: [], queryWinners: [], queryLosers: [], brandClicks: null, nonBrandClicks: null },
    });
    expect(flags.some((flag) => flag.metric === "clicks" && flag.severity === "warning")).toBe(true);
    expect(flags.some((flag) => flag.metric === "brand-generic")).toBe(true);
  });

  it("builds grouped bullet reports from checklist and actions", () => {
    const report = buildChecklistIssueReport({
      checklist: [{ id: "redirects-chains", phase: "redirects", title: "Redirects resolve directly", status: "fail", evidence: "One broken redirect", recommendation: "Fix it" }],
      actions: [{ priority: "critical", title: "Re-map collapsed redirects", detail: "A → B" }],
      flags: [],
      performance: null,
    });
    expect(report.redirects.join("\n")).toContain("Redirects resolve directly");
    expect(report.redirects.join("\n")).toContain("Re-map collapsed redirects");
  });
});
