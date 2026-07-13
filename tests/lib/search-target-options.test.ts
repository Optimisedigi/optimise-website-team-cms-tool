import { describe, expect, it } from "vitest";
import {
  GOOGLE_SEARCH_LANGUAGE_OPTIONS,
  SEARCH_LOCATION_OPTIONS,
  isSearchLanguage,
  normalizeSearchLocation,
} from "@/lib/search-target-options";

describe("search target options", () => {
  it.each(["Vietnam", "Viet Nam", "VN", "vn"])("normalizes %s to vn", (value) => {
    expect(normalizeSearchLocation(value)).toBe("vn");
  });

  it("retains recognized canonical city targets", () => {
    expect(normalizeSearchLocation("AU:SYDNEY")).toBe("au:sydney");
    expect(normalizeSearchLocation("VN:ho-chi-minh")).toBe("vn:ho-chi-minh");
  });

  it("rejects unknown locations instead of retaining provider input", () => {
    expect(normalizeSearchLocation("Atlantis")).toBeUndefined();
  });

  it("offers Vietnam as a searchable canonical country option", () => {
    expect(SEARCH_LOCATION_OPTIONS).toContainEqual({ label: "Vietnam", value: "vn" });
  });

  it("offers official Google Vietnamese and English language overrides", () => {
    expect(GOOGLE_SEARCH_LANGUAGE_OPTIONS).toEqual(expect.arrayContaining([
      { label: "Vietnamese", value: "vi" },
      { label: "English", value: "en" },
    ]));
    expect(isSearchLanguage("vi")).toBe(true);
    expect(isSearchLanguage("xx")).toBe(false);
  });
});
