import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";

/**
 * A client running exactly one landing page must still get the page preview
 * and the page selector.
 *
 * Both were gated on `pages.length > 1`, written when demo data always had two
 * markets. Real traffic arrived on a single page, so the selector never
 * rendered, the page auto-select never ran, `page` stayed "", and the preview
 * — which is keyed off `LANDING_PAGES[page]` — silently disappeared along with
 * the section labels it anchors.
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
  it("shows the page preview", async () => {
    stubFetch();
    render(<LandingExperimentTab slug="away-digital" />);

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

  it("selects that page instead of leaving the report pooled", async () => {
    const fetchMock = stubFetch();
    render(<LandingExperimentTab slug="away-digital" />);

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.some((url) => url.includes("page=offshore-teams-au"))).toBe(true);
    });
  });
});
