// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LandingExperimentTab } from "@/components/dashboards/googleads/LandingExperimentTab";

/**
 * The page list runs to dozens of entries across two markets, and the AU and US
 * versions of a page carry the same title. Category and market narrow the list, and the
 * label carries the market so the pair is still tellable apart unfiltered.
 */

const CATALOG = [
  { pageId: "ag-data-engineer-vietnam-au", title: "Hire a data engineer | Away Digital Teams", clicks: 10, market: "AU", adGroups: [{ name: "Data Engineer", campaign: "Category – Developer/IT – AU – Exact" }] },
  { pageId: "ag-data-engineer-vietnam-us", title: "Hire a data engineer | Away Digital Teams", clicks: 10, market: "US", adGroups: [{ name: "Data Engineer", campaign: "Category – Developer/IT – US – Exact" }] },
  { pageId: "ag-seo-specialist-vietnam-au", title: "Hire an SEO specialist | Away Digital Teams", clicks: 10, market: "AU", adGroups: [{ name: "SEO Specialist", campaign: "Category – Marketing/Graphics – AU – Exact" }] },
  { pageId: "ag-vietnam-outsourcing-au", title: "Outsourcing to Vietnam | Away Digital Teams", clicks: 10, market: "AU", adGroups: [{ name: "Vietnam outsourcing", campaign: "Vietnam Outsourcing – AU – Phrase" }] },
];

const REPORT = {
  filters: { page: null, device: null, market: null },
  pages: [],
  markets: [],
  devices: [],
  attribution: [],
  experiment: null,
  rangeDays: 30,
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderTab() {
  vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
    ok: true,
    json: async () => (url.includes("landing-pages") ? { pages: CATALOG } : REPORT),
  })));
  render(<LandingExperimentTab slug="away-digital-teams" />);
  return await screen.findByLabelText("Page");
}

/** Page options, minus the leading "all" entry. */
const options = (select: HTMLElement) =>
  Array.from(select.querySelectorAll("option")).slice(1).map((option) => option.textContent);

describe("category and market filters on the page list", () => {
  it("labels every page with its market", async () => {
    const pageSelect = await renderTab();
    await waitFor(() => expect(options(pageSelect).length).toBe(4));

    expect(options(pageSelect)).toEqual([
      "Hire a data engineer — AU",
      "Hire a data engineer — US",
      "Hire an SEO specialist — AU",
      "Outsourcing to Vietnam — AU",
    ]);
  });

  it("narrows the list by category, by market, and by both together", async () => {
    await renderTab();

    /* Each filter refetches the report, so the controls are replaced by the
       splash and have to be re-queried rather than held across a change. */
    const setFilter = async (label: string, value: string) => {
      fireEvent.change(await screen.findByLabelText(label), { target: { value } });
      return await screen.findByLabelText("Page");
    };

    await waitFor(async () =>
      expect(options(await screen.findByLabelText("Page")).length).toBe(4));

    expect(options(await setFilter("Category", "it"))).toEqual([
      "Hire a data engineer — AU",
      "Hire a data engineer — US",
    ]);

    expect(options(await setFilter("Market", "US"))).toEqual(["Hire a data engineer — US"]);

    // A campaign that is not one of the build's `Category –` campaigns is generic.
    await setFilter("Category", "generic");
    expect(options(await setFilter("Market", "AU"))).toEqual(["Outsourcing to Vietnam — AU"]);
  });

  it("scopes the report itself to the chosen category and market", async () => {
    await renderTab();
    await screen.findByLabelText("Page");

    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "it" } });
    await screen.findByLabelText("Page");
    fireEvent.change(await screen.findByLabelText("Market"), { target: { value: "US" } });
    await screen.findByLabelText("Page");

    // The report request carries both, so the headline, sections, markets and
    // devices all describe the filtered traffic rather than everything.
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("landing-experiments"));
    const last = calls[calls.length - 1];
    expect(last).toContain("market=US");
    expect(last).toContain("pages=ag-data-engineer-vietnam-au%2Cag-data-engineer-vietnam-us");
  });

  it("still scopes the report when a category covers no pages", async () => {
    await renderTab();
    await screen.findByLabelText("Page");

    // No page in the catalog is a finance page. Sending no scope at all would
    // report every page while the dropdown named one empty category.
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "finance-admin" } });
    await screen.findByLabelText("Page");

    const last = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes("landing-experiments"))
      .at(-1)!;
    expect(last).toContain("pages=__no_pages__");
  });

  it("clears the chosen page when a filter could hide it", async () => {
    const pageSelect = await renderTab();
    await waitFor(() => expect(options(pageSelect).length).toBe(4));

    fireEvent.change(pageSelect, { target: { value: "ag-seo-specialist-vietnam-au" } });

    // Picking a page refetches the report, so the controls are replaced behind
    // the splash; wait for them back before touching the category.
    const settled = await screen.findByLabelText("Page");
    await waitFor(() => expect((settled as HTMLSelectElement).value).toBe("ag-seo-specialist-vietnam-au"));

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "it" } });
    const after = await screen.findByLabelText("Page");
    await waitFor(() => expect((after as HTMLSelectElement).value).toBe(""));
  });
});
