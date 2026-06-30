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
      { text: "bad fit", matchType: "PHRASE", exclusion: "none" },
      { text: "competitor name", matchType: "EXACT", exclusion: "competitor" },
      { text: "own brand", matchType: "BROAD", exclusion: "brand" },
      { text: "cheap maybe", matchType: "PHRASE", exclusion: "low_relevancy" },
    ]);
    expect(keywords.map((keyword) => keyword.text)).not.toContain("relevant service");
  });
});
