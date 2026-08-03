import { describe, expect, it } from "vitest";
import { campaignRegion, supportsRegionSplit } from "@/components/dashboards/googleads/HubSpotPostClickTab";

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
    expect(supportsRegionSplit({ slug: "away-digital", customerId: "1111111111" })).toBe(true);
    expect(supportsRegionSplit({ slug: "other-client", customerId: "3425353766" })).toBe(true);
    expect(supportsRegionSplit({ slug: "other-client", customerId: "342-535-3766" })).toBe(true);
  });

  it("disables the region toggle for every other client", () => {
    expect(supportsRegionSplit({ slug: "other-client", customerId: "1111111111" })).toBe(false);
    expect(supportsRegionSplit({ slug: "", customerId: "" })).toBe(false);
  });
});
