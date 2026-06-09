import { describe, expect, it } from "vitest";
import { matchesPattern, pickAdGroupList, type RoutableNkl } from "@/lib/nkl-routing";

describe("matchesPattern", () => {
  it("treats plain text as a case-insensitive substring", () => {
    expect(matchesPattern("search_Brand_nsw", "Brand")).toBe(true);
    expect(matchesPattern("search_generic_nsw", "Brand")).toBe(false);
    expect(matchesPattern("SEARCH_BRAND", "brand")).toBe(true);
  });

  it("compiles a real regex pattern", () => {
    expect(matchesPattern("brand_product", "Brand|Generic")).toBe(true);
    expect(matchesPattern("generic_product", "Brand|Generic")).toBe(true);
    expect(matchesPattern("competitor", "Brand|Generic")).toBe(false);
    expect(matchesPattern("anything", ".*")).toBe(true);
  });

  it("falls back to substring containment on an invalid regex", () => {
    // Unbalanced bracket is an invalid regex and not plain text → substring.
    expect(matchesPattern("a [brand] b", "[brand")).toBe(true);
    expect(matchesPattern("nothing here", "[brand")).toBe(false);
  });

  it("matches everything on a blank pattern", () => {
    expect(matchesPattern("any campaign", "")).toBe(true);
    expect(matchesPattern("any campaign", null)).toBe(true);
    expect(matchesPattern("any campaign", undefined)).toBe(true);
  });
});

describe("pickAdGroupList", () => {
  const lists: RoutableNkl[] = [
    { id: 1, scope: "ad_group", adGroupName: "search_google-ads-services_exact", isActive: true },
    { id: 2, scope: "ad_group", adGroupName: "other", campaignRegex: "premium", isActive: true },
    { id: 3, scope: "campaign", campaignRegex: "google-ads-services", isActive: true },
    { id: 4, scope: "ad_group", adGroupName: "inactive", isActive: false },
  ];

  it("prefers an exact ad-group name match", () => {
    const picked = pickAdGroupList(lists, {
      adGroupName: "search_google-ads-services_exact",
      campaignName: "search_google-ads-services_nsw",
    });
    expect(picked?.id).toBe(1);
  });

  it("falls back to an ad-group regex match", () => {
    const picked = pickAdGroupList(lists, {
      adGroupName: "premium_services_group",
      campaignName: "unrelated",
    });
    expect(picked?.id).toBe(2);
    expect(matchesPattern("premium_services_group", "premium")).toBe(true);
  });

  it("falls back to a campaign regex match (shared multi-region list)", () => {
    const picked = pickAdGroupList(lists, {
      adGroupName: "no_match_here",
      campaignName: "search_google-ads-services_qld",
    });
    expect(picked?.id).toBe(3);
  });

  it("returns null when nothing matches", () => {
    const picked = pickAdGroupList(lists, {
      adGroupName: "no_match",
      campaignName: "no_match",
    });
    expect(picked).toBeNull();
  });

  it("ignores inactive lists", () => {
    const picked = pickAdGroupList(lists, { adGroupName: "inactive", campaignName: "" });
    expect(picked).toBeNull();
  });
});
