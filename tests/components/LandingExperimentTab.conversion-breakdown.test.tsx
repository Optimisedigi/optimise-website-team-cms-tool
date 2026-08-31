import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";

/**
 * The conversions card totals both doorways into the page and shows its parts.
 *
 * It used to count bookings alone and label itself "Bookings completed", so a
 * visitor who submitted the form without picking a time, or who gave an email to
 * the HubSpot chat bot, reached the CRM while this card read zero. A single
 * unexplained number is what made that gap hard to see, so the parts are pinned
 * here beside the total: the card must always be able to be taken apart.
 */

const report = {
  filters: { page: null, device: null, market: null },
  pages: [{ key: "offshore-teams-au", sessions: 100, conversions: 5, conversionRate: 0.05 }],
  markets: [],
  devices: [],
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
  secondaryConversions: [],
  sections: [],
  engagedSessions: 60,
  behaviourTotals: {},
  eventsScanned: 900,
  truncated: false,
};

/*
 * One landing page, carrying the paid counts the headline cards read.
 *
 * Passed as the `landingPages` prop rather than through the fetch mock: the
 * fetched catalogue only supplies titles and click counts, while every paid
 * figure on the cards comes from this prop.
 */
const page = {
  pageId: "offshore-teams-au",
  title: "Outsourcing AU",
  clicks: 400,
  adGroups: [{ name: "Generic outsourcing", campaign: "Generic" }],
  paidSessions: 80,
  paidEngagedSessions: 40,
  paidTrackedConversions: 3,
  paidChecklistSessions: 2,
  paidChatSessions: 7,
  paidChatLeadSessions: 4,
};

afterEach(() => vi.restoreAllMocks());

function renderTab(overrides: Partial<typeof page> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          String(url).includes("landing-pages") ? { pages: [{ ...page, ...overrides }] } : report,
      }),
    ),
  );
  render(
    <LandingExperimentTab slug="away-digital-teams" landingPages={[{ ...page, ...overrides }]} />,
  );
}

/*
 * The stat card carrying a given label.
 *
 * Matched on the card's own label element, not on the text anywhere: the same
 * words head columns in the tables further down, so a bare text lookup finds
 * several nodes and the one it settles on is not necessarily the card.
 */
async function card(label: string) {
  const labels = await screen.findAllByText(label);
  const node = labels.find((element) =>
    element.className.includes("text-slate-500") &&
    element.parentElement?.className.includes("rounded-2xl"),
  );
  if (!node) throw new Error(`No stat card labelled "${label}"`);
  return node.parentElement!;
}

describe("conversions card", () => {
  it("totals form submits and chat sign-ups, and shows both parts", async () => {
    renderTab();

    const conversions = await card("Conversions");
    // 3 form conversions + 4 chat sign-ups.
    expect(within(conversions).getByText("7")).toBeTruthy();

    const rows = within(conversions)
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ["Form submits", "3"],
      ["Chat sign-ups", "4"],
    ]);

    // The old label named the booking event while the number had stopped
    // meaning that. It must not come back.
    expect(screen.queryByText("Bookings completed")).toBeNull();
  });

  it("rates the total, not the form half of it", async () => {
    renderTab();

    // 7 conversions of 80 paid sessions. Rating only the 3 form conversions
    // would read 3.75% and disagree with the card beside it.
    const rate = await card("Conversion rate");
    expect(within(rate).getByText("8.75%")).toBeTruthy();
  });

  it("keeps chats that never reached an email out of the total", async () => {
    renderTab();

    // 7 conversations started, 4 of which gave an email. Only the 4 are leads;
    // the rest are drop-off and belong to their own card.
    const started = await card("Chats started");
    expect(within(started).getByText("7")).toBeTruthy();

    const conversions = await card("Conversions");
    expect(within(conversions).queryByText("10")).toBeNull();
    expect(within(conversions).queryByText("11")).toBeNull();
  });

  it("still reports the form total when chat produced nothing", async () => {
    renderTab({ paidChatSessions: 0, paidChatLeadSessions: 0 });

    const conversions = await card("Conversions");
    // The headline figure specifically: with chat at zero the total equals the
    // form half, so "3" also appears in the breakdown below it.
    expect(conversions.querySelector("div.font-bold")?.textContent).toBe("3");
    const rows = within(conversions)
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    // Zero renders as "0": a blank reads as "not measured", which is a different
    // finding from "nobody signed up in chat".
    expect(rows).toEqual([
      ["Form submits", "3"],
      ["Chat sign-ups", "0"],
    ]);
  });
});
