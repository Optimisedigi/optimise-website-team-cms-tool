import { describe, expect, it } from "vitest";

import {
  copySeed,
  pickGreeting,
  pickVariant,
} from "@/lib/agents/optimate-google-ads/tools/_email-copy-variants";
import { CLIENT_EMAIL_COPY_SLOTS } from "@/lib/agents/optimate-google-ads/tools/_email-copy-slots";

const FOUR = ["a", "b", "c", "d"] as const;

describe("email copy variants", () => {
  it("returns the same variant for the same seed and slot", () => {
    const seed = copySeed("Berendsen", "123-456-7890", "2026-07-12", 4);
    expect(pickVariant(FOUR, seed, "weekly-budget-under")).toBe(
      pickVariant(FOUR, seed, "weekly-budget-under"),
    );
    expect(pickGreeting(seed)).toBe(pickGreeting(seed));
    expect(CLIENT_EMAIL_COPY_SLOTS.greeting.defaults).toContain(pickGreeting(seed));
  });

  it("ignores casing and surrounding whitespace when seeding", () => {
    expect(copySeed("  Berendsen ", "ABC")).toBe(copySeed("berendsen", "abc"));
  });

  it("decorrelates slots so different sentences do not move together", () => {
    // Plain FNV-1a without a finaliser leaves the low bits correlated, which made
    // every 4-variant list resolve to the same index and reintroduced duplicate
    // drafts. Two independent slots should agree at roughly chance (25%).
    let agreements = 0;
    const samples = 5000;
    for (let seed = 0; seed < samples; seed += 1) {
      if (
        pickVariant(FOUR, seed, "weekly-performance-up-efficient") ===
        pickVariant(FOUR, seed, "weekly-budget-under")
      ) {
        agreements += 1;
      }
    }
    const rate = agreements / samples;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.35);
  });

  it("gives a batch of accounts distinct copy signatures", () => {
    const signatures = ["Alpha Co", "Bravo Co", "Charlie Co", "Delta Co", "Echo Co"].map(
      (name, index) => {
        const seed = copySeed(name, `10${index}-000-0000`, "2026-07-12", 4);
        return [
          pickGreeting(seed),
          pickVariant(FOUR, seed, "weekly-performance-up-efficient"),
          pickVariant(FOUR, seed, "weekly-budget-under"),
        ].join("/");
      },
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
