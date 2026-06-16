import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveCustomerId, mockPostGrowthTools, mockGetCampaignSnapshot } = vi.hoisted(() => ({
  mockResolveCustomerId: vi.fn(),
  mockPostGrowthTools: vi.fn(),
  mockGetCampaignSnapshot: vi.fn(),
}));

vi.mock("@/lib/agents/optimate-google-ads/apply-handlers/_helpers", () => ({
  resolveCustomerId: mockResolveCustomerId,
  postGrowthTools: mockPostGrowthTools,
  postGrowthToolsFireAndForget: vi.fn(),
  resolveClientId: vi.fn(),
  stampNegatedAt: vi.fn(),
}));

vi.mock("@/lib/google-ads-snapshots", () => ({
  getCampaignSnapshot: mockGetCampaignSnapshot,
}));

import type { ApplyHandlerContext } from "@/lib/agents/_shared/apply-dispatcher";
import { applyAdGroupPause } from "@/lib/agents/optimate-google-ads/apply-handlers/ad-group-pause";
import { applyKeywordPause } from "@/lib/agents/optimate-google-ads/apply-handlers/keyword-pause";
import { applyCampaignTargetCpaUpdate } from "@/lib/agents/optimate-google-ads/apply-handlers/campaign-target-cpa-update";
import { applyCampaignTargetRoasUpdate } from "@/lib/agents/optimate-google-ads/apply-handlers/campaign-target-roas-update";
import { registerOptimateApplyHandlers } from "@/lib/agents/optimate-google-ads/apply-handlers";
import { listRegisteredProposalTypes } from "@/lib/agents/_shared/apply-dispatcher";

const fakeCtx = (): ApplyHandlerContext => ({ payload: {} as never, approvalId: 101, userId: 1 });

beforeEach(() => {
  mockResolveCustomerId.mockReset();
  mockPostGrowthTools.mockReset();
  mockGetCampaignSnapshot.mockReset();
  mockResolveCustomerId.mockResolvedValue({ customerId: "1234567890", auditDoc: { client: 7 } });
  mockGetCampaignSnapshot.mockResolvedValue({ rows: [] });
});

describe("Account Efficiency apply handler registration", () => {
  it("registers pause and target bidding handlers", () => {
    registerOptimateApplyHandlers();
    expect(listRegisteredProposalTypes()).toEqual(expect.arrayContaining([
      "ad-group-pause",
      "keyword-pause",
      "campaign-target-cpa-update",
      "campaign-target-roas-update",
    ]));
  });
});

describe("applyAdGroupPause", () => {
  it("validates required fields before network calls", async () => {
    await expect(applyAdGroupPause({ auditId: 11, campaignId: "c1", adGroupId: "ag1", operation: "delete" }, fakeCtx()))
      .rejects.toThrow(/pause.*enable/);
    expect(mockPostGrowthTools).not.toHaveBeenCalled();
  });

  it("posts a locally proven schema with resolved customerId", async () => {
    mockPostGrowthTools.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    await applyAdGroupPause({ auditId: 11, campaignId: "c1", adGroupId: "ag1", adGroupName: "Brand", expectedStatus: "ENABLED", operation: "pause" }, fakeCtx());
    expect(mockPostGrowthTools).toHaveBeenCalledWith("/api/google-ads/ad-groups/pause", {
      customerId: "1234567890",
      adGroups: [
        {
          campaignId: "c1",
          campaignName: undefined,
          adGroupId: "ag1",
          adGroupName: "Brand",
          expectedStatus: "ENABLED",
          operation: "pause",
        },
      ],
    });
  });

  it("keeps endpoint blocked clearly when Growth Tools returns 404", async () => {
    mockPostGrowthTools.mockResolvedValue({ ok: false, status: 404, error: "not found" });
    await expect(applyAdGroupPause({ auditId: 11, campaignId: "c1", adGroupId: "ag1", operation: "pause" }, fakeCtx()))
      .rejects.toThrow(/endpoint \/api\/google-ads\/ad-groups\/pause is not available yet/);
  });
});

describe("applyKeywordPause", () => {
  it("requires either keywordId or keywordText", async () => {
    await expect(applyKeywordPause({ auditId: 11, campaignId: "c1", adGroupId: "ag1", operation: "pause" }, fakeCtx()))
      .rejects.toThrow(/keywordId or keywordText/);
    expect(mockPostGrowthTools).not.toHaveBeenCalled();
  });

  it("posts a locally proven schema with resolved customerId", async () => {
    mockPostGrowthTools.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    await applyKeywordPause({ auditId: 11, campaignId: "c1", adGroupId: "ag1", keywordId: "kw1", keywordText: "bad term", matchType: "EXACT", operation: "pause" }, fakeCtx());
    expect(mockPostGrowthTools).toHaveBeenCalledWith("/api/google-ads/keywords/pause", {
      customerId: "1234567890",
      campaignId: "c1",
      adGroupId: "ag1",
      keywordId: "kw1",
      keywordText: "bad term",
      matchType: "EXACT",
      operation: "pause",
    });
  });

  it("keeps endpoint blocked clearly when Growth Tools returns 404", async () => {
    mockPostGrowthTools.mockResolvedValue({ ok: false, status: 404, error: "not found" });
    await expect(applyKeywordPause({ auditId: 11, campaignId: "c1", adGroupId: "ag1", keywordText: "bad term", operation: "pause" }, fakeCtx()))
      .rejects.toThrow(/endpoint \/api\/google-ads\/keywords\/pause is not available yet/);
  });
});

describe("applyCampaignTargetCpaUpdate", () => {
  it("posts to documented campaign budget update endpoint with canonical CPA fields", async () => {
    mockPostGrowthTools.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    await applyCampaignTargetCpaUpdate({ auditId: 11, campaignId: "c1", expectedBidStrategy: "target_cpa", currentTargetCpaMicros: 50_000_000, newTargetCpaMicros: 60_000_000 }, fakeCtx());
    expect(mockPostGrowthTools).toHaveBeenCalledWith("/api/google-ads/campaign-budgets/update", expect.objectContaining({
      customerId: "1234567890",
      campaignId: "c1",
      bidStrategy: "target_cpa",
      targetCpaMicros: 60_000_000,
      targetCpa: 60,
    }));
  });

  it("aborts safely when snapshot bid strategy drifted", async () => {
    mockGetCampaignSnapshot.mockResolvedValue({ rows: [{ campaignId: "c1", bidStrategy: "maximize_conversions", targetCpaMicros: 50_000_000 }] });
    await expect(applyCampaignTargetCpaUpdate({ auditId: 11, campaignId: "c1", expectedBidStrategy: "target_cpa", currentTargetCpaMicros: 50_000_000, newTargetCpaMicros: 60_000_000 }, fakeCtx()))
      .rejects.toThrow(/bid strategy drifted/);
    expect(mockPostGrowthTools).not.toHaveBeenCalled();
  });
});

describe("applyCampaignTargetRoasUpdate", () => {
  it("remains blocked because Growth Tools request schema is not proven in repo docs/code", async () => {
    await expect(applyCampaignTargetRoasUpdate({}, fakeCtx())).rejects.toThrow(/not enabled.*target ROAS request fields.*not verified/);
    expect(mockPostGrowthTools).not.toHaveBeenCalled();
  });
});
