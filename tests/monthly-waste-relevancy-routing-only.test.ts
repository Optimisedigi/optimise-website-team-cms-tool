import { describe, expect, it } from "vitest";
import { collectRelevancyNegativeKeywords } from "@/lib/monthly-waste-relevancy-warmer";

describe("collectRelevancyNegativeKeywords", () => {
  it("excludes routing-only NKLs while keeping normal, competitor, brand, and low-relevancy lists", () => {
    const keywords = collectRelevancyNegativeKeywords([
      {
        relevancyExclusion: "none",
        keywords: [{ keyword: "bad fit", matchType: "phrase" }],
      },
      {
        relevancyExclusion: "competitor",
        keywords: [{ keyword: "competitor name", matchType: "exact" }],
      },
      {
        relevancyExclusion: "brand",
        keywords: [{ keyword: "own brand", matchType: "broad" }],
      },
      {
        relevancyExclusion: "low_relevancy",
        keywords: [{ keyword: "cheap maybe", matchType: "phrase" }],
      },
      {
        relevancyExclusion: "routing_only",
        keywords: [{ keyword: "relevant service", matchType: "phrase" }],
      },
    ]);

    expect(keywords).toEqual([
      { text: "bad fit", matchType: "PHRASE", exclusion: "none", scope: "account", campaigns: [], adGroupName: null },
      { text: "competitor name", matchType: "EXACT", exclusion: "competitor", scope: "account", campaigns: [], adGroupName: null },
      { text: "own brand", matchType: "BROAD", exclusion: "brand", scope: "account", campaigns: [], adGroupName: null },
      { text: "cheap maybe", matchType: "PHRASE", exclusion: "low_relevancy", scope: "account", campaigns: [], adGroupName: null },
    ]);
    expect(keywords.map((keyword) => keyword.text)).not.toContain("relevant service");
  });

  it("preserves campaign and ad-group scope instead of merging scoped duplicates", () => {
    const keywords = collectRelevancyNegativeKeywords([
      {
        scope: "campaign",
        campaigns: [{ campaignName: "Generic" }],
        keywords: [{ keyword: "same term", matchType: "exact" }],
      },
      {
        scope: "ad_group",
        adGroupName: "Brand Ad Group",
        keywords: [{ keyword: "same term", matchType: "exact" }],
      },
    ]);

    expect(keywords).toHaveLength(2);
    expect(keywords[0]).toMatchObject({ scope: "campaign", campaigns: ["Generic"] });
    expect(keywords[1]).toMatchObject({ scope: "ad_group", adGroupName: "Brand Ad Group" });
  });
});
