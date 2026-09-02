import { describe, expect, it } from "vitest";
import { findSimilarClients, toClientSlug, validateStagedClient } from "@/lib/agents/adminmate/tools";

const existing = [
  { id: "1", name: "Acme Corp", slug: "acme-corp", websiteUrl: "https://www.acmecorp.com" },
  { id: "2", name: "Beta Widgets", slug: "beta-widgets" },
];

describe("validateStagedClient", () => {
  it("normalises a full staged client", () => {
    expect(validateStagedClient({
      name: "  Acme Corp  ",
      websiteUrl: "acmecorp.com",
      services: ["seo", "google_ads", "seo"],
      contactName: "Jane Doe",
      contactEmail: "jane@acme.com",
      contactPhone: "0400 000 000",
      clientType: "recurring",
      monthlyRetainer: "2000",
      setupFee: "1500",
      notes: "  VIP — invoice via accounts@  ",
    })).toEqual({
      name: "Acme Corp",
      slug: "acme-corp",
      tradingName: undefined,
      websiteUrl: "https://acmecorp.com",
      services: ["seo", "google_ads"],
      contactName: "Jane Doe",
      contactEmail: "jane@acme.com",
      contactPhone: "0400 000 000",
      clientType: "recurring",
      monthlyRetainer: 2000,
      setupFee: 1500,
      isActive: true,
      notes: "VIP — invoice via accounts@",
    });
  });

  it("derives slugs from awkward names", () => {
    expect(toClientSlug("Ötzi's Café & Co!")).toBe("otzi-s-cafe-co");
    expect(validateStagedClient({ name: "Smith & Sons" }).slug).toBe("smith-sons");
  });

  it("drops fields outside the allowlist", () => {
    const staged = validateStagedClient({
      name: "Acme",
      clientPin: "1234",
      ga4RefreshToken: "secret",
      googleAdsCustomerId: "123-456-7890",
      isAgency: true,
    }) as Record<string, unknown>;
    expect(Object.keys(staged)).not.toContain("clientPin");
    expect(Object.keys(staged)).not.toContain("ga4RefreshToken");
    expect(Object.keys(staged)).not.toContain("googleAdsCustomerId");
    expect(Object.keys(staged)).not.toContain("isAgency");
  });

  it("rejects invalid values", () => {
    expect(() => validateStagedClient({})).toThrow(/name is required/);
    expect(() => validateStagedClient({ name: "Acme", slug: "Not A Slug" })).toThrow(/slug/);
    expect(() => validateStagedClient({ name: "Acme", services: ["hacking"] })).toThrow(/service/);
    expect(() => validateStagedClient({ name: "Acme", clientType: "free" })).toThrow(/clientType/);
    expect(() => validateStagedClient({ name: "Acme", contactEmail: "nope" })).toThrow(/email/);
    expect(() => validateStagedClient({ name: "Acme", monthlyRetainer: -5 })).toThrow(/monthlyRetainer/);
    expect(() => validateStagedClient({ name: "Acme", setupFee: -5 })).toThrow(/setupFee/);
    expect(() => validateStagedClient({ name: "Acme", websiteUrl: "javascript:alert(1)" })).toThrow(/websiteUrl/);
  });

  it("keeps a one-off setup fee off the retainer", () => {
    expect(validateStagedClient({ name: "Acme", setupFee: 2500 })).toMatchObject({
      name: "Acme",
      setupFee: 2500,
    });
    expect(validateStagedClient({ name: "Acme", setupFee: 2500 }).monthlyRetainer).toBeUndefined();
    expect(validateStagedClient({ name: "Acme", monthlyRetainer: 2000, setupFee: 1500 })).toMatchObject({
      monthlyRetainer: 2000,
      setupFee: 1500,
    });
  });
});

describe("findSimilarClients", () => {
  it("matches on slug, host and name overlap", () => {
    expect(findSimilarClients({ slug: "acme-corp" }, existing).map((c) => c.id)).toEqual(["1"]);
    expect(findSimilarClients({ websiteUrl: "http://acmecorp.com/pricing" }, existing).map((c) => c.id)).toEqual(["1"]);
    expect(findSimilarClients({ name: "acme" }, existing).map((c) => c.id)).toEqual(["1"]);
    expect(findSimilarClients({ name: "Gamma Pty Ltd" }, existing)).toEqual([]);
  });
});
