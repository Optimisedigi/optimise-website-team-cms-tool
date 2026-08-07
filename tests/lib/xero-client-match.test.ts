import { describe, expect, it } from "vitest";
import {
  indexClientsByName,
  matchClientByName,
  normaliseClientName,
  type MatchableClient,
} from "@/lib/xero-client-match";

const client = (
  name: string,
  tradingName: string | null = null,
): MatchableClient => ({ id: name, name, tradingName });

describe("normaliseClientName", () => {
  it("strips case, punctuation and entity suffixes", () => {
    expect(normaliseClientName("Acme Pty Ltd")).toBe("acme");
    expect(normaliseClientName("ACME.")).toBe("acme");
    expect(normaliseClientName("A-C-M-E Limited")).toBe("acme");
  });
});

describe("indexClientsByName", () => {
  it("indexes both name and tradingName, with name winning on collision", () => {
    const a = client("Cipher Health", "Cipher");
    const b = client("Cipher");
    const map = indexClientsByName([a, b]);
    expect(map.get("cipherhealth")).toBe(a);
    expect(map.get("cipher")).toBe(b);
  });

  it("skips blank names", () => {
    const map = indexClientsByName([client("Away Digital Teams", "")]);
    expect(map.size).toBe(1);
    expect(map.get("awaydigitalteams")?.name).toBe("Away Digital Teams");
  });
});

describe("matchClientByName", () => {
  it("matches exactly", () => {
    const map = indexClientsByName([client("Away Digital Teams")]);
    expect(matchClientByName(map, "Away Digital Teams")?.name).toBe(
      "Away Digital Teams",
    );
  });

  it("matches despite case and entity-suffix differences", () => {
    const map = indexClientsByName([client("EPG engines")]);
    expect(matchClientByName(map, "EPG Engines Pty Ltd")?.name).toBe("EPG engines");
  });

  // Regression: real production data — CMS stores "Berendsen", Xero bills
  // "Berendsen Fluid Power", and a separate client is "Custom Fluid Power".
  it("matches a CMS short name against the full Xero entity name", () => {
    const map = indexClientsByName([client("Berendsen"), client("Custom Fluid Power")]);
    expect(matchClientByName(map, "Berendsen Fluid Power")?.name).toBe("Berendsen");
  });

  it("does not confuse two clients sharing a trailing phrase", () => {
    const map = indexClientsByName([client("Berendsen"), client("Custom Fluid Power")]);
    expect(matchClientByName(map, "Custom Fluid Power")?.name).toBe(
      "Custom Fluid Power",
    );
  });

  it("refuses an ambiguous prefix match rather than guessing", () => {
    const map = indexClientsByName([client("Acme North"), client("Acme South")]);
    // Both clients extend "Acme" — attributing either one's retainer would be a
    // coin flip, so we leave it unmatched.
    expect(matchClientByName(map, "Acme")).toBeNull();
  });

  it("still resolves an unambiguous longer contact name", () => {
    const map = indexClientsByName([client("Acme North"), client("Acme South")]);
    expect(matchClientByName(map, "Acme North Pty Ltd")?.name).toBe("Acme North");
  });

  it("ignores junk short trading names as prefixes", () => {
    // Real data: one client has tradingName "a".
    const map = indexClientsByName([client("Malcolm Thompson Pumps", "a")]);
    expect(matchClientByName(map, "Anything At All")).toBeNull();
  });

  it("returns null for an unknown contact", () => {
    const map = indexClientsByName([client("Acme")]);
    expect(matchClientByName(map, "Totally Unrelated")).toBeNull();
    expect(matchClientByName(map, "")).toBeNull();
  });
});
