import { describe, expect, it } from "vitest";
import {
  CURRENT_SECTIONS,
  LANDING_PAGES,
  ORIGINAL_SECTIONS,
  resolveLandingPage,
} from "@/lib/landing-page-sections";

/**
 * Pins the section maps to the real `data-track-section` ids of the deployed
 * pages (away-digital-team-lp), one list per layout. If the landing page's
 * sections change, the current list — and the map — must change with them.
 * The original list describes history and must not change.
 */
const ORIGINAL_SECTION_IDS = [
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

const CURRENT_SECTION_IDS = [
  "hero",
  "logostrip",
  "fit",
  "answers",
  "how",
  "tools",
  "proof",
  "concerns",
  "compare",
  "commercial",
  "faqs",
  "sectors",
  "role-scope",
  "tiers",
  "contact",
  "booking",
];

describe("landing page section map", () => {
  it("covers both market pages", () => {
    expect(Object.keys(LANDING_PAGES).sort()).toEqual(["offshore-teams-au", "offshore-teams-us"]);
  });

  it("keeps the original layout exactly as it was", () => {
    expect(ORIGINAL_SECTIONS.map((section) => section.id)).toEqual(ORIGINAL_SECTION_IDS);
    expect(ORIGINAL_SECTIONS[0].label).toBe("Outsourcing, done better");
  });

  it("lists the current layout in page order", () => {
    expect(CURRENT_SECTIONS.map((section) => section.id)).toEqual(CURRENT_SECTION_IDS);
  });

  it("uses human labels and https urls for every page", () => {
    for (const page of Object.values(LANDING_PAGES)) {
      expect(page.url).toMatch(/^https:\/\//);
      for (const section of [...CURRENT_SECTIONS, ...ORIGINAL_SECTIONS]) {
        expect(section.label).not.toMatch(/^[a-z0-9-]+$/);
      }
    }
  });

  it.each([
    ["offshore-teams-au"],
    ["ag-bpo-services-au"],
  ])("resolves %s against the chosen layout", (pageId) => {
    expect(resolveLandingPage(pageId)?.sections.map((s) => s.id)).toEqual(CURRENT_SECTION_IDS);
    expect(resolveLandingPage(pageId, "current")?.sections.map((s) => s.id)).toEqual(CURRENT_SECTION_IDS);
    expect(resolveLandingPage(pageId, "original")?.sections.map((s) => s.id)).toEqual(ORIGINAL_SECTION_IDS);
  });

  it("does not let the layout change the shared page map", () => {
    resolveLandingPage("offshore-teams-au", "original");
    expect(LANDING_PAGES["offshore-teams-au"].sections).toBe(CURRENT_SECTIONS);
  });

  it("rejects ids that are not ours", () => {
    expect(resolveLandingPage("../evil", "original")).toBeNull();
  });
});
