// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("switches from 30-day to 60-day bars and identifies the cutover row", () => {
    const older = snapshot("2026-08-05", -40);
    const before = snapshot("2026-09-13", -1);
    const cutover = snapshot("2026-09-14", 1);
    const later = snapshot("2026-10-24", 41);
    const { container } = render(<SeoMigrationCheckView result={baseResult([older, before, cutover, later])} />);

    const chart = screen.getByRole("img", { name: /Daily clicks and impressions bars/ });
    expect(chart.querySelectorAll("rect").length).toBe(5); // two dates × two bars + post-cutover shading
    expect(chart.querySelector("polyline")).toBeNull();
    expect(screen.getByRole("button", { name: "30 days before and after" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("14th Sep · migration").closest("tr")?.getAttribute("style")).toContain("background");

    fireEvent.click(screen.getByRole("button", { name: "60 days before and after" }));
    expect(screen.getByRole("button", { name: "60 days before and after" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: /Daily clicks and impressions bars/ }).querySelectorAll("rect").length).toBe(9);
    expect(container.querySelectorAll("tbody tr").length).toBe(4); // table remains complete in either view
  });

  it("explains the empty state when no tracking data exists", () => {
    render(<SeoMigrationCheckView result={baseResult([])} />);

    expect(screen.getByText(/No before\/after traffic chart yet/)).toBeTruthy();
  });
});
