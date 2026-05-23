import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  getAccountHealthContract,
  isCampaignProtected,
  isBrandCampaign,
  type AccountHealthContract,
} from "@/lib/goal-agents/account-health-contract";

// ─── Mock payload ───────────────────────────────────────────────────────────
interface MockPayload {
  findByID: ReturnType<typeof vi.fn>;
}

function makePayload(): MockPayload {
  return { findByID: vi.fn() };
}

const CLIENT_ID = "123";

const minimalClient = {
  id: CLIENT_ID,
  // spendPolicy intentionally omitted to exercise the `raw ?? {}` path.
  protectedCampaignIds: [],
  brandCampaignIds: [],
};

const fullPolicyClient = {
  id: CLIENT_ID,
  spendPolicy: {
    pacingMode: "fixed_monthly",
    pacingWindow: "calendar_month",
    monthlyBudgetTarget: 50000,
    acceptableVariancePercentLow: 85,
    acceptableVariancePercentHigh: 110,
    hardFloor: 40000,
    hardCeiling: 60000,
    conversionTrackingEnabledFrom: "2026-04-01T00:00:00.000Z",
  },
  protectedCampaignIds: [
    { campaignId: " 111 " },
    { campaignId: "222" },
    { campaignId: " 111 " }, // duplicate after trim
    { campaignId: "" }, // empty
    { campaignId: null }, // null
  ],
  brandCampaignIds: [
    { campaignId: "brand-abc" },
    { campaignId: "BRAND-ABC" }, // different case — NOT deduped (impl dedupes by trimmed, case-sensitive)
  ],
};

// ─── getAccountHealthContract ───────────────────────────────────────────────
describe("getAccountHealthContract", () => {
  let payload: MockPayload;

  beforeEach(() => {
    payload = makePayload();
  });

  it("returns null when payload.findByID rejects (not found)", async () => {
    payload.findByID.mockRejectedValue(new Error("NotFound"));
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result).toBeNull();
  });

  it("returns null on any thrown error (never throws to the caller)", async () => {
    payload.findByID.mockRejectedValue(new Error("db timeout"));
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result).toBeNull();
  });

  it("applies default variance band + pacing window when spendPolicy is missing", async () => {
    payload.findByID.mockResolvedValue(minimalClient);
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result).not.toBeNull();
    expect(result!.spendPolicy.acceptableVariancePercentLow).toBe(90);
    expect(result!.spendPolicy.acceptableVariancePercentHigh).toBe(105);
    expect(result!.spendPolicy.pacingWindow).toBe("calendar_month");
    expect(result!.spendPolicy.pacingMode).toBeNull();
    expect(result!.spendPolicy.monthlyBudgetTarget).toBeNull();
    expect(result!.spendPolicy.hardFloor).toBeNull();
    expect(result!.spendPolicy.hardCeiling).toBeNull();
  });

  it("hasPolicy is false when neither pacingMode nor monthlyBudgetTarget set", async () => {
    payload.findByID.mockResolvedValue(minimalClient);
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result!.hasPolicy).toBe(false);
  });

  it("hasPolicy is true when pacingMode is set", async () => {
    payload.findByID.mockResolvedValue({
      ...minimalClient,
      spendPolicy: { pacingMode: "fixed_monthly" },
    });
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result!.hasPolicy).toBe(true);
  });

  it("hasPolicy is true when monthlyBudgetTarget > 0", async () => {
    payload.findByID.mockResolvedValue({
      ...minimalClient,
      spendPolicy: { monthlyBudgetTarget: 50000 },
    });
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result!.hasPolicy).toBe(true);
  });

  it("hasPolicy is false when monthlyBudgetTarget is 0 (and no pacingMode)", async () => {
    payload.findByID.mockResolvedValue({
      ...minimalClient,
      spendPolicy: { monthlyBudgetTarget: 0 },
    });
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result!.hasPolicy).toBe(false);
  });

  it("propagates a fully populated SpendPolicy verbatim", async () => {
    payload.findByID.mockResolvedValue(fullPolicyClient);
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result!.spendPolicy).toEqual({
      pacingMode: "fixed_monthly",
      pacingWindow: "calendar_month",
      monthlyBudgetTarget: 50000,
      acceptableVariancePercentLow: 85,
      acceptableVariancePercentHigh: 110,
      hardFloor: 40000,
      hardCeiling: 60000,
      conversionTrackingEnabledFrom: "2026-04-01T00:00:00.000Z",
    });
    expect(result!.hasPolicy).toBe(true);
  });

  it("normalises campaign ID arrays: trims, drops empty/null, dedupes by trimmed value", async () => {
    payload.findByID.mockResolvedValue(fullPolicyClient);
    const result = await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(result!.protectedCampaignIds).toEqual(["111", "222"]);
    // Dedup is case-sensitive on the trimmed string, so "brand-abc" and
    // "BRAND-ABC" are both retained as distinct entries.
    expect(result!.brandCampaignIds).toEqual(["brand-abc", "BRAND-ABC"]);
  });

  it("calls payload.findByID with the expected query shape", async () => {
    payload.findByID.mockResolvedValue(minimalClient);
    await getAccountHealthContract(payload as never, CLIENT_ID);
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "clients",
        id: CLIENT_ID,
        overrideAccess: true,
        depth: 0,
      }),
    );
  });
});

// ─── isCampaignProtected ────────────────────────────────────────────────────
describe("isCampaignProtected", () => {
  const contract: AccountHealthContract = {
    clientId: "123",
    spendPolicy: {
      pacingMode: "fixed_monthly",
      pacingWindow: "calendar_month",
      monthlyBudgetTarget: 50000,
      acceptableVariancePercentLow: 90,
      acceptableVariancePercentHigh: 105,
      hardFloor: null,
      hardCeiling: null,
    },
    protectedCampaignIds: ["111", "222"],
    brandCampaignIds: [],
    hasPolicy: true,
  };

  it("returns false when protectedCampaignIds is empty", () => {
    expect(
      isCampaignProtected({ ...contract, protectedCampaignIds: [] }, "111"),
    ).toBe(false);
  });

  it("returns false when the campaign ID is not in the list", () => {
    expect(isCampaignProtected(contract, "999")).toBe(false);
  });

  it("returns true for an exact match", () => {
    expect(isCampaignProtected(contract, "111")).toBe(true);
    expect(isCampaignProtected(contract, "222")).toBe(true);
  });

  it("matches case-insensitively and tolerates surrounding whitespace", () => {
    const c: AccountHealthContract = {
      ...contract,
      protectedCampaignIds: ["AbC"],
    };
    expect(isCampaignProtected(c, "abc")).toBe(true);
    expect(isCampaignProtected(c, "ABC")).toBe(true);
    expect(isCampaignProtected(c, "  abc  ")).toBe(true);
  });

  it("returns false for an empty needle", () => {
    expect(isCampaignProtected(contract, "")).toBe(false);
    expect(isCampaignProtected(contract, "   ")).toBe(false);
  });
});

// ─── isBrandCampaign ────────────────────────────────────────────────────────
describe("isBrandCampaign", () => {
  const contract: AccountHealthContract = {
    clientId: "123",
    spendPolicy: {
      pacingMode: null,
      pacingWindow: "calendar_month",
      monthlyBudgetTarget: null,
      acceptableVariancePercentLow: 90,
      acceptableVariancePercentHigh: 105,
      hardFloor: null,
      hardCeiling: null,
    },
    protectedCampaignIds: [],
    brandCampaignIds: ["BRAND-XYZ"],
    hasPolicy: false,
  };

  it("returns false when brandCampaignIds is empty", () => {
    expect(isBrandCampaign({ ...contract, brandCampaignIds: [] }, "BRAND-XYZ"))
      .toBe(false);
  });

  it("returns false when the campaign ID is not in the list", () => {
    expect(isBrandCampaign(contract, "NOT-BRAND")).toBe(false);
  });

  it("returns true for an exact match", () => {
    expect(isBrandCampaign(contract, "BRAND-XYZ")).toBe(true);
  });

  it("is case-insensitive and trims whitespace on both sides", () => {
    expect(isBrandCampaign(contract, "brand-xyz")).toBe(true);
    expect(isBrandCampaign(contract, "  brand-xyz  ")).toBe(true);
  });
});
