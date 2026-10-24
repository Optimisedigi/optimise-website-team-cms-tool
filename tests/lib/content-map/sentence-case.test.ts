import { describe, expect, it } from "vitest";
import { sentenceCase } from "@/lib/content-map/sentence-case";

describe("sentenceCase", () => {
  it.each([
    ["What Is a Good Quality Score in Google Ads (and How Do You Fix a Bad One)?", "What is a good quality score in Google Ads (and how do you fix a bad one)?"],
    ["Meta Ads Manager Explained: Setting Up Your Ad Account and Running Instagram Ads", "Meta Ads Manager explained: Setting up your ad account and running Instagram ads"],
    ["Should You Bid on Your Own Brand Name in Google Ads?", "Should you bid on your own brand name in Google Ads?"],
    ["How ChatGPT and Perplexity Pick Sources: A GEO Guide for Sydney SEO in March", "How ChatGPT and Perplexity pick sources: A GEO guide for Sydney SEO in March"],
    ["Is PPC Worth It? What ROI to Expect From GA4 Data", "Is PPC worth it? What ROI to expect from GA4 data"],
  ])("%s", (input, expected) => {
    expect(sentenceCase(input)).toBe(expected);
    expect(sentenceCase(expected)).toBe(expected);
  });

  it("leaves mostly lower-case titles alone", () => {
    expect(sentenceCase("How much does a Developer cost in vietnam")).toBe("How much does a Developer cost in vietnam");
  });
});
