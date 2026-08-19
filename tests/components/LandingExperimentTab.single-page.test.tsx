import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";

/**
 * A client running exactly one landing page must still get the page selector,
 * and the preview once that page is chosen.
 *
 * Both were gated on `pages.length > 1`, written when demo data always had two
 * markets. Real traffic arrived on a single page, so the selector never
 * rendered and the preview — which is keyed off `LANDING_PAGES[page]` —
 * silently disappeared along with the section labels it anchors.
 *
 * The report now opens on all pages pooled rather than auto-selecting one, so
 * the preview follows an explicit choice: a preview implies "these numbers are
 * this page's", which is not true of a pooled view.
 */

const report = {
  filters: { page: null, device: null, market: null },
  pages: [{ key: "offshore-teams-au", sessions: 3, conversions: 1, conversionRate: 0.333 }],
  markets: [{ key: "AU", sessions: 3, conversions: 1, conversionRate: 0.333 }],
  devices: [{ key: "desktop", sessions: 3, conversions: 1, conversionRate: 0.333 }],
  attribution: [],
  experiment: {
    id: "landing-hero-v1",
    name: "Hero headline — capability vs outcome",
    status: "running",
    allocationVersion: "1",
    primaryGoal: "booking_complete",
    startedAt: "2026-08-14T09:35:56.627Z",
  },
  rangeDays: 30,
  controlVariantId: "a",
  variants: [
    {
      variantId: "a",
      sessions: 0,
      conversions: 0,
      conversionRate: 0,
      interval: [0, 0] as [number, number],
      eventCounts: {},
    },
    {
      variantId: "b",
      sessions: 3,
      conversions: 1,
      conversionRate: 0.333,
      interval: [0.017, 0.79] as [number, number],
      eventCounts: {},
    },
  ],
  comparisons: [],
  funnel: [
    {
      key: "page_view",
      label: "Landed",
      sessions: 2,
      shareOfEntry: 1,
      droppedFromPrevious: 0,
      dropOffRate: 0,
    },
  ],
  funnelByVariant: {},
  formSubmissions: [],
  sections: [
    { sectionId: "hero", sessions: 2, medianSeconds: 8, p90Seconds: 20, exits: 0, exitRate: 0 },
    { sectionId: "tools", sessions: 1, medianSeconds: 15, p90Seconds: 30, exits: 1, exitRate: 1 },
  ],
  behaviourTotals: { page_view: 2, section_view: 4 },
  eventsScanned: 11,
  truncated: false,
};

function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => report });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.restoreAllMocks());

describe("LandingExperimentTab with a single landing page", () => {
  it("shows the page preview once that page is selected", async () => {
    stubFetch();
    render(<LandingExperimentTab slug="away-digital" />);

    const select = await screen.findByLabelText("Page");
    fireEvent.change(select, { target: { value: "offshore-teams-au" } });

    const frame = await screen.findByTitle(/^Preview of /);
    expect(frame.getAttribute("src")).toContain("/outsourcing-au");
  });

  it("offers the page selector rather than hiding it", async () => {
    stubFetch();
    render(<LandingExperimentTab slug="away-digital" />);

    const select = await screen.findByLabelText("Page");
    expect(
      Array.from(select.querySelectorAll("option")).map((option) => option.textContent),
    ).toContain("offshore-teams-au (3)");
  });

  it("opens on every page pooled rather than silently picking one", async () => {
    const fetchMock = stubFetch();
    render(<LandingExperimentTab slug="away-digital" />);

    // The selector reads "All pages" on arrival, so the request must not carry a
    // page filter: a pre-filtered report under an "all" label understates every
    // number on the screen.
    const select = (await screen.findByLabelText("Page")) as HTMLSelectElement;
    expect(select.value).toBe("");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("page="))).toBe(false);
  });
});
