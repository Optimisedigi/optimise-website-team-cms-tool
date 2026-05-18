/**
 * Apply-handler tests for ad-group-create + keywords-add.
 *
 * Covers:
 *   - Refuses to run when auditId is missing or non-numeric.
 *   - Refuses to run when required fields (campaignId / adGroupId / keywords) are missing.
 *   - Maps CMS lowercase match types to uppercase for the Growth Tools body.
 *   - Encodes the URL path correctly for keywords-add.
 *   - Surfaces Growth Tools failures as thrown errors.
 *   - Returns a success message with counts on a happy-path Growth Tools response.
 *
 * The _helpers module wraps process.env-driven fetch calls. We mock that
 * module wholesale so the tests stay deterministic and never touch the
 * network.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveCustomerId, mockPostGrowthTools } = vi.hoisted(() => ({
  mockResolveCustomerId: vi.fn(),
  mockPostGrowthTools: vi.fn(),
}));

vi.mock("@/lib/agents/optimate-google-ads/apply-handlers/_helpers", () => ({
  resolveCustomerId: mockResolveCustomerId,
  postGrowthTools: mockPostGrowthTools,
  postGrowthToolsFireAndForget: vi.fn(),
  resolveClientId: vi.fn(),
  stampNegatedAt: vi.fn(),
}));

import { applyAdGroupCreate } from "@/lib/agents/optimate-google-ads/apply-handlers/ad-group-create";
import { applyKeywordsAdd } from "@/lib/agents/optimate-google-ads/apply-handlers/keywords-add";
import type { ApplyHandlerContext } from "@/lib/agents/_shared/apply-dispatcher";

const fakeCtx = (): ApplyHandlerContext => ({
  payload: {} as never,
  approvalId: 4242,
  userId: 1,
});

const validAdGroupCreatePayload = (overrides: Record<string, unknown> = {}) => ({
  auditId: 11,
  campaignId: "9876543210",
  campaignName: "Plumbers — Sydney",
  adGroupName: "Brand — Emergency Plumbers — Sydney",
  keywords: [
    { text: "emergency plumber sydney", matchType: "phrase" },
    { text: "24/7 plumber sydney", matchType: "phrase", cpcBidMicros: 2_500_000 },
  ],
  cloneFromAdGroupId: "1111222233",
  ...overrides,
});

const validKeywordsAddPayload = (overrides: Record<string, unknown> = {}) => ({
  auditId: 11,
  adGroupId: "5555555555",
  adGroupName: "Brand — Emergency Plumbers — Sydney",
  keywords: [
    { text: "emergency plumber sydney", matchType: "phrase" },
    { text: "24/7 plumber sydney", matchType: "phrase", cpcBidMicros: 2_500_000 },
  ],
  ...overrides,
});

beforeEach(() => {
  mockResolveCustomerId.mockReset();
  mockPostGrowthTools.mockReset();
  mockResolveCustomerId.mockResolvedValue({ customerId: "1234567890", auditDoc: {} });
});

describe("applyAdGroupCreate", () => {
  it("refuses to run when auditId is missing", async () => {
    const payload = validAdGroupCreatePayload();
    delete (payload as Record<string, unknown>).auditId;
    await expect(applyAdGroupCreate(payload, fakeCtx())).rejects.toThrow(/auditId/);
    expect(mockPostGrowthTools).not.toHaveBeenCalled();
  });

  it("refuses to run when auditId is non-numeric", async () => {
    const payload = validAdGroupCreatePayload({ auditId: "not-a-number" });
    await expect(applyAdGroupCreate(payload, fakeCtx())).rejects.toThrow(/numeric/);
    expect(mockPostGrowthTools).not.toHaveBeenCalled();
  });

  it("refuses to run when campaignId is missing", async () => {
    const payload = validAdGroupCreatePayload({ campaignId: "" });
    await expect(applyAdGroupCreate(payload, fakeCtx())).rejects.toThrow(/campaignId/);
  });

  it("refuses to run when adGroupName is missing", async () => {
    const payload = validAdGroupCreatePayload({ adGroupName: "" });
    await expect(applyAdGroupCreate(payload, fakeCtx())).rejects.toThrow(/adGroupName/);
  });

  it("refuses to run with empty keywords array", async () => {
    const payload = validAdGroupCreatePayload({ keywords: [] });
    await expect(applyAdGroupCreate(payload, fakeCtx())).rejects.toThrow(/keywords/);
  });

  it("posts to Growth Tools with uppercase match types and cloneFromAdGroupId", async () => {
    mockPostGrowthTools.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        adGroupId: "5555555555",
        adGroupResourceName: "customers/1234567890/adGroups/5555555555",
        keywordsAdded: 2,
        cloned: { ad: true, defaultCpcMicros: true, audienceCriteria: 3, bidModifiers: 2, negativeKeywords: 4 },
        warnings: [],
      },
    });

    const result = await applyAdGroupCreate(validAdGroupCreatePayload(), fakeCtx());

    expect(mockPostGrowthTools).toHaveBeenCalledOnce();
    const [path, body] = mockPostGrowthTools.mock.calls[0];
    expect(path).toBe("/api/google-ads/ad-groups/create");
    expect(body).toMatchObject({
      customerId: "1234567890",
      campaignId: "9876543210",
      name: "Brand — Emergency Plumbers — Sydney",
      cloneFromAdGroupId: "1111222233",
    });
    const bodyKeywords = (body as { keywords: Array<{ text: string; matchType: string; cpcBidMicros?: number }> }).keywords;
    expect(bodyKeywords).toHaveLength(2);
    expect(bodyKeywords[0].matchType).toBe("PHRASE");
    expect(bodyKeywords[1].matchType).toBe("PHRASE");
    expect(bodyKeywords[1].cpcBidMicros).toBe(2_500_000);

    expect(result.message).toContain("Created ad group");
    expect(result.message).toContain("Plumbers — Sydney");
    expect(result.detail).toMatchObject({
      auditId: 11,
      customerId: "1234567890",
      adGroupId: "5555555555",
      keywordsAdded: 2,
    });
  });

  it("omits cloneFromAdGroupId from the body when not supplied", async () => {
    mockPostGrowthTools.mockResolvedValue({
      ok: true,
      status: 200,
      data: { adGroupId: "5555555555", keywordsAdded: 2 },
    });

    const payload = validAdGroupCreatePayload();
    delete (payload as Record<string, unknown>).cloneFromAdGroupId;
    await applyAdGroupCreate(payload, fakeCtx());

    const body = mockPostGrowthTools.mock.calls[0][1] as Record<string, unknown>;
    expect("cloneFromAdGroupId" in body).toBe(false);
  });

  it("surfaces Growth Tools failures as thrown errors", async () => {
    mockPostGrowthTools.mockResolvedValue({
      ok: false,
      status: 502,
      error: "Google Ads API returned PERMISSION_DENIED",
    });
    await expect(applyAdGroupCreate(validAdGroupCreatePayload(), fakeCtx())).rejects.toThrow(
      /PERMISSION_DENIED/,
    );
  });

  it("maps exact + broad match types to uppercase", async () => {
    mockPostGrowthTools.mockResolvedValue({ ok: true, status: 200, data: { keywordsAdded: 2 } });
    await applyAdGroupCreate(
      validAdGroupCreatePayload({
        keywords: [
          { text: "exact term", matchType: "exact" },
          { text: "broad term", matchType: "broad" },
        ],
      }),
      fakeCtx(),
    );
    const body = mockPostGrowthTools.mock.calls[0][1] as { keywords: Array<{ matchType: string }> };
    expect(body.keywords[0].matchType).toBe("EXACT");
    expect(body.keywords[1].matchType).toBe("BROAD");
  });
});

describe("applyKeywordsAdd", () => {
  it("refuses to run when auditId is missing", async () => {
    const payload = validKeywordsAddPayload();
    delete (payload as Record<string, unknown>).auditId;
    await expect(applyKeywordsAdd(payload, fakeCtx())).rejects.toThrow(/auditId/);
    expect(mockPostGrowthTools).not.toHaveBeenCalled();
  });

  it("refuses to run when adGroupId is missing", async () => {
    const payload = validKeywordsAddPayload({ adGroupId: "" });
    await expect(applyKeywordsAdd(payload, fakeCtx())).rejects.toThrow(/adGroupId/);
  });

  it("refuses to run with empty keywords array", async () => {
    const payload = validKeywordsAddPayload({ keywords: [] });
    await expect(applyKeywordsAdd(payload, fakeCtx())).rejects.toThrow(/keywords/);
  });

  it("posts to the right URL with uppercase match types", async () => {
    mockPostGrowthTools.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        added: 1,
        skippedDuplicates: 1,
        duplicates: [{ text: "emergency plumber sydney", matchType: "PHRASE" }],
        errors: [],
      },
    });

    const result = await applyKeywordsAdd(validKeywordsAddPayload(), fakeCtx());

    expect(mockPostGrowthTools).toHaveBeenCalledOnce();
    const [path, body] = mockPostGrowthTools.mock.calls[0];
    expect(path).toBe("/api/google-ads/ad-groups/5555555555/keywords/add");
    expect(body).toMatchObject({ customerId: "1234567890" });
    const bodyKeywords = (body as { keywords: Array<{ matchType: string }> }).keywords;
    expect(bodyKeywords).toHaveLength(2);
    expect(bodyKeywords[0].matchType).toBe("PHRASE");
    expect(bodyKeywords[1].matchType).toBe("PHRASE");

    expect(result.message).toContain("Added 1 keyword");
    expect(result.message).toContain("skipped 1 duplicate");
    expect(result.detail).toMatchObject({
      auditId: 11,
      customerId: "1234567890",
      adGroupId: "5555555555",
      added: 1,
      skippedDuplicates: 1,
    });
  });

  it("surfaces Growth Tools failures as thrown errors", async () => {
    mockPostGrowthTools.mockResolvedValue({
      ok: false,
      status: 404,
      error: "ad group not found",
    });
    await expect(applyKeywordsAdd(validKeywordsAddPayload(), fakeCtx())).rejects.toThrow(
      /ad group not found/,
    );
  });
});
