/**
 * generateContractSections \u2014 Annual Review tier-table toggle.
 *
 * Covers the new `annualReviewTierTableEnabled` field: nested toggle inside
 * the Annual Review section that hides JUST the tier table while keeping
 * the surrounding intro, notice, good-faith review, and acceptance
 * paragraphs.
 *
 * Back-compat: undefined defaults to TRUE so existing contracts (and any
 * caller that hasn't been updated) keep the table.
 */

import { describe, it, expect } from "vitest";
import {
  generateContractSections,
  type ContractData,
  type ContractSection,
} from "@/lib/contract-template";

const baseAnnualReviewData = (): ContractData => ({
  contractTitle: "Test Contract",
  clientName: "Acme Corp",
  clientEmail: "test@acme.com",
  effectiveDate: "2026-06-01",
  agencyName: "Optimise Digital",
  monthlyRetainer: 5000,
  // Annual Review enabled with all five sub-fields populated so the absence
  // of the tier table is the only signal under test.
  annualReviewEnabled: true,
  annualReviewIntro: "Intro paragraph about tiers.",
  annualReviewTierTableText: "Spend\tRetainer\nUp to $60,000\t$4,800",
  annualReviewNotice: "60 day notice paragraph.",
  annualReviewGoodFaithReview: "Good faith review paragraph.",
  annualReviewAcceptance: "Acceptance paragraph.",
});

function findTierTableSection(sections: ContractSection[]): ContractSection | undefined {
  return sections.find((s) => s.type === "tierTable");
}

function findAnnualReviewHeading(sections: ContractSection[]): ContractSection | undefined {
  return sections.find(
    (s) => s.type === "heading" && s.heading === "Annual Review and Adjustment",
  );
}

describe("generateContractSections \u2014 annual review tier-table toggle", () => {
  it("includes the tier table when the toggle is omitted (back-compat default ON)", () => {
    const data = baseAnnualReviewData();
    // Deliberately leave annualReviewTierTableEnabled undefined.
    const sections = generateContractSections(data);
    expect(findAnnualReviewHeading(sections)).toBeDefined();
    expect(findTierTableSection(sections)).toBeDefined();
  });

  it("includes the tier table when the toggle is explicitly TRUE", () => {
    const data = { ...baseAnnualReviewData(), annualReviewTierTableEnabled: true };
    const sections = generateContractSections(data);
    expect(findTierTableSection(sections)).toBeDefined();
  });

  it("hides the tier table when the toggle is FALSE", () => {
    const data = { ...baseAnnualReviewData(), annualReviewTierTableEnabled: false };
    const sections = generateContractSections(data);
    expect(findTierTableSection(sections)).toBeUndefined();
  });

  it("keeps the intro, notice, good-faith, and acceptance paragraphs when only the table is hidden", () => {
    const data = { ...baseAnnualReviewData(), annualReviewTierTableEnabled: false };
    const sections = generateContractSections(data);
    // Annual Review heading is still there.
    expect(findAnnualReviewHeading(sections)).toBeDefined();
    // Each rich-text paragraph still renders. We match by content snippet
    // since the section type is "richtext" for all four.
    const richTextContents = sections
      .filter((s) => s.type === "richtext")
      .map((s) => s.content ?? "");
    expect(richTextContents.some((c) => c.includes("Intro paragraph about tiers"))).toBe(true);
    expect(richTextContents.some((c) => c.includes("60 day notice paragraph"))).toBe(true);
    expect(richTextContents.some((c) => c.includes("Good faith review paragraph"))).toBe(true);
    expect(richTextContents.some((c) => c.includes("Acceptance paragraph"))).toBe(true);
  });

  it("the section toggle (annualReviewEnabled=false) still hides EVERYTHING regardless of the nested toggle", () => {
    const data = {
      ...baseAnnualReviewData(),
      annualReviewEnabled: false,
      annualReviewTierTableEnabled: true,
    };
    const sections = generateContractSections(data);
    expect(findAnnualReviewHeading(sections)).toBeUndefined();
    expect(findTierTableSection(sections)).toBeUndefined();
  });

  it("hiding the tier table does not affect ANY other section in the contract", () => {
    const withTable = generateContractSections(baseAnnualReviewData());
    const withoutTable = generateContractSections({
      ...baseAnnualReviewData(),
      annualReviewTierTableEnabled: false,
    });
    // Same set of section types EXCEPT one fewer tierTable entry.
    const tierTablesWith = withTable.filter((s) => s.type === "tierTable").length;
    const tierTablesWithout = withoutTable.filter((s) => s.type === "tierTable").length;
    expect(tierTablesWith - tierTablesWithout).toBe(1);
    // Total section count drops by exactly 1.
    expect(withTable.length - withoutTable.length).toBe(1);
  });
});
