import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";

/**
 * Covers the two things typecheck cannot see: that the attribution facet
 * actually reaches the table, and that the page preview is the first cell of
 * the section grid and stays pinned while the numbers beside it scroll.
 *
 * Both are pure render assertions, so they fail if the grid order is flipped
 * back or the sticky classes are dropped in a later tidy-up.
 */

/** Two pages, so a page can be selected to resolve pageMeta and the preview. */
const report = {
  filters: { page: null, device: null, market: null },
  pages: [
    { key: "offshore-teams-au", sessions: 2076, conversions: 110, conversionRate: 0.053 },
    { key: "offshore-teams-us", sessions: 400, conversions: 12, conversionRate: 0.03 },
  ],
  markets: [],
  devices: [],
  attribution: [
    {
      key: "google / cpc / brand-au",
      sessions: 2076,
      conversions: 110,
      conversionRate: 0.052987,
      checklistSessions: 64,
    },
    {
      key: "(direct) / (none) / (none)",
      sessions: 318,
      conversions: 4,
      conversionRate: 0.012579,
      checklistSessions: 9,
    },
  ],
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
  funnel: [
    { key: "page_view", label: "Landed", sessions: 2076, shareOfEntry: 1, droppedFromPrevious: 0, dropOffRate: 0 },
    { key: "cta_click", label: "Clicked a CTA", sessions: 800, shareOfEntry: 0.385, droppedFromPrevious: 1276, dropOffRate: 0.614 },
    { key: "form_start", label: "Started the form", sessions: 300, shareOfEntry: 0.144, droppedFromPrevious: 500, dropOffRate: 0.625 },
    { key: "form_submit", label: "Submitted the form", sessions: 180, shareOfEntry: 0.086, droppedFromPrevious: 120, dropOffRate: 0.4 },
    { key: "booking_open", label: "Opened booking", sessions: 140, shareOfEntry: 0.067, droppedFromPrevious: 40, dropOffRate: 0.222 },
    { key: "booking_complete", label: "Booked", sessions: 110, shareOfEntry: 0.053, droppedFromPrevious: 30, dropOffRate: 0.214 },
  ],
  funnelByVariant: {},
  formSubmissions: [
    { formId: "readiness-checklist", label: "Readiness checklist (PDF)", sessions: 128 },
    { formId: "qualification", label: "Qualification form", sessions: 52 },
  ],
  sections: [
    { sectionId: "hero", sessions: 2076, medianSeconds: 9, p90Seconds: 22, exits: 40, exitRate: 0.02 },
  ],
  behaviourTotals: {},
  eventsScanned: 4200,
  truncated: false,
};

afterEach(() => vi.restoreAllMocks());

function renderTab() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => report }),
  );
  render(<LandingExperimentTab slug="away-digital" />);
}

/**
 * The report opens on all pages pooled, and a preview only makes sense once a
 * single page is chosen — so the preview cases select one first.
 */
async function renderTabWithPage() {
  renderTab();
  const select = await screen.findByLabelText("Page");
  fireEvent.change(select, { target: { value: "offshore-teams-au" } });
}

describe("LandingExperimentTab attribution table", () => {
  it("lists each source/medium/campaign with its sessions and conversions", async () => {
    renderTab();

    const heading = await screen.findByRole("heading", { name: "Attribution" });
    // Scoped to the card, not to the heading's immediate parent: the heading
    // shares a row with other header content, so its parent is not the card.
    const table = heading.closest("section")!.querySelector("table")!;
    expect(table).toBeTruthy();

    const paidRow = within(table).getByText("google / cpc / brand-au").closest("tr")!;
    expect(within(paidRow).getByText("2,076")).toBeTruthy();
    expect(within(paidRow).getByText("110")).toBeTruthy();
    expect(within(paidRow).getByText("5.30%")).toBeTruthy();

    // An untagged visit is a real bucket, not missing data, so it must appear.
    const directRow = within(table).getByText("(direct) / (none) / (none)").closest("tr")!;
    expect(within(directRow).getByText("318")).toBeTruthy();
    expect(within(directRow).getByText("4")).toBeTruthy();
  });

  it("names the three attribution columns", async () => {
    renderTab();

    const heading = await screen.findByRole("heading", { name: "Attribution" });
    const table = heading.closest("section")!.querySelector("table")!;
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);

    expect(headers).toEqual([
      "Source / medium / campaign / landing page",
      "Sessions",
      "Conversions",
      "Conversion rate",
      "Readiness checklist sign-ups",
    ]);
  });

  it("reports checklist sign-ups per attribution bucket", async () => {
    renderTab();

    const heading = await screen.findByRole("heading", { name: "Attribution" });
    const table = heading.closest("section")!.querySelector("table")!;

    const paidRow = within(table).getByText("google / cpc / brand-au").closest("tr")!;
    expect(within(paidRow).getByText("64")).toBeTruthy();

    const directRow = within(table).getByText("(direct) / (none) / (none)").closest("tr")!;
    expect(within(directRow).getByText("9")).toBeTruthy();
  });
});

/**
 * The funnel card was removed from the report, and the form split and its
 * pooled step went with it: both lived inside that card. Checklist sign-ups are
 * now reported as a headline figure and as an attribution column instead.
 *
 * Asserted rather than deleted, so the removal stays deliberate — a later edit
 * that reinstates the funnel has to reinstate this decision too.
 */
describe("LandingExperimentTab funnel removal", () => {
  it("drops the funnel card and the form split that lived inside it", async () => {
    renderTab();

    await screen.findByRole("heading", { name: "Attribution" });
    expect(screen.queryByText("Where people drop off")).toBeNull();
    expect(screen.queryByText("Which form was submitted")).toBeNull();
    expect(screen.queryByText("Submitted the form")).toBeNull();
  });

  it("still reports checklist sign-ups, the outcome the split was read for", async () => {
    renderTab();

    await screen.findByRole("heading", { name: "Attribution" });
    expect(screen.getAllByText("Readiness checklist sign-ups").length).toBeGreaterThan(0);
  });
});

describe("LandingExperimentTab page preview placement", () => {
  it("puts the preview in the first grid cell, before the section table", async () => {
    await renderTabWithPage();

    const iframe = await screen.findByTitle(/^Preview of /);
    const card = iframe.closest("div.xl\\:sticky")!;
    const previewCell = card.parentElement!;
    const grid = previewCell.parentElement!;

    // First child of the grid: the preview renders left of the numbers rather
    // than after them.
    expect(grid.firstElementChild).toBe(previewCell);
    expect(grid.className).toContain("xl:grid-cols-[400px_minmax(0,1fr)]");

    // The section table is the cell that follows it.
    expect(grid.children).toHaveLength(2);
    expect(grid.children[1].querySelector("table")).toBeTruthy();
  });

  it("sizes the preview to the sections table height", async () => {
    await renderTabWithPage();

    const iframe = await screen.findByTitle(/^Preview of /);
    const card = iframe.closest("div.xl\\:sticky")!;
    const previewCell = card.parentElement!;

    // Cell stretches to the grid row (the table), card fills the cell, iframe
    // takes the remaining space under the caption — no fixed pixel height.
    expect(previewCell.className).toContain("h-full");
    expect(card.className).toContain("h-full");
    expect(card.className).toContain("flex-col");
    expect(iframe.className).toContain("flex-1");
    // A floor (`min-h-`) is fine; a fixed `h-[600px]` would pin it off the table.
    expect(iframe.className).not.toMatch(/(^|\s)h-\[\d+px\]/);
  });

  it("keeps the preview pinned while the rest of the report scrolls", async () => {
    await renderTabWithPage();

    const iframe = await screen.findByTitle(/^Preview of /);
    const card = iframe.closest("div.xl\\:sticky")!;

    expect(card.className).toContain("xl:sticky");
    expect(card.className).toContain("xl:top-4");
    // Capped to the viewport, so a table taller than the screen still leaves the
    // preview visible rather than scrolling it off.
    expect(card.className).toContain("max-h-[calc(100vh-2rem)]");
  });

  it("sandboxes the preview so admin scrolling cannot record events", async () => {
    await renderTabWithPage();

    const iframe = await screen.findByTitle(/^Preview of /);
    // No allow-same-origin: the SDK then calls from an opaque origin, which the
    // allowlist refuses.
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms");
    await waitFor(() => expect(iframe.getAttribute("src")).toContain("/outsourcing-au"));
  });
});
