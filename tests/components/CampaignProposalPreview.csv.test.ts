import { describe, expect, it } from "vitest";

import {
  buildCampaignProposalCsv,
  buildImportedCampaignsFromCsv,
} from "@/lib/campaign-proposal-csv";
import { normalizeCampaignProposalKeywords } from "@/lib/campaign-proposal-normalize";

describe("CampaignProposalPreview CSV helpers", () => {
  it("exports and imports ad-group-only rows without creating fake keywords", () => {
    const csv = buildCampaignProposalCsv({
      proposedCampaigns: [
        {
          name: "Search - Engines",
          campaignType: "generic",
          channelType: "SEARCH",
          totalMonthlyVolume: 240,
          adGroups: [
            {
              name: "Diesel Engines",
              theme: "Diesel Engines",
              keywords: [],
              totalMonthlyVolume: 240,
              landingPage: {
                url: "https://example.com/diesel-engines",
                status: "exists",
              },
              sourcePageUrl: null,
            },
          ],
        },
      ],
    });

    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Monthly Searches");
    expect(lines[1]).toBe(
      "Search - Engines,Diesel Engines,,240,https://example.com/diesel-engines,,,,,,,No,exists",
    );

    const importedCampaigns = buildImportedCampaignsFromCsv(csv);

    expect(importedCampaigns).toHaveLength(1);
    expect(importedCampaigns[0].name).toBe("Search - Engines");
    expect(importedCampaigns[0].totalMonthlyVolume).toBe(240);
    expect(importedCampaigns[0].adGroups).toHaveLength(1);
    expect(importedCampaigns[0].adGroups[0]).toMatchObject({
      name: "Diesel Engines",
      totalMonthlyVolume: 240,
      landingPage: {
        url: "https://example.com/diesel-engines",
        status: "exists",
      },
      keywords: [],
    });
  });

  it("persists Growth Tools topKeywords into ad group keywords and exports keyword rows", () => {
    const rawGrowthToolsProposal = {
      proposedCampaigns: [
        {
          name: "Generic - Pump Types",
          campaignType: "generic",
          channelType: "SEARCH",
          adGroups: [
            {
              name: "Centrifugal Pumps",
              theme: "Centrifugal Pumps",
              topKeywords: [
                { text: "centrifugal pump", volume: 1900, competition: "HIGH" },
                { text: "centrifugal pumps", monthlySearchVolume: 720, matchType: "EXACT" },
              ],
              totalMonthlyVolume: 2620,
              landingPage: {
                url: "https://example.com/centrifugal-pumps",
                status: "exists",
              },
            },
          ],
        },
      ],
    };
    const proposal = normalizeCampaignProposalKeywords(rawGrowthToolsProposal);

    expect(proposal.proposedCampaigns[0].adGroups[0].keywords).toEqual([
      expect.objectContaining({ text: "centrifugal pump", monthlySearchVolume: 1900 }),
      expect.objectContaining({ text: "centrifugal pumps", monthlySearchVolume: 720, matchType: "EXACT" }),
    ]);

    const csv = buildCampaignProposalCsv(rawGrowthToolsProposal);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(
      "Generic - Pump Types,Centrifugal Pumps,centrifugal pump,1900,https://example.com/centrifugal-pumps,,,,,,,No,exists",
    );
    expect(lines[2]).toBe(
      "Generic - Pump Types,Centrifugal Pumps,centrifugal pumps,720,https://example.com/centrifugal-pumps,,,,,,,No,exists",
    );
  });
});
