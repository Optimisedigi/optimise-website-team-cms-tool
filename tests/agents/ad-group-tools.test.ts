/**
 * Propose-tool tests for the ad-group-create + keywords-add flow.
 *
 * Covers:
 *   - validator rejects missing / oversize / malformed inputs
 *   - validator accepts cloneFromAdGroupId when present and tolerates its absence
 *   - execute() queues a row with the right proposalType and proposalPayload
 *
 * We mock the _propose-helpers module so queueProposal doesn't touch the DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueueProposal } = vi.hoisted(() => ({
  mockQueueProposal: vi.fn(async () => 9001),
}));
vi.mock("@/lib/agents/optimate-google-ads/tools/_propose-helpers", () => ({
  queueProposal: mockQueueProposal,
  resetProposalCounter: vi.fn(),
  buildInternalMarkdown: vi.fn(() => "internal-markdown"),
  mdTable: vi.fn(() => "md-table"),
}));

import { proposeAdGroupCreate } from "@/lib/agents/optimate-google-ads/tools/propose-ad-group-create";
import { proposeKeywordsAdd } from "@/lib/agents/optimate-google-ads/tools/propose-keywords-add";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_adgroup_1",
  context: { clientId: 7, auditId: 11, customerId: "1234567890" },
  log: vi.fn(),
});

const validKeywords = [
  { text: "emergency plumber sydney", matchType: "phrase" },
  { text: "24/7 plumber sydney", matchType: "phrase", cpcBidMicros: 2_500_000 },
];

const baseAdGroupCreate = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  campaignId: "9876543210",
  campaignName: "Plumbers — Sydney",
  adGroupName: "Brand — Emergency Plumbers — Sydney",
  keywords: validKeywords,
  summary: "Spin up a similar ad group for emergency-plumber long-tails.",
  ...overrides,
});

const baseKeywordsAdd = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  adGroupId: "5555555555",
  adGroupName: "Brand — Emergency Plumbers — Sydney",
  campaignName: "Plumbers — Sydney",
  keywords: validKeywords,
  summary: "Add the latest 2 long-tails the team flagged on Friday.",
  ...overrides,
});

beforeEach(() => {
  mockQueueProposal.mockClear();
});

describe("propose_ad_group_create — validator", () => {
  it("rejects missing campaignId", () => {
    const raw = baseAdGroupCreate({ campaignId: "" });
    expect(() => proposeAdGroupCreate.validate!(raw)).toThrow(/campaignId/);
  });

  it("rejects missing campaignName", () => {
    const raw = baseAdGroupCreate({ campaignName: "" });
    expect(() => proposeAdGroupCreate.validate!(raw)).toThrow(/campaignName/);
  });

  it("rejects missing adGroupName", () => {
    const raw = baseAdGroupCreate({ adGroupName: "" });
    expect(() => proposeAdGroupCreate.validate!(raw)).toThrow(/adGroupName/);
  });

  it("rejects adGroupName > 255 chars", () => {
    const raw = baseAdGroupCreate({ adGroupName: "x".repeat(256) });
    expect(() => proposeAdGroupCreate.validate!(raw)).toThrow(/255/);
  });

  it("rejects empty keywords array", () => {
    const raw = baseAdGroupCreate({ keywords: [] });
    expect(() => proposeAdGroupCreate.validate!(raw)).toThrow(/keywords/);
  });

  it("rejects > 200 keywords", () => {
    const big = Array.from({ length: 201 }, (_, i) => ({ text: `kw ${i}`, matchType: "phrase" }));
    const raw = baseAdGroupCreate({ keywords: big });
    expect(() => proposeAdGroupCreate.validate!(raw)).toThrow(/200/);
  });

  it("rejects keyword text > 80 chars", () => {
    const raw = baseAdGroupCreate({
      keywords: [{ text: "a".repeat(81), matchType: "phrase" }],
    });
    expect(() => proposeAdGroupCreate.validate!(raw)).toThrow(/80-char/);
  });

  it("rejects invalid matchType", () => {
    const raw = baseAdGroupCreate({
      keywords: [{ text: "plumber sydney", matchType: "loose" }],
    });
    expect(() => proposeAdGroupCreate.validate!(raw)).toThrow(/matchType/);
  });

  it("accepts a valid payload without cloneFromAdGroupId", () => {
    const raw = baseAdGroupCreate();
    const out = proposeAdGroupCreate.validate!(raw);
    expect(out.cloneFromAdGroupId).toBeUndefined();
    expect(out.keywords).toHaveLength(2);
    expect(out.keywords[0].matchType).toBe("phrase");
    expect(out.keywords[1].cpcBidMicros).toBe(2_500_000);
  });

  it("accepts cloneFromAdGroupId when present", () => {
    const raw = baseAdGroupCreate({
      cloneFromAdGroupId: "1111222233",
      cloneFromAdGroupName: "Brand — Generic",
    });
    const out = proposeAdGroupCreate.validate!(raw);
    expect(out.cloneFromAdGroupId).toBe("1111222233");
    expect(out.cloneFromAdGroupName).toBe("Brand — Generic");
  });
});

describe("propose_ad_group_create — execute", () => {
  it("queues a row with proposalType=ad-group-create and the right payload", async () => {
    const args = proposeAdGroupCreate.validate!(
      baseAdGroupCreate({
        cloneFromAdGroupId: "1111222233",
        cloneFromAdGroupName: "Brand — Generic",
      }),
    );
    const result = await proposeAdGroupCreate.execute(
      args as Parameters<typeof proposeAdGroupCreate.execute>[0],
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(mockQueueProposal).toHaveBeenCalledOnce();
    const call = mockQueueProposal.mock.calls[0][0] as Record<string, unknown>;
    expect(call.proposalType).toBe("ad-group-create");
    expect(call.title).toContain("Brand — Emergency Plumbers — Sydney");
    expect(call.title).toContain("Plumbers — Sydney");
    const payload = call.proposalPayload as Record<string, unknown>;
    expect(payload.auditId).toBe(11);
    expect(payload.campaignId).toBe("9876543210");
    expect(payload.adGroupName).toBe("Brand — Emergency Plumbers — Sydney");
    expect(payload.cloneFromAdGroupId).toBe("1111222233");
    expect(Array.isArray(payload.keywords)).toBe(true);
    expect((payload.keywords as unknown[]).length).toBe(2);
  });

  it("stores null cloneFromAdGroupId when omitted", async () => {
    const args = proposeAdGroupCreate.validate!(baseAdGroupCreate());
    await proposeAdGroupCreate.execute(
      args as Parameters<typeof proposeAdGroupCreate.execute>[0],
      baseCtx(),
    );
    const payload = (mockQueueProposal.mock.calls[0][0] as { proposalPayload: Record<string, unknown> }).proposalPayload;
    expect(payload.cloneFromAdGroupId).toBeNull();
  });
});

describe("propose_keywords_add — validator", () => {
  it("rejects missing adGroupId", () => {
    const raw = baseKeywordsAdd({ adGroupId: "" });
    expect(() => proposeKeywordsAdd.validate!(raw)).toThrow(/adGroupId/);
  });

  it("rejects missing adGroupName", () => {
    const raw = baseKeywordsAdd({ adGroupName: "" });
    expect(() => proposeKeywordsAdd.validate!(raw)).toThrow(/adGroupName/);
  });

  it("rejects empty keywords array", () => {
    const raw = baseKeywordsAdd({ keywords: [] });
    expect(() => proposeKeywordsAdd.validate!(raw)).toThrow(/keywords/);
  });

  it("rejects keyword text > 80 chars", () => {
    const raw = baseKeywordsAdd({
      keywords: [{ text: "z".repeat(81), matchType: "phrase" }],
    });
    expect(() => proposeKeywordsAdd.validate!(raw)).toThrow(/80-char/);
  });

  it("accepts a valid keyword payload", () => {
    const out = proposeKeywordsAdd.validate!(baseKeywordsAdd());
    expect(out.adGroupId).toBe("5555555555");
    expect(out.campaignName).toBe("Plumbers — Sydney");
    expect(out.keywords).toHaveLength(2);
    expect(out.keywords[0].matchType).toBe("phrase");
  });
});

describe("propose_keywords_add — execute", () => {
  it("queues a row with proposalType=keywords-add and the right payload", async () => {
    const args = proposeKeywordsAdd.validate!(baseKeywordsAdd());
    const result = await proposeKeywordsAdd.execute(
      args as Parameters<typeof proposeKeywordsAdd.execute>[0],
      baseCtx(),
    );
    expect(result.ok).toBe(true);
    expect(mockQueueProposal).toHaveBeenCalledOnce();
    const call = mockQueueProposal.mock.calls[0][0] as Record<string, unknown>;
    expect(call.proposalType).toBe("keywords-add");
    expect(call.title).toContain("Brand — Emergency Plumbers — Sydney");
    const payload = call.proposalPayload as Record<string, unknown>;
    expect(payload.auditId).toBe(11);
    expect(payload.adGroupId).toBe("5555555555");
    expect(Array.isArray(payload.keywords)).toBe(true);
    expect((payload.keywords as unknown[]).length).toBe(2);
  });
});
