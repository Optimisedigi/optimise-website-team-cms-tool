import { describe, expect, it } from "vitest";

import {
  buildCampaignProposalCsv,
  buildImportedCampaignsFromCsv,
} from "@/lib/campaign-proposal-csv";

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
});
