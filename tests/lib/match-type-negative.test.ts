import { describe, expect, it } from "vitest";
import {
  buildNegativeFromViolation,
  wouldNegateKeyword,
} from "@/lib/match-type-negative";

describe("buildNegativeFromViolation", () => {
  it("adds a phrase negative for exact close variants", () => {
    const neg = buildNegativeFromViolation({
      searchTerm: "Pay Per Click Management",
      triggeringKeyword: "ppc services",
      violationType: "exact_close_variant",
    });
    expect(neg.matchType).toBe("phrase");
    expect(neg.keyword).toBe("pay per click management");
  });

  it("keeps a phrase negative when the search term adds a word to the keyword", () => {
    // Added-word drift: the phrase negative is longer than the keyword, so it
    // cannot match the shorter keyword query — safe to use phrase.
    const neg = buildNegativeFromViolation({
      searchTerm: "emergency plumber sydney",
      triggeringKeyword: "plumber sydney",
      violationType: "exact_close_variant",
    });
    expect(neg.matchType).toBe("phrase");
  });

  it("adds a phrase negative for phrase missing-word violations", () => {
    const neg = buildNegativeFromViolation({
      searchTerm: "buy shoes online",
      triggeringKeyword: "running shoes",
      violationType: "phrase_missing_word",
    });
    expect(neg.matchType).toBe("phrase");
    expect(neg.keyword).toBe("buy shoes online");
  });

  it("downgrades to exact when the negative is a contiguous run inside the keyword", () => {
    // Removed-word drift: a phrase negative "plumber" would also block the
    // keyword query "plumber sydney", so it falls back to an exact negative.
    const neg = buildNegativeFromViolation({
      searchTerm: "plumber",
      triggeringKeyword: "plumber sydney",
      violationType: "exact_close_variant",
    });
    expect(neg.matchType).toBe("exact");
  });

  it("honours a recommended phrase negative on the offending word", () => {
    const neg = buildNegativeFromViolation({
      searchTerm: "seo agency",
      triggeringKeyword: "google agency",
      violationType: "exact_close_variant",
      recommendedKeyword: "seo",
      recommendedMatchType: "phrase",
      nearestKeyword: "google agency",
    });
    expect(neg.matchType).toBe("phrase");
    expect(neg.keyword).toBe("seo");
  });

  it("honours a recommended exact negative on the whole term", () => {
    const neg = buildNegativeFromViolation({
      searchTerm: "ads agency",
      triggeringKeyword: "google ads management agency",
      violationType: "exact_close_variant",
      recommendedKeyword: "ads agency",
      recommendedMatchType: "exact",
      nearestKeyword: "google ads management agency",
    });
    expect(neg.matchType).toBe("exact");
    expect(neg.keyword).toBe("ads agency");
  });

  it("downgrades a recommended phrase negative that would swallow the owned exact keyword", () => {
    // The recommended phrase "agency" sits inside the owned keyword "seo agency",
    // so it must fall back to an exact negative to keep the keyword serving.
    const neg = buildNegativeFromViolation({
      searchTerm: "agency",
      triggeringKeyword: "seo agency",
      violationType: "exact_close_variant",
      recommendedKeyword: "agency",
      recommendedMatchType: "phrase",
      nearestKeyword: "seo agency",
    });
    expect(neg.matchType).toBe("exact");
    expect(neg.keyword).toBe("agency");
  });

  it("falls back to legacy behaviour when no recommendation is stored", () => {
    const neg = buildNegativeFromViolation({
      searchTerm: "emergency plumber sydney",
      triggeringKeyword: "plumber sydney",
      violationType: "exact_close_variant",
    });
    expect(neg.matchType).toBe("phrase");
    expect(neg.keyword).toBe("emergency plumber sydney");
  });

  it("normalises whitespace and casing on the keyword", () => {
    const neg = buildNegativeFromViolation({
      searchTerm: "  Premium   Widgets  ",
      triggeringKeyword: "gadgets",
      violationType: "exact_close_variant",
    });
    expect(neg.keyword).toBe("premium widgets");
  });
});

describe("wouldNegateKeyword", () => {
  it("exact negative blocks the keyword only when identical", () => {
    expect(wouldNegateKeyword("plumber sydney", "exact", "plumber sydney")).toBe(true);
    expect(wouldNegateKeyword("plumber perth", "exact", "plumber sydney")).toBe(false);
  });

  it("phrase negative blocks the keyword only when the negative sits inside it", () => {
    // Negative is a contiguous run inside the keyword → blocks the keyword query.
    expect(wouldNegateKeyword("plumber", "phrase", "plumber sydney")).toBe(true);
    // Negative adds words to the keyword → cannot match the shorter keyword query.
    expect(wouldNegateKeyword("cheap running shoes", "phrase", "running shoes")).toBe(false);
    // Unrelated negative → no block.
    expect(wouldNegateKeyword("buy shoes online", "phrase", "running shoes")).toBe(false);
  });
});
