// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SeoMigrationCheckView, { type MigrationResult } from "@/components/SeoMigrationCheckView";

afterEach(() => {
  cleanup();
});

const snapshot = (date: string, daysSinceCutover: number) => ({
  date,
  daysSinceCutover,
  clicks: 10,
  impressions: 100,
  ctr: 10,
  position: 5,
});

const baseResult = (
  trackingSnapshots: MigrationResult["trackingSnapshots"],
): MigrationResult => ({
  siteUrl: "https://example.com/",
  cutoverDate: "2026-09-14",
  overallScore: 80,
  scoresByPhase: { redirects: 80, indexing: 80, performance: 80, technical: 80, process: 80 },
  checklist: [],
  trackingSnapshots,
});

describe("SeoMigrationCheckView migration marker", () => {
  it("hides the migration marker while only pre-migration days are available", () => {
    render(
      <SeoMigrationCheckView
        result={baseResult([snapshot("2026-09-10", -4), snapshot("2026-09-11", -3)])}
      />,
    );

    expect(screen.queryByText("Migration date")).toBeNull();
    expect(screen.getByText(/Only pre-migration days are available so far/)).toBeTruthy();
  });

  it("draws the migration marker once a post-migration day lands", () => {
    render(
      <SeoMigrationCheckView
        result={baseResult([
          snapshot("2026-09-13", -1),
          snapshot("2026-09-14", 1),
          snapshot("2026-09-15", 2),
        ])}
      />,
    );

    expect(screen.getByText("Migration date")).toBeTruthy();
    expect(screen.queryByText(/Only pre-migration days are available so far/)).toBeNull();
  });

  it("explains the empty state when no tracking data exists", () => {
    render(<SeoMigrationCheckView result={baseResult([])} />);

    expect(screen.getByText(/No before\/after traffic chart yet/)).toBeTruthy();
  });
});
