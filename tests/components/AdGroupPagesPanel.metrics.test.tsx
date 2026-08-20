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
  it("shows measured bounce and time-on-site and consolidates duplicate ad-group names", async () => {
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
                bounceRate: 100,
                medianSeconds: 8,
              },
            ],
          }),
        }),
      ),
    );

    render(<AdGroupPagesPanel slug="away-digital-teams" />);

    await screen.findByText("/lp/bpo-services-au");
    await waitFor(() => expect(screen.getByText("100.0%")).toBeTruthy());
    expect(screen.getByText("8s")).toBeTruthy();
    expect(screen.getByText("Sessions")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getAllByText(/Ad group/)).toHaveLength(1);
    expect(screen.getByText(/Search Exact · Search Phrase/)).toBeTruthy();
  });
});
