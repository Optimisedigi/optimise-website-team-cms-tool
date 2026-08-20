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
  it("shows unavailable bounce and time-on-site as n/a instead of misleading values", async () => {
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
                adGroupIds: ["1"],
                noindex: true,
                adGroups: [{ id: "1", name: "bpo", campaign: "Search", clicks: 49, cost: 1340 }],
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
    await waitFor(() => expect(screen.getAllByText("n/a")).toHaveLength(2));
    expect(screen.queryByText("100%")).toBeNull();
    expect(screen.queryByText("8s")).toBeNull();
  });
});
