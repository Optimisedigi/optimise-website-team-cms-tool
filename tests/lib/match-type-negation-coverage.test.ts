import { describe, it, expect } from "vitest";
import {
  nklAppliesToViolation,
  findCoveringNegative,
  isTermCoveredByCampaignNegatives,
  type CoverageNkl,
} from "@/lib/match-type-negation-coverage";

describe("nklAppliesToViolation", () => {
  it("account-scope lists apply to every campaign", () => {
    const nkl: CoverageNkl = { scope: "account", campaignRegex: null };
    expect(nklAppliesToViolation(nkl, { campaignName: "Anything" })).toBe(true);
  });

  it("campaign-scope applies only when the regex matches the campaign", () => {
    const nkl: CoverageNkl = { scope: "campaign", campaignRegex: "Brand" };
    expect(nklAppliesToViolation(nkl, { campaignName: "AU - Brand - Search" })).toBe(true);
    expect(nklAppliesToViolation(nkl, { campaignName: "AU - Generic - Search" })).toBe(false);
  });

  it("campaign-scope with a blank regex is not auto-attached, so covers nothing", () => {
    const nkl: CoverageNkl = { scope: "campaign", campaignRegex: "" };
    expect(nklAppliesToViolation(nkl, { campaignName: "Brand" })).toBe(false);
  });

  it("ad_group-scope matches an exact ad group name", () => {
    const nkl: CoverageNkl = { scope: "ad_group", adGroupName: "Shoes" };
    expect(
      nklAppliesToViolation(nkl, { campaignName: "C", adGroupName: "shoes" }),
    ).toBe(true);
    expect(
      nklAppliesToViolation(nkl, { campaignName: "C", adGroupName: "Boots" }),
    ).toBe(false);
  });

  it("ad_group-scope also matches via campaignRegex on the campaign name", () => {
    const nkl: CoverageNkl = { scope: "ad_group", adGroupName: "", campaignRegex: "Brand" };
    expect(
      nklAppliesToViolation(nkl, { campaignName: "AU Brand", adGroupName: "x" }),
    ).toBe(true);
  });

  it("inactive lists never apply", () => {
    const nkl: CoverageNkl = { scope: "account", isActive: false };
    expect(nklAppliesToViolation(nkl, { campaignName: "x" })).toBe(false);
  });
});

describe("findCoveringNegative", () => {
  const ctx = { campaignName: "AU - Brand - Search", adGroupName: "Shoes" };

  it("honours a phrase negative in an applicable campaign list", () => {
    const nkls: CoverageNkl[] = [
      {
        name: "Brand negatives",
        scope: "campaign",
        campaignRegex: "Brand",
        keywords: [{ keyword: "cheap", matchType: "phrase" }],
      },
    ];
    const match = findCoveringNegative("cheap running shoes", ctx, nkls);
    expect(match?.keyword).toBe("cheap");
    expect(match?.matchType).toBe("phrase");
    expect(match?.listName).toBe("Brand negatives");
  });

  it("suppresses a phrase-negative match with leading words", () => {
    const nkls: CoverageNkl[] = [
      {
        scope: "campaign",
        campaignRegex: "Brand",
        keywords: [{ keyword: "temp agency", matchType: "phrase" }],
      },
    ];
    expect(isTermCoveredByCampaignNegatives("it temp agency", ctx, nkls)).toBe(true);
  });

  it("does not treat reversed phrase words as a phrase-negative match", () => {
    const nkls: CoverageNkl[] = [
      {
        scope: "account",
        keywords: [{ keyword: "temp agency", matchType: "phrase" }],
      },
    ];
    expect(isTermCoveredByCampaignNegatives("agency temp", ctx, nkls)).toBe(false);
  });

  it("honours a broad negative (all words, any order)", () => {
    const nkls: CoverageNkl[] = [
      {
        scope: "account",
        keywords: [{ keyword: "running shoes", matchType: "broad" }],
      },
    ];
    expect(isTermCoveredByCampaignNegatives("shoes for running", ctx, nkls)).toBe(true);
  });

  it("exact negative only covers an identical term", () => {
    const nkls: CoverageNkl[] = [
      {
        scope: "account",
        keywords: [{ keyword: "blue shoes", matchType: "exact" }],
      },
    ];
    expect(isTermCoveredByCampaignNegatives("blue shoes", ctx, nkls)).toBe(true);
    expect(isTermCoveredByCampaignNegatives("cheap blue shoes", ctx, nkls)).toBe(false);
  });

  it("ignores a negative in a list that does not route to the campaign", () => {
    const nkls: CoverageNkl[] = [
      {
        name: "Generic negatives",
        scope: "campaign",
        campaignRegex: "Generic",
        keywords: [{ keyword: "cheap", matchType: "phrase" }],
      },
    ];
    expect(isTermCoveredByCampaignNegatives("cheap shoes", ctx, nkls)).toBe(false);
  });

  it("returns null when nothing covers the term", () => {
    const nkls: CoverageNkl[] = [
      { scope: "account", keywords: [{ keyword: "boots", matchType: "phrase" }] },
    ];
    expect(findCoveringNegative("running shoes", ctx, nkls)).toBeNull();
  });
});
