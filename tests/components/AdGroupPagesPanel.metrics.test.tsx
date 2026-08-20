// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AdGroupPagesPanel } from "@/components/dashboards/landing/AdGroupPagesPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdGroupPagesPanel measurement labels", () => {
  it("shows only generated URLs with Ads-tagged sessions and puts campaign before ad group", async () => {
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
                bounceRate: 100,
                medianSeconds: 8,
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
                bounceRate: 40,
                medianSeconds: 20,
              },
            ],
          }),
        }),
      ),
    );

    render(<AdGroupPagesPanel slug="away-digital-teams" />);

    await screen.findByText("https://hire.awaydigitalteams.com/lp/bpo-services-au");
    expect(screen.getByText("https://hire.awaydigitalteams.com/outsourcing-au")).toBeTruthy();
    expect(screen.queryByText("bpo-services-au", { exact: true })).toBeNull();
    expect(screen.queryByText("https://hire.awaydigitalteams.com/unused-au")).toBeNull();
    expect(screen.getAllByText("Engaged sessions")).toHaveLength(2);
    expect(screen.getAllByText("Google Ads")).toHaveLength(2);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.queryByText("Mapped clicks")).toBeNull();
    expect(screen.getByText(/kept a section 50%/)).toBeTruthy();
    const campaign = screen.getByText(/Search Exact · Search Phrase/);
    const adGroup = screen.getByText("bpo", { exact: true });
    expect(campaign.compareDocumentPosition(adGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText(/not mapped/)).toHaveLength(2);
  });
});
