import { describe, expect, it } from "vitest";
import { resolveSourceAdGroup } from "@/lib/match-type-exact-negate";

const GROUPS = [
  {
    adGroupId: "10",
    adGroupName: "Offshore Outsourcing",
    campaignName: "Search - Generic - Outsourcing - US - Phrase (Manual CPC)",
    status: "ENABLED",
  },
  {
    adGroupId: "11",
    adGroupName: "Offshore Outsourcing",
    campaignName: "Search - Generic - Outsourcing - AU - Phrase (Manual CPC)",
    status: "ENABLED",
  },
  {
    adGroupId: "12",
    adGroupName: "Offshore Outsourcing",
    campaignName: "Search - Generic - Outsourcing - US - Exact (Manual CPC)",
    status: "ENABLED",
  },
];

describe("resolveSourceAdGroup", () => {
  it("picks the phrase campaign that triggered the violation, not the exact copy", () => {
    const source = resolveSourceAdGroup(GROUPS, {
      adGroupName: "Offshore Outsourcing",
      campaignName: "Search - Generic - Outsourcing - US - Phrase (Manual CPC)",
    });
    expect(source?.adGroupId).toBe("10");
  });

  it("returns null when the ad group is missing", () => {
    expect(
      resolveSourceAdGroup(GROUPS, { adGroupName: "No Such Group", campaignName: "Search - Generic" }),
    ).toBeNull();
  });
});
