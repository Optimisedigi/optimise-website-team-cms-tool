import { describe, expect, it } from "vitest";
import { compareBodies, extractBodies, type DraftBody } from "../scripts/verify-draft-byte-identity";

const body = (surface: string, accountKey: string, sha: string): DraftBody => ({
  surface,
  index: 1,
  accountKey,
  bytes: 100,
  sha,
});

describe("account-keyed Gmail draft parity", () => {
  it("reports UTF-8 byte counts for non-ASCII email bodies", () => {
    const bodies = extractBodies(`
      <section class="case">
        <span class="tag individual"></span>
        <h3>Prompt #1</h3>
        <div class="kv">Alpha &middot; <code>draft</code></div>
        <iframe srcdoc="Café" loading="lazy"></iframe>
      </section>
    `);

    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.bytes).toBe(Buffer.byteLength("Café", "utf8"));
  });

  it("compares the same account across surfaces without conflating portfolio accounts", () => {
    const result = compareBodies([
      body("individual", "Alpha - Google Ads Weekly Report", "alpha"),
      body("selected", "Alpha - Google Ads Weekly Report", "alpha"),
      body("selected", "Bravo - Google Ads Weekly Report", "bravo"),
      body("portfolio", "Alpha - Google Ads Weekly Report", "alpha"),
      body("portfolio", "Bravo - Google Ads Weekly Report", "bravo"),
    ]);

    expect(result.failures).toEqual([]);
    expect(result.comparisons).toContainEqual(expect.stringContaining("Alpha - Google Ads Weekly Report: IDENTICAL"));
    expect(result.comparisons).toContainEqual(expect.stringContaining("Bravo - Google Ads Weekly Report: IDENTICAL"));
  });

  it("reports only the mismatching account body", () => {
    const result = compareBodies([
      body("individual", "Alpha - Google Ads Monthly Report", "one"),
      body("selected", "Alpha - Google Ads Monthly Report", "two"),
      body("portfolio", "Alpha - Google Ads Monthly Report", "two"),
    ]);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("Alpha - Google Ads Monthly Report");
  });
});
