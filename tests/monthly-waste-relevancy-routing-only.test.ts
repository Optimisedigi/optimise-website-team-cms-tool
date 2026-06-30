import { describe, expect, it } from "vitest";
import { collectRelevancyNegativeKeywords } from "@/lib/monthly-waste-relevancy-warmer";

describe("collectRelevancyNegativeKeywords", () => {
  it("excludes routing-only NKLs from relevancy while keeping normal, competitor, and brand lists", () => {
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
        relevancyExclusion: "routing_only",
        keywords: [{ keyword: "relevant service", matchType: "phrase" }],
      },
    ]);

    expect(keywords).toEqual([
      { text: "bad fit", matchType: "PHRASE", exclusion: "none" },
      { text: "competitor name", matchType: "EXACT", exclusion: "competitor" },
      { text: "own brand", matchType: "BROAD", exclusion: "brand" },
    ]);
    expect(keywords.map((keyword) => keyword.text)).not.toContain("relevant service");
  });
});
