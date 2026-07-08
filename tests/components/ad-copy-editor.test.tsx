import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdCopyEditor from "../../src/components/AdCopyEditor";

const payloadUiMock = vi.hoisted(() => ({
  fields: {} as Record<string, { value: unknown }>,
}));

vi.mock("@payloadcms/ui", () => ({
  useDocumentInfo: () => ({ id: "123" }),
  useAllFormFields: () => [payloadUiMock.fields],
}));

describe("AdCopyEditor", () => {
  it("replaces the empty state when generated ad copy arrives after regeneration", async () => {
    payloadUiMock.fields = {
      generatedAdCopy: { value: undefined },
      campaignProposal: { value: { proposedCampaigns: [] } },
    };

    const { rerender } = render(<AdCopyEditor />);

    expect(screen.getByText(/No ad copy generated yet/i)).toBeInTheDocument();

    payloadUiMock.fields = {
      generatedAdCopy: {
        value: JSON.stringify({
          "Campaign A": {
            "Ad Group A": {
              headlines: ["Fast Google Ads"],
              descriptions: ["Get better leads from search ads."],
            },
          },
        }),
      },
      campaignProposal: {
        value: {
          proposedCampaigns: [
            {
              name: "Campaign A",
              adGroups: [{ name: "Ad Group A", landingPage: { url: "https://example.com" } }],
            },
          ],
        },
      },
    };

    rerender(<AdCopyEditor />);

    expect(await screen.findByText("Campaign A")).toBeInTheDocument();
    expect(screen.getByText("Ad Group A")).toBeInTheDocument();
    expect(screen.queryByText(/No ad copy generated yet/i)).not.toBeInTheDocument();
  });
});
