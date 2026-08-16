import { describe, expect, it } from "vitest";
import { LANDING_PAGES } from "@/lib/landing-page-sections";

/**
 * Pins the section map to the real `data-track-section` ids of the deployed
 * market pages (away-digital-team-lp). If the landing page's sections change,
 * this list — and the map — must change with them.
 */
const REAL_SECTION_IDS = [
  "hero",
  "logostrip",
  "compare",
  "concerns",
  "how",
  "tools",
  "sectors",
  "why-vietnam",
  "detail",
  "approach",
  "proof",
  "faqs",
  "contact",
  "booking",
];

describe("landing page section map", () => {
  it("covers both market pages", () => {
    expect(Object.keys(LANDING_PAGES).sort()).toEqual(["offshore-teams-au", "offshore-teams-us"]);
  });

  it("matches the real page order for every page", () => {
    for (const page of Object.values(LANDING_PAGES)) {
      expect(page.sections.map((section) => section.id)).toEqual(REAL_SECTION_IDS);
      expect(page.url).toMatch(/^https:\/\//);
      // Every label is human text, not a raw id.
      for (const section of page.sections) expect(section.label).not.toMatch(/^[a-z0-9-]+$/);
    }
  });
});
