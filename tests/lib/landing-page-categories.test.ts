import { describe, expect, it } from "vitest";
import { landingPageCategory, landingPageMarket } from "@/lib/landing-page-categories";

describe("landingPageCategory", () => {
  it("reads the sector out of the build's category campaigns", () => {
    expect(landingPageCategory("Category – Developer/IT – AU – Exact")).toBe("it");
    expect(landingPageCategory("Category – Marketing/Graphics – US – Exact")).toBe("marketing");
    expect(landingPageCategory("Category – Finance – AU – Exact")).toBe("finance-admin");
    expect(landingPageCategory("Category – Admin/Data Entry – US – Exact")).toBe("finance-admin");
  });

  it("files anything that is not a category campaign as generic", () => {
    expect(landingPageCategory("Vietnam Outsourcing – AU – Phrase")).toBe("generic");
    expect(landingPageCategory("Brand – US")).toBe("generic");
    expect(landingPageCategory(undefined)).toBe("generic");
    expect(landingPageCategory("")).toBe("generic");
    // A generic campaign naming a sector word must not be pulled into that
    // sector: only the build's own `Category –` campaigns declare one.
    expect(landingPageCategory("Vietnam Marketing – AU – Exact")).toBe("generic");
  });
});

describe("landingPageMarket", () => {
  it("prefers the manifest value and falls back to the slug suffix", () => {
    expect(landingPageMarket("US", "ag-data-engineer-vietnam-au")).toBe("US");
    expect(landingPageMarket(undefined, "ag-data-engineer-vietnam-au")).toBe("AU");
    expect(landingPageMarket("", "offshore-teams-us")).toBe("US");
    expect(landingPageMarket("  au  ", "whatever")).toBe("AU");
  });

  it("returns null when nothing declares a market", () => {
    expect(landingPageMarket(undefined, "legacy-page")).toBeNull();
    expect(landingPageMarket("EU", "legacy-page")).toBeNull();
  });
});
