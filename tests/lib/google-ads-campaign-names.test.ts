import { afterEach, describe, expect, it, vi } from "vitest";
import {
  labelCampaignIds,
  loadGoogleAdsCampaignNames,
} from "@/lib/google-ads-campaign-names";

const row = (key: string) => ({ key, sessions: 3, conversions: 0, conversionRate: 0 });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Google Ads campaign names", () => {
  it("replaces numeric campaign attribution while preserving direct and missing attribution", () => {
    const rows = [
      row("adwords / ppc / 23970828617"),
      row("adwords / ppc / (none)"),
      row("(direct) / (none) / (none)"),
    ];

    expect(
      labelCampaignIds(
        rows,
        new Map([["23970828617", "Search - Generic - Outsourcing - US - Exact (Manual CPC)"]]),
      ).map((entry) => entry.key),
    ).toEqual([
      "adwords / ppc / Search - Generic - Outsourcing - US - Exact (Manual CPC)",
      "adwords / ppc / (none)",
      "(direct) / (none) / (none)",
    ]);
  });

  it("loads and validates campaign names from the Google Ads service", async () => {
    vi.stubEnv("GROWTH_TOOLS_URL", "http://growth.test/");
    vi.stubEnv("INTERNAL_API_KEY", "key");
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            campaigns: [
              { campaignId: "23970828617", campaignName: "Search - US" },
              { campaignId: "not-an-id", campaignName: "Invalid" },
            ],
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const names = await loadGoogleAdsCampaignNames("342-535-3766");

    expect(names).toEqual(new Map([["23970828617", "Search - US"]]));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://growth.test/api/google-ads/campaign-budgets/list",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": "key" },
        body: JSON.stringify({ customerId: "3425353766", dateRange: "LAST_30_DAYS" }),
      }),
    );
  });
});
