// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";

/**
 * The range control mirrors the Google Ads dashboard: the same preset list,
 * custom range at the bottom of the menu, and the dates it resolves to spelled
 * out beneath the dropdown so the preset is never ambiguous.
 */

const REPORT = {
  filters: { page: null, device: null, market: null },
  pages: [],
  markets: [],
  devices: [],
  attribution: [],
  experiment: null,
  rangeDays: 7,
  controlVariantId: "a",
  variants: [],
  comparisons: [],
  funnel: [],
  funnelByVariant: {},
  formSubmissions: [],
  secondaryConversions: [],
  sections: [],
  engagedSessions: 0,
  behaviourTotals: {},
  eventsScanned: 0,
  truncated: false,
};

beforeEach(() => {
  // shouldAdvanceTime: the component's fetches resolve on real timers, which a
  // frozen clock would stall forever.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T16:00:00.000Z"));
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => (url.includes("landing-pages") ? { pages: [] } : REPORT),
  })));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const caption = () => screen.getByTestId("landing-range-caption").textContent;

describe("landing dashboard range control", () => {
  it("mirrors the Google Ads range dropdown, including this month, last month, and custom range", async () => {
    render(<LandingExperimentTab slug="away-digital-teams" />);
    fireEvent.click(await screen.findByLabelText(/Range/));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "This month",
      "This week",
      "Last week",
      "Last month",
      "Last 30 days",
      "Last 60 days",
      "Last 3 months",
      "Last 6 months",
      "This year",
      "Last year",
      "All time",
    ]);
    expect(screen.getByText("Custom range")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply custom range" })).toBeTruthy();
  });

  it("captions the selected range with the dates it covers", async () => {
    render(<LandingExperimentTab slug="away-digital-teams" />);
    await screen.findByLabelText(/Range/);

    // Default: this week, Monday through today. The clock above is 2am on the
    // 21st in Sydney, the zone the dashboard cuts its days in, so "today" is
    // the 21st even though it is still the 20th in UTC.
    expect(caption()).toBe("17 Aug 2026 – 21 Aug 2026");

    fireEvent.click(await screen.findByLabelText(/Range/));
    fireEvent.click(screen.getByRole("option", { name: "Last week" }));

    // The completed Mon–Sun week, matching the Google Ads dashboard.
    await waitFor(() => expect(caption()).toBe("10 Aug 2026 – 16 Aug 2026"));

    fireEvent.click(await screen.findByLabelText(/Range/));
    fireEvent.click(screen.getByRole("option", { name: "This month" }));
    await waitFor(() => expect(caption()).toBe("1 Aug 2026 – 21 Aug 2026"));

    fireEvent.click(await screen.findByLabelText(/Range/));
    fireEvent.click(screen.getByRole("option", { name: "Last month" }));
    await waitFor(() => expect(caption()).toBe("1 Jul 2026 – 31 Jul 2026"));
  });

  it("keeps the caption on its own line under the dropdown", async () => {
    render(<LandingExperimentTab slug="away-digital-teams" />);
    const select = await screen.findByLabelText(/Range/);

    // Bottom-aligning the filter row would lift the dropdown above the other
    // selects to make room for the caption, so the row aligns from the top.
    const row = select.closest("div.flex-wrap")!;
    expect(row.className).toContain("items-start");
    expect(row.className).not.toContain("items-end");

    // The caption sits after the dropdown inside the same column, so it renders
    // directly beneath it rather than beside it.
    const column = select.closest("div.flex-col")!;
    expect(column.lastElementChild).toBe(screen.getByTestId("landing-range-caption"));
  });
});
