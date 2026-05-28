import { describe, it, expect } from "vitest";
import { estimateTokens, formatTokens } from "@/lib/agents/_shared/token-estimate";

describe("estimateTokens", () => {
  it("returns 0 for empty / nullish input", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it("uses the ~4-chars-per-token heuristic (rounded up)", () => {
    expect(estimateTokens("abcd")).toBe(1); // 4 chars
    expect(estimateTokens("abcde")).toBe(2); // 5 chars -> ceil(1.25)
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("scales with longer text", () => {
    const short = estimateTokens("a".repeat(40));
    const long = estimateTokens("a".repeat(4000));
    expect(long).toBeGreaterThan(short);
    expect(long).toBe(1000);
  });
});

describe("formatTokens", () => {
  it("prefixes with ≈ and pluralises", () => {
    expect(formatTokens(0)).toBe("≈0 tokens");
    expect(formatTokens(1)).toBe("≈1 token");
    expect(formatTokens(120)).toBe("≈120 tokens");
  });

  it("clamps invalid input to 0 and groups thousands", () => {
    expect(formatTokens(Number.NaN)).toBe("≈0 tokens");
    expect(formatTokens(-5)).toBe("≈0 tokens");
    expect(formatTokens(12345)).toBe("≈12,345 tokens");
  });
});
