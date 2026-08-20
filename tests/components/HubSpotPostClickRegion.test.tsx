import { describe, expect, it } from "vitest";
import { campaignRegion, hubspotCountryRegion, isHubspotPaidSearchLead, leadRegion, supportsRegionSplit, unclassifiedCampaigns } from "@/components/dashboards/googleads/HubSpotPostClickTab";

describe("campaignRegion", () => {
  it("classifies AU campaigns by country token", () => {
    expect(campaignRegion("AU - Search - Brand")).toBe("AU");
    expect(campaignRegion("Search_AU_NonBrand")).toBe("AU");
    expect(campaignRegion("Australia | Generic")).toBe("AU");
  });

  it("classifies AU campaigns by capital city", () => {
    expect(campaignRegion("Brisbane - Search")).toBe("AU");
    expect(campaignRegion("Search | Melbourne EA")).toBe("AU");
    expect(campaignRegion("SYD - Remarketing")).toBe("AU");
  });

  it("classifies US campaigns", () => {
    expect(campaignRegion("US - Search - Brand")).toBe("US");
    expect(campaignRegion("Search_US_NonBrand")).toBe("US");
    expect(campaignRegion("USA | Generic")).toBe("US");
  });

  it("prefers AU when a name contains AUS, which also contains the US substring", () => {
    expect(campaignRegion("AUS - Search")).toBe("AU");
  });

  it("returns other for unmatched or empty names", () => {
    expect(campaignRegion("Global - Performance Max")).toBe("other");
    expect(campaignRegion("")).toBe("other");
    expect(campaignRegion(undefined)).toBe("other");
  });
});

describe("supportsRegionSplit", () => {
  it("enables the region toggle for Away Digital Teams only", () => {
    expect(supportsRegionSplit({ slug: "away-digital-teams", customerId: "1111111111" })).toBe(true);
    expect(supportsRegionSplit({ slug: "other-client", customerId: "3425353766" })).toBe(true);
    expect(supportsRegionSplit({ slug: "other-client", customerId: "342-535-3766" })).toBe(true);
  });

  it("disables the region toggle for every other client", () => {
    expect(supportsRegionSplit({ slug: "other-client", customerId: "1111111111" })).toBe(false);
    expect(supportsRegionSplit({ slug: "", customerId: "" })).toBe(false);
  });

  // `away-digital` now belongs to a different client, so on the slug alone it
  // must not read as Away. (A matching customer id still enables the toggle;
  // that id is validated against the client record server-side.)
  it("does not treat the reassigned legacy slug as Away", () => {
    expect(supportsRegionSplit({ slug: "away-digital", customerId: "1111111111" })).toBe(false);
  });
});

describe("unclassifiedCampaigns", () => {
  const lead = (campaignName: string) => ({ campaignName, hubspotCampaign: "" }) as never;

  it("surfaces campaigns matching neither AU nor US", () => {
    expect(
      unclassifiedCampaigns({
        leadDetails: [],
        monthlyByCampaign: [
          { month: "2026-06", campaignName: "Global - Performance Max", googleAdsSpend: 10, googleAdsConversions: 1 },
          { month: "2026-06", campaignName: "AU - Search", googleAdsSpend: 10, googleAdsConversions: 1 },
          { month: "2026-06", campaignName: "US - Search", googleAdsSpend: 10, googleAdsConversions: 1 },
        ],
      }),
    ).toEqual(["Global - Performance Max"]);
  });

  it("deduplicates across months and merges lead-detail campaigns", () => {
    expect(
      unclassifiedCampaigns({
        leadDetails: [lead("Demand Gen - APAC"), lead("Brisbane - Search")],
        monthlyByCampaign: [
          { month: "2026-05", campaignName: "Demand Gen - APAC", googleAdsSpend: 5, googleAdsConversions: 0 },
          { month: "2026-06", campaignName: "Demand Gen - APAC", googleAdsSpend: 5, googleAdsConversions: 0 },
          { month: "2026-06", campaignName: "Retargeting - Global", googleAdsSpend: 5, googleAdsConversions: 0 },
        ],
      }),
    ).toEqual(["Demand Gen - APAC", "Retargeting - Global"]);
  });

  it("labels blank campaign names rather than dropping them", () => {
    expect(unclassifiedCampaigns({ leadDetails: [lead("")], monthlyByCampaign: [] })).toEqual(["Unknown campaign"]);
  });

  it("returns an empty list when every campaign is classified", () => {
    expect(
      unclassifiedCampaigns({
        leadDetails: [lead("Search - Brand - AU (Max Clicks)")],
        monthlyByCampaign: [{ month: "2026-06", campaignName: "Search - Brand - US (Max Clicks)", googleAdsSpend: 1, googleAdsConversions: 1 }],
      }),
    ).toEqual([]);
  });
});

describe("hubspotCountryRegion", () => {
  it("maps HubSpot country values to markets", () => {
    expect(hubspotCountryRegion("Australia")).toBe("AU");
    expect(hubspotCountryRegion("australia")).toBe("AU");
    expect(hubspotCountryRegion("AU")).toBe("AU");
    expect(hubspotCountryRegion("United States")).toBe("US");
    expect(hubspotCountryRegion("united states")).toBe("US");
    expect(hubspotCountryRegion("USA")).toBe("US");
  });

  it("treats other or missing countries as unclassified", () => {
    expect(hubspotCountryRegion("New Zealand")).toBe("other");
    expect(hubspotCountryRegion("Viet Nam")).toBe("other");
    expect(hubspotCountryRegion("")).toBe("other");
    expect(hubspotCountryRegion(undefined)).toBe("other");
  });
});

describe("leadRegion cutover", () => {
  it("uses HubSpot country before the cutover, ignoring the mis-tagged AU campaign name", () => {
    expect(leadRegion({ month: "2026-04", campaignName: "Search - Generic - Outsourcing - AU - Phrase", country: "United States", originalSource: "PAID_SEARCH" })).toBe("US");
    expect(leadRegion({ month: "2025-10", campaignName: "Search - Brand - AU (Max Clicks)", country: "United States", originalSource: "PAID_SEARCH" })).toBe("US");
  });

  it("keeps genuinely Australian pre-cutover leads in AU", () => {
    expect(leadRegion({ month: "2026-04", campaignName: "Search - Brand - AU (Max Clicks)", country: "Australia", originalSource: "PAID_SEARCH" })).toBe("AU");
  });

  it("uses the campaign name from the cutover month onward", () => {
    expect(leadRegion({ month: "2026-05", campaignName: "Search - Brand - US (Max Clicks)", country: "Australia" })).toBe("US");
    expect(leadRegion({ month: "2026-07", campaignName: "Search - Brand - AU (Max Clicks)", country: "United States" })).toBe("AU");
  });

  it("marks pre-cutover leads with no usable country as unclassified rather than guessing", () => {
    expect(leadRegion({ month: "2026-03", campaignName: "Search - Brand - AU (Max Clicks)", country: "", originalSource: "PAID_SEARCH" })).toBe("other");
    expect(leadRegion({ month: "2026-03", campaignName: "Search - Brand - AU (Max Clicks)", originalSource: "PAID_SEARCH" })).toBe("other");
  });

  it("separates pre-cutover country gaps from post-cutover campaign gaps in the notice", () => {
    const names = unclassifiedCampaigns({
      leadDetails: [
        { month: "2026-03", campaignName: "Search - Brand - AU", country: "New Zealand", originalSource: "PAID_SEARCH" },
        { month: "2026-03", campaignName: "Search - Brand - AU", country: "", originalSource: "PAID_SEARCH" },
        { month: "2026-06", campaignName: "Global - Performance Max" },
      ] as never,
      monthlyByCampaign: [],
    });
    expect(names).toEqual([
      "Global - Performance Max",
      "New Zealand (pre-May-2026 lead)",
      "Unknown country (pre-May-2026 lead)",
    ]);
  });
});

describe("HubSpot paid-search definition (pre-cutover)", () => {
  it("counts only leads whose original source is PAID_SEARCH", () => {
    expect(isHubspotPaidSearchLead("PAID_SEARCH")).toBe(true);
    expect(isHubspotPaidSearchLead("paid_search")).toBe(true);
    expect(isHubspotPaidSearchLead("DIRECT_TRAFFIC")).toBe(false);
    expect(isHubspotPaidSearchLead("OFFLINE")).toBe(false);
    expect(isHubspotPaidSearchLead("")).toBe(false);
    expect(isHubspotPaidSearchLead(undefined)).toBe(false);
  });

  it("excludes a direct-traffic lead even though it carries a gclid", () => {
    // Kimy Doan (Oct 2025) and Ray Ghamous (Jan 2026): gclid present, but
    // HubSpot's first-touch source is DIRECT_TRAFFIC, so HubSpot does not
    // count them as paid search and neither do we.
    expect(leadRegion({ month: "2025-10", campaignName: "Search - Brand - AU", country: "United States", originalSource: "DIRECT_TRAFFIC" })).toBe("other");
    expect(leadRegion({ month: "2026-01", campaignName: "Search - Brand - AU", country: "United States", originalSource: "DIRECT_TRAFFIC" })).toBe("other");
  });

  it("excludes pre-cutover leads with no CRM country, without falling back to IP country", () => {
    expect(leadRegion({ month: "2025-12", campaignName: "Search - Brand - AU", country: undefined, originalSource: "PAID_SEARCH" })).toBe("other");
  });

  it("still applies the paid-search rule only before the cutover", () => {
    expect(leadRegion({ month: "2026-06", campaignName: "Search - Brand - US (Max Clicks)", originalSource: "DIRECT_TRAFFIC" })).toBe("US");
  });

  it("explains non-paid pre-cutover exclusions distinctly in the notice", () => {
    expect(
      unclassifiedCampaigns({
        leadDetails: [
          { month: "2025-10", campaignName: "Search - Brand - AU", country: "United States", originalSource: "DIRECT_TRAFFIC" },
          { month: "2025-12", campaignName: "Search - Brand - AU", country: "", originalSource: "PAID_SEARCH" },
        ] as never,
        monthlyByCampaign: [],
      }),
    ).toEqual([
      "DIRECT_TRAFFIC (pre-May-2026, not paid search in HubSpot)",
      "Unknown country (pre-May-2026 lead)",
    ]);
  });
});
