// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdGroupPagesPanel } from "@/components/dashboards/landing/AdGroupPagesPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdGroupPagesPanel measurement labels", () => {
  it("shows only Google Ads landing sessions, paid metrics, and stacked actions", async () => {
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            adMetricsAvailable: true,
            pages: [
              {
                pageId: "ag-bpo-services-au",
                slug: "bpo-services-au",
                market: "AU",
                url: "https://hire.awaydigitalteams.com/lp/bpo-services-au",
                title: "BPO Services",
                headline: "BPO services without the churn",
                adGroupIds: ["1", "2"],
                noindex: true,
                adGroups: [
                  { id: "1", name: "bpo", campaign: "Search Exact", clicks: 29, cost: 800 },
                  { id: "2", name: "bpo", campaign: "Search Phrase", clicks: 20, cost: 540 },
                ],
                clicks: 49,
                cost: 1340,
                conversions: 0,
                sessions: 12,
                paidSessions: 12,
                engagedSessions: 7,
                paidEngagedSessions: 5,
                trackedConversions: 2,
                paidTrackedConversions: 1,
                averageSeconds: 11,
                paidAverageSeconds: 9,
                bounceRate: 100,
                medianSeconds: 8,
                paidMedianSeconds: 7,
              },
              {
                pageId: "ag-unused-au",
                slug: "unused-au",
                market: "AU",
                url: "https://hire.awaydigitalteams.com/unused-au",
                title: "Unused",
                headline: "No Google Ads visit",
                adGroupIds: ["3"],
                noindex: true,
                adGroups: [{ id: "3", name: "unused", campaign: "Search Other", clicks: 20, cost: 200 }],
                clicks: 20,
                cost: 200,
                conversions: 0,
                sessions: 4,
                paidSessions: 0,
                engagedSessions: 0,
                paidEngagedSessions: 0,
                bounceRate: 100,
                medianSeconds: null,
              },
              {
                pageId: "offshore-teams-au",
                slug: "outsourcing-au",
                market: "AU",
                url: "https://hire.awaydigitalteams.com/outsourcing-au",
                title: "AU outsourcing",
                headline: "Outsourcing, done better",
                adGroupIds: [],
                noindex: false,
                adGroups: [],
                clicks: 0,
                cost: 0,
                conversions: 0,
                sessions: 20,
                paidSessions: 10,
                engagedSessions: 8,
                paidEngagedSessions: 6,
                trackedConversions: 1,
                averageSeconds: 24,
                paidAverageSeconds: 20,
                bounceRate: 40,
                medianSeconds: 20,
                paidMedianSeconds: 18,
              },
            ],
          }),
        }),
      ),
    );

    render(<AdGroupPagesPanel slug="away-digital-teams" />);

    const headline = await screen.findByText("BPO services without the churn");
    const cleanUrl = screen.getByText("hire.awaydigitalteams.com/lp/bpo-services-au");
    expect(screen.getByText("hire.awaydigitalteams.com/outsourcing-au")).toBeTruthy();
    expect(screen.queryByText("hire.awaydigitalteams.com/unused-au")).toBeNull();
    expect(screen.queryByText("https://hire.awaydigitalteams.com/lp/bpo-services-au")).toBeNull();
    expect(headline.compareDocumentPosition(cleanUrl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("Google Ads clicks")).toHaveLength(2);
    expect(screen.getAllByText("Google Ads sessions")).toHaveLength(2);
    expect(screen.getAllByText("Engaged sessions")).toHaveLength(2);
    expect(screen.getAllByText("Conversions")).toHaveLength(2);
    expect(screen.getAllByText("Conversion rate")).toHaveLength(2);
    expect(screen.getAllByText("Time / session")).toHaveLength(2);
    expect(screen.getByText("9s")).toBeTruthy();
    expect(screen.getByText("20s")).toBeTruthy();
    expect(screen.getByText("8.33%")).toBeTruthy();
    expect(screen.getByText("0.00%")).toBeTruthy();
    expect(screen.getByText(/Only sessions carrying gclid, gbraid or wbraid/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AU" })).toHaveClass("text-sm");
    const campaign = screen.getByText(/Search Exact · Search Phrase/);
    const adGroup = screen.getByText("bpo", { exact: true });
    expect(campaign).toHaveClass("lg:whitespace-nowrap");
    expect(campaign.compareDocumentPosition(adGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(/not mapped/)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Preview" })[0]?.parentElement).toHaveClass(
      "flex-col",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    expect(openMock).toHaveBeenCalledTimes(2);
    expect(openMock).toHaveBeenCalledWith(
      "https://hire.awaydigitalteams.com/lp/bpo-services-au",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openMock).toHaveBeenCalledWith(
      "https://hire.awaydigitalteams.com/outsourcing-au",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("does not render a second loading panel", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = render(<AdGroupPagesPanel slug="away-digital-teams" />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Loading pages…")).toBeNull();
  });
});
