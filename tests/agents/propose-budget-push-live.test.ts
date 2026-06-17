import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueueProposal, mockGrowthToolsGet } = vi.hoisted(() => ({
  mockQueueProposal: vi.fn(async () => 42),
  mockGrowthToolsGet: vi.fn(),
}));

vi.mock("@/lib/agents/optimate-google-ads/tools/_propose-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agents/optimate-google-ads/tools/_propose-helpers")>(
    "@/lib/agents/optimate-google-ads/tools/_propose-helpers",
  );
  return {
    ...actual,
    queueProposal: mockQueueProposal,
  };
});

vi.mock("@/lib/agents/optimate-google-ads/tools/_growth-tools", () => ({
  ensureCustomerId: (raw: unknown) => {
    if (typeof raw !== "string" || !raw.trim()) throw new Error("customerId not present on agent context");
    return raw.replace(/-/g, "");
  },
  growthToolsGet: mockGrowthToolsGet,
}));

import { proposeAllCampaignBudgetPush } from "@/lib/agents/optimate-google-ads/tools/propose-all-campaign-budget-push";
import { proposeBudgetPushLive } from "@/lib/agents/optimate-google-ads/tools/propose-budget-push-live";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_budget_push_1",
  context: { clientId: 7, auditId: 11, customerId: "659-101-3898", userId: 3 },
  log: vi.fn(),
});

const baseArgs = () => ({
  campaigns: [
    { campaignId: "23653649175", campaignName: "Made up old name", dailyBudget: 400 },
  ],
  summary: "Set the requested daily campaign budget for approval.",
  supportingNumbers: ["User requested $400 per campaign per day"],
});

beforeEach(() => {
  mockQueueProposal.mockClear();
  mockGrowthToolsGet.mockReset();
  mockGrowthToolsGet.mockResolvedValue({
    ok: true,
    data: { metrics: [{ campaignId: "23653649175", campaignName: "search_google-ads-services_vic_exact", dailyBudget: 125 }] },
  });
});

describe("propose_all_campaign_budget_push", () => {
  it("expands all campaign rows from Growth Tools rather than model-supplied names", async () => {
    mockGrowthToolsGet.mockResolvedValueOnce({
      ok: true,
      data: {
        metrics: [
          { campaignId: "23653649175", campaignName: "search_google-ads-services_vic_exact", status: "PAUSED", dailyBudget: 125 },
          { campaignId: "23659062884", campaignName: "search_google-ads-services_qld_exact", status: "ENABLED", dailyBudget: 80 },
        ],
      },
    });

    const result = await proposeAllCampaignBudgetPush.execute(
      {
        dailyBudget: 400,
        summary: "Set every campaign to the requested daily budget.",
        supportingNumbers: ["User requested $400 per campaign per day"],
      },
      baseCtx(),
    );

    expect(result.ok).toBe(true);
    expect(mockQueueProposal.mock.calls[0]?.[0].proposalPayload.campaigns).toEqual([
      { campaignId: "23653649175", campaignName: "search_google-ads-services_vic_exact", currentDailyBudget: 125, dailyBudget: 400 },
      { campaignId: "23659062884", campaignName: "search_google-ads-services_qld_exact", currentDailyBudget: 80, dailyBudget: 400 },
    ]);
    expect(mockQueueProposal.mock.calls[0]?.[0].rendered.internalMarkdown).toContain("Current daily budget");
    expect(mockQueueProposal.mock.calls[0]?.[0].rendered.internalMarkdown).toContain("$125.00/day");
    expect(mockQueueProposal.mock.calls[0]?.[0].rendered.internalMarkdown).toContain("$400.00/day");
  });

  it("can exclude paused campaigns when requested", async () => {
    mockGrowthToolsGet.mockResolvedValueOnce({
      ok: true,
      data: {
        metrics: [
          { campaignId: "23653649175", campaignName: "search_google-ads-services_vic_exact", status: "PAUSED", dailyBudget: 125 },
          { campaignId: "23659062884", campaignName: "search_google-ads-services_qld_exact", status: "ENABLED", dailyBudget: 80 },
        ],
      },
    });

    const result = await proposeAllCampaignBudgetPush.execute(
      {
        dailyBudget: 400,
        includePaused: false,
        summary: "Set every enabled campaign to the requested daily budget.",
      },
      baseCtx(),
    );

    expect(result.ok).toBe(true);
    expect(mockQueueProposal.mock.calls[0]?.[0].proposalPayload.campaigns).toEqual([
      { campaignId: "23659062884", campaignName: "search_google-ads-services_qld_exact", currentDailyBudget: 80, dailyBudget: 400 },
    ]);
  });
});

describe("propose_budget_push_live", () => {
  it("rejects campaign IDs that are not present in the linked account", async () => {
    const result = await proposeBudgetPushLive.execute(
      {
        ...baseArgs(),
        campaigns: [{ campaignId: "20948084257", campaignName: "Brand", dailyBudget: 400 }],
      },
      baseCtx(),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("were not found in the linked Google Ads account");
    expect(mockQueueProposal).not.toHaveBeenCalled();
  });

  it("uses Growth Tools campaign names in the queued proposal payload", async () => {
    const result = await proposeBudgetPushLive.execute(baseArgs(), baseCtx());

    expect(result.ok).toBe(true);
    expect(mockQueueProposal).toHaveBeenCalledTimes(1);
    expect(mockQueueProposal.mock.calls[0]?.[0].proposalPayload.campaigns).toEqual([
      { campaignId: "23653649175", campaignName: "search_google-ads-services_vic_exact", currentDailyBudget: 125, dailyBudget: 400 },
    ]);
    expect(mockQueueProposal.mock.calls[0]?.[0].rendered.internalMarkdown).toContain("Current daily budget");
    expect(mockQueueProposal.mock.calls[0]?.[0].rendered.internalMarkdown).toContain("$125.00/day");
    expect(mockQueueProposal.mock.calls[0]?.[0].rendered.internalMarkdown).toContain("$400.00/day");
  });
});
