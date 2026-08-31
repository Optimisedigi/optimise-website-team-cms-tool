// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";

/**
 * The range control mirrors the Google Ads dashboard: a Mon–Sun "Last week"
 * preset, and the dates it resolves to spelled out beneath the dropdown so the
 * preset is never ambiguous.
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
  it("offers last week and custom dates alongside the other presets", async () => {
    render(<LandingExperimentTab slug="away-digital-teams" />);
    const select = await screen.findByLabelText(/Range/);

    expect(Array.from(select.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "This week (Mon–Sun)",
      "Last week (Mon–Sun)",
      "Today",
      "Last 7 days",
      "Last 30 days",
      "Last 90 days",
      "Custom dates",
    ]);
  });

  it("captions the selected range with the dates it covers", async () => {
    render(<LandingExperimentTab slug="away-digital-teams" />);
    await screen.findByLabelText(/Range/);

    // Default: this week, Monday through today.
    expect(caption()).toBe("17 Aug 2026 – 20 Aug 2026");

    fireEvent.change(await screen.findByLabelText(/Range/), { target: { value: "last_week" } });

    // The completed Mon–Sun week, matching the Google Ads dashboard.
    await waitFor(() => expect(caption()).toBe("10 Aug 2026 – 16 Aug 2026"));
  });

  it("keeps the caption on its own line under the dropdown", async () => {
    render(<LandingExperimentTab slug="away-digital-teams" />);
    const select = await screen.findByLabelText(/Range/);

    // Bottom-aligning the filter row would lift the dropdown above the other
    // selects to make room for the caption, so the row aligns from the top.
    const row = select.closest("div.flex-wrap")!;
    expect(row.className).toContain("items-start");
    expect(row.className).not.toContain("items-end");

    // The caption sits after the select inside the same column, so it renders
    // directly beneath it rather than beside it.
    const column = select.parentElement!;
    expect(column.className).toContain("flex-col");
    expect(column.lastElementChild).toBe(screen.getByTestId("landing-range-caption"));
  });
});
