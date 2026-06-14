import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { checkRunForCorrection } from "@/lib/agents/optimate-google-ads/post-run-checks";
import { checkVoiceRunForCorrection } from "@/lib/agents/optimate-google-ads/voice-run-checks";
import { proposeCampaignStatusChange } from "@/lib/agents/optimate-google-ads/tools/propose-campaign-status-change";
import { proposeAdGroupStatusChange } from "@/lib/agents/optimate-google-ads/tools/propose-ad-group-status-change";

describe("OptiMate status proposal tool validation", () => {
  it("accepts campaign pause and enable proposals with exact IDs", () => {
    const parsed = proposeCampaignStatusChange.validate?.({
      campaigns: [
        { campaignId: "customers/123/campaigns/456", campaignName: "Brand", operation: "pause", expectedStatus: "enabled" },
        { campaignId: "789", campaignName: "Generic", operation: "enable" },
      ],
      summary: "Pause brand and enable generic for approval.",
      supportingNumbers: ["Brand spent $120 from get_campaign_performance"],
    });

    expect(parsed?.campaigns).toEqual([
      { campaignId: "456", campaignName: "Brand", operation: "pause", expectedStatus: "ENABLED" },
      { campaignId: "789", campaignName: "Generic", operation: "enable" },
    ]);
  });

  it("accepts ad group status proposals with campaign and ad group IDs", () => {
    const parsed = proposeAdGroupStatusChange.validate?.({
      adGroups: [{ campaignId: "111", adGroupId: "222", adGroupName: "Core", operation: "enable", expectedStatus: "paused" }],
      summary: "Enable the core ad group for approval.",
    });

    expect(parsed?.adGroups[0]).toEqual({
      campaignId: "111",
      adGroupId: "222",
      adGroupName: "Core",
      operation: "enable",
      expectedStatus: "PAUSED",
    });
  });
});

describe("OptiMate post-run status corrections", () => {
  it("corrects campaign pause requests when no tool was called", () => {
    const correction = checkRunForCorrection("Pause the Brand campaign", "I paused the campaign.", []);

    expect(correction?.reason).toBe("zero_tool_call_on_action");
    expect(correction?.correctionNote).toContain("propose_*");
  });

  it("corrects false campaign status claims when the proposal tool was not called", () => {
    const correction = checkRunForCorrection("Pause the Brand campaign", "I paused the campaign.", ["get_campaign_performance"]);

    expect(correction?.reason).toBe("promised_but_not_delivered");
    expect(correction?.correctionNote).toContain("propose_campaign_status_change");
  });

  it("allows campaign status claims when the proposal tool was called", () => {
    const correction = checkRunForCorrection("Pause the Brand campaign", "Queued approval #123, review at /admin/agent-approvals/123.", ["propose_campaign_status_change"]);

    expect(correction).toBeNull();
  });
});

describe("OptiMate voice run corrections", () => {
  it("requires successful proposal output before accepting approval claims", () => {
    const correction = checkVoiceRunForCorrection({
      userMessage: "Pause the Brand campaign",
      reply: "Queued approval #123.",
      toolCalls: [{ name: "propose_campaign_status_change", ok: false, result: { ok: false, error: "failed" } }],
    });

    expect(correction?.reason).toBe("proposal_claim_without_approval");
  });

  it("accepts approval claims backed by a propose tool approval id", () => {
    const correction = checkVoiceRunForCorrection({
      userMessage: "Pause the Brand campaign",
      reply: "Queued approval #123, review at /admin/agent-approvals/123.",
      toolCalls: [{ name: "propose_campaign_status_change", ok: true, result: { ok: true, data: { approvalId: 123 } } }],
    });

    expect(correction).toBeNull();
  });
});

describe("OptiMate status apply handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("INTERNAL_API_KEY", "internal-key");
    vi.stubEnv("GROWTH_TOOLS_URL", "https://growth.example");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("applies campaign status proposals through Growth Tools", async () => {
    const { applyCampaignStatusChange } = await import("@/lib/agents/optimate-google-ads/apply-handlers/campaign-status-change");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, changed: [{ campaignId: "456" }] }),
    } as unknown as Response);

    const ctx = {
      payload: {
        findByID: vi.fn().mockResolvedValue({ id: 7, customerId: "123-456-7890" }),
      },
    } as any;

    const result = await applyCampaignStatusChange({
      auditId: 7,
      campaigns: [{ campaignId: "456", campaignName: "Brand", operation: "pause", expectedStatus: "ENABLED" }],
    }, ctx);

    expect(result.message).toContain("1 campaign");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://growth.example/api/google-ads/campaigns/status", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-internal-key": "internal-key" }),
      body: JSON.stringify({
        customerId: "1234567890",
        campaigns: [{ campaignId: "456", campaignName: "Brand", operation: "pause", expectedStatus: "ENABLED" }],
      }),
    }));
  });

  it("applies batched ad group status proposals through Growth Tools", async () => {
    const { applyAdGroupPause } = await import("@/lib/agents/optimate-google-ads/apply-handlers/ad-group-pause");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true, changed: [{ adGroupId: "222" }] }),
    } as unknown as Response);

    const ctx = {
      payload: {
        findByID: vi.fn().mockResolvedValue({ id: 7, customerId: "123-456-7890" }),
      },
    } as any;

    const result = await applyAdGroupPause({
      auditId: 7,
      adGroups: [{ campaignId: "111", adGroupId: "222", adGroupName: "Core", operation: "enable", expectedStatus: "PAUSED" }],
    }, ctx);

    expect(result.message).toContain("1 ad group");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://growth.example/api/google-ads/ad-groups/pause", expect.objectContaining({
      method: "POST",
    }));
    const [, requestInit] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      customerId: "1234567890",
      adGroups: [{ campaignId: "111", adGroupId: "222", adGroupName: "Core", expectedStatus: "PAUSED", operation: "enable" }],
    });
  });
});
