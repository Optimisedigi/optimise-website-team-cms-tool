import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";

/**
 * Checklist sign-ups are reported as a column on the market and device tables
 * rather than as a panel of their own.
 *
 * The old "Other conversions" card said the same thing in isolation, so a
 * reader comparing markets had to hold one number in their head while looking
 * at another. These assertions pin the column onto both tables and pin the
 * card as gone, so a later tidy-up cannot quietly restore the split view.
 */

const report = {
  filters: { page: null, device: null, market: null },
  pages: [{ key: "offshore-teams-au", sessions: 2079, conversions: 110, conversionRate: 0.053 }],
  markets: [
    { key: "AU", sessions: 1298, conversions: 74, conversionRate: 0.057, checklistSessions: 2 },
    { key: "US", sessions: 781, conversions: 36, conversionRate: 0.046, checklistSessions: 1 },
  ],
  devices: [
    { key: "mobile", sessions: 1286, conversions: 53, conversionRate: 0.041, checklistSessions: 2 },
    { key: "desktop", sessions: 644, conversions: 53, conversionRate: 0.082, checklistSessions: 1 },
    // Zero must render as "0": a blank cell reads as "not measured", which is a
    // different finding from "nobody signed up on this device".
    { key: "tablet", sessions: 149, conversions: 4, conversionRate: 0.027, checklistSessions: 0 },
  ],
  attribution: [],
  experiment: {
    id: "landing-hero-v1",
    name: "Hero test",
    status: "running",
    allocationVersion: "1",
    primaryGoal: "booking_complete",
    startedAt: null,
  },
  rangeDays: 30,
  controlVariantId: "a",
  variants: [],
  comparisons: [],
  funnel: [],
  funnelByVariant: {},
  formSubmissions: [],
  secondaryConversions: [
    { id: "readiness_checklist", label: "Readiness checklist sign-ups", sessions: 3, rate: 0.0014 },
  ],
  sections: [],
  behaviourTotals: {},
  eventsScanned: 4200,
  truncated: false,
};

afterEach(() => vi.restoreAllMocks());

function renderTab(overrides: Partial<typeof report> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...report, ...overrides }) })
  );
  render(<LandingExperimentTab slug="away-digital" />);
}

/** The table under a given card heading. */
async function tableUnder(heading: string) {
  const node = await screen.findByRole("heading", { name: heading });
  return node.closest("section")!.querySelector("table")!;
}

function rowFor(table: HTMLTableElement, label: string) {
  return within(table).getByText(label).closest("tr")!;
}

describe("checklist sign-ups on the market and device tables", () => {
  it("adds the column to the markets table", async () => {
    renderTab();

    const table = await tableUnder("Markets");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      "Market",
      "Sessions",
      "Conversions",
      "Conversion rate",
      "Readiness checklist sign-ups",
    ]);

    expect(within(rowFor(table, "AU")).getByText("2")).toBeTruthy();
    expect(within(rowFor(table, "US")).getByText("1")).toBeTruthy();
  });

  it("adds the column to the devices table, including a zero", async () => {
    renderTab();

    const table = await tableUnder("Devices");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      "Device",
      "Sessions",
      "Conversions",
      "Conversion rate",
      "Readiness checklist sign-ups",
    ]);

    expect(within(rowFor(table, "mobile")).getByText("2")).toBeTruthy();
    expect(within(rowFor(table, "desktop")).getByText("1")).toBeTruthy();
    expect(within(rowFor(table, "tablet")).getByText("0")).toBeTruthy();
  });

  it("renders a missing count as zero rather than an empty cell", async () => {
    // An older API response, before the facet carried the column. Two markets,
    // because a single-market table is hidden as having nothing to compare.
    renderTab({
      markets: [
        { key: "AU", sessions: 10, conversions: 1, conversionRate: 0.1 },
        { key: "US", sessions: 8, conversions: 1, conversionRate: 0.125 },
      ],
    } as Partial<typeof report>);

    const table = await tableUnder("Markets");
    const cells = within(rowFor(table, "AU"))
      .getAllByRole("cell")
      .map((cell) => cell.textContent?.trim());
    expect(cells[cells.length - 1]).toBe("0");
  });

  it("drops the Other conversions card the column replaced", async () => {
    renderTab();

    await screen.findByRole("heading", { name: "Markets" });
    expect(screen.queryByRole("heading", { name: "Other conversions" })).toBeNull();
  });

  it("keeps the headline checklist figure, which the card is not needed for", async () => {
    // The headline row only renders with variants present, so this case supplies
    // them; the tables above do not need them.
    renderTab({
      variants: [
        { variantId: "a", sessions: 2079, conversions: 110, conversionRate: 0.053, interval: [0, 0], eventCounts: {} },
      ],
    } as Partial<typeof report>);

    await screen.findByRole("heading", { name: "Markets" });

    // Still reported at the top beside the primary goal: removing the card must
    // not remove the number, only the second place it was shown.
    const label = screen.getAllByText("Readiness checklist sign-ups")[0];
    const card = label.parentElement!;
    expect(within(card).getByText("3")).toBeTruthy();
    expect(within(card).getByText("0.14% of sessions")).toBeTruthy();
  });
});
