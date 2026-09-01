import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPayload = {
  find: vi.fn(),
  create: vi.fn(),
};

import { resolveTargetList } from "@/lib/match-type-approve";

beforeEach(() => {
  mockPayload.find.mockReset();
  mockPayload.create.mockReset();
});

describe("resolveTargetList auto mode", () => {
  it("creates an ad-group list instead of using a matching campaign list", async () => {
    mockPayload.find.mockResolvedValue({
      docs: [
        {
          id: 23,
          scope: "campaign",
          name: "[OD] Vietnam List",
          campaignRegex: "Vietnam",
          isActive: true,
        },
      ],
    });
    mockPayload.create.mockResolvedValue({ id: 99, name: "[OD] Generic Vietnam outsourcing NKL" });

    const resolved = await resolveTargetList(mockPayload as never, {
      candidate: {
        client: 6,
        adGroupName: "Generic Vietnam outsourcing",
        campaignName: "Search - Generic - Vietnam - AU - Phrase (Manual CPC)",
      },
      routing: { mode: "auto" },
    });

    expect(resolved).toEqual({ listId: 99, created: true });
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: "ad_group",
          adGroupName: "Generic Vietnam outsourcing",
          source: "match_type",
        }),
      }),
    );
  });
});
