import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  getSpendPacerStatus,
  type GetSpendPacerStatusArgs,
} from "@/lib/goal-agents/get-spend-pacer-status";

// Mock getCampaignSnapshot at the module level.
// Non-stale tests set mockResolvedValue on it.
// Stale tests set isStale: true.
// getCampaignSnapshot returns null on the "no snapshot" test.
vi.mock("@/lib/google-ads-snapshots", () => ({
  getCampaignSnapshot: vi.fn<
    (
      payload: unknown,
      args: { clientId: number; staleAfterMinutes?: number },
    ) => Promise<{
      level: "campaign";
      clientId: string;
      customerId: string;
      capturedAt: string;
      rowCount: number;
      rows: {
        campaignId: string;
        name: string;
        status: string;
        spend: number;
        clicks: number;
        impressions: number;
        conversions: number;
        ctr: number;
        cpa: number | null;
      }[];
      isStale: boolean;
      ageMinutes: number;
    } | null>
  >(),
}));

import { getCampaignSnapshot } from "@/lib/google-ads-snapshots";

// ─── Mock payload ─────────────────────────────────────────────────────────────
interface MockPayload {
  findByID: ReturnType<typeof vi.fn>;
}

function makePayload(): MockPayload {
  return {
    findByID: vi.fn(),
  };
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** A non-stale snapshot with the given campaign rows. */
function freshSnapshot(
  rows: { campaignId: string; name: string; status: string; spend: number }[],
): { isStale: false; rows: typeof rows; capturedAt: string; level: "campaign"; clientId: string; customerId: string; rowCount: number; ageMinutes: number } {
  return {
    isStale: false,
    rows: rows as never,
    capturedAt: new Date().toISOString(),
    level: "campaign" as const,
    clientId: "42",
    customerId: "6591013898",
    rowCount: rows.length,
    ageMinutes: 0,
  };
}

/** A stale snapshot — isStale: true. */
function staleSnapshot(
  rows: { campaignId: string; name: string; status: string; spend: number }[],
): { isStale: true; rows: typeof rows; capturedAt: string; level: "campaign"; clientId: string; customerId: string; rowCount: number; ageMinutes: number } {
  return {
    isStale: true,
    rows: rows as never,
    capturedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    level: "campaign" as const,
    clientId: "42",
    customerId: "6591013898",
    rowCount: rows.length,
    ageMinutes: 25 * 60,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("getSpendPacerStatus", () => {
  let payload: MockPayload;
  let args: GetSpendPacerStatusArgs;

  beforeEach(() => {
    payload = makePayload();
    args = { clientId: 42, currentDayOfMonth: 15, daysInMonth: 31 };
    vi.clearAllMocks();
    vi.mocked(getCampaignSnapshot).mockReset();
  });

  it("returns null when client cannot be loaded (findByID rejects)", async () => {
    payload.findByID.mockRejectedValue(new Error("not found"));

    const result = await getSpendPacerStatus(payload as never, args);

    expect(result).toBeNull();
  });

  it("returns null when client has no spend policy", async () => {
    // getAccountHealthContract returns hasPolicy: false for this shape
    payload.findByID.mockResolvedValue({
      id: 42,
      spendPolicy: {},
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });

    const result = await getSpendPacerStatus(payload as never, args);

    expect(result).toBeNull();
  });

  it("returns null when no campaign snapshot exists for client", async () => {
    payload.findByID.mockResolvedValue({
      id: 42,
      spendPolicy: { pacingMode: "fixed_monthly", monthlyBudgetTarget: 10_000 },
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });
    // getCampaignSnapshot is a mock — default return after mockReset is undefined.
    // getSpendPacerStatus checks `if (!snapshot) return null` → null ✓

    const result = await getSpendPacerStatus(payload as never, args);

    expect(result).toBeNull();
  });

  it("returns null when campaign snapshot is stale", async () => {
    payload.findByID.mockResolvedValue({
      id: 42,
      spendPolicy: { pacingMode: "fixed_monthly", monthlyBudgetTarget: 10_000 },
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });

    vi.mocked(getCampaignSnapshot).mockResolvedValue(
      staleSnapshot([
        { campaignId: "1", name: "Test", status: "ENABLED", spend: 100 },
      ]),
    );

    const result = await getSpendPacerStatus(payload as never, {
      ...args,
      staleAfterMinutes: 60,
    });

    expect(result).toBeNull();
  });

  it("returns SpendPaceStatus on the happy path", async () => {
    payload.findByID.mockResolvedValue({
      id: 42,
      spendPolicy: {
        pacingMode: "fixed_monthly",
        monthlyBudgetTarget: 10_000,
        acceptableVariancePercentLow: 90,
        acceptableVariancePercentHigh: 105,
      },
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });

    vi.mocked(getCampaignSnapshot).mockResolvedValue(
      freshSnapshot([
        { campaignId: "1", name: "Test", status: "ENABLED", spend: 5_000 },
      ]),
    );

    const result = await getSpendPacerStatus(payload as never, args);

    expect(result).not.toBeNull();
    expect(result!.state).toBeDefined();
    expect(result!.monthlyBudgetMicros).toBe(10_000 * 1_000_000);
    expect(result!.actualSpendMicros).toBe(5_000 * 1_000_000);
    expect(typeof result!.pacePercent).toBe("number");
    expect(typeof result!.canReduceSpend).toBe("boolean");
    expect(typeof result!.canIncreaseSpend).toBe("boolean");
  });

  it("calls getCampaignSnapshot with the correct clientId and staleness", async () => {
    payload.findByID.mockResolvedValue({
      id: 99,
      spendPolicy: { pacingMode: "fixed_monthly", monthlyBudgetTarget: 10_000 },
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });

    vi.mocked(getCampaignSnapshot).mockResolvedValue(
      freshSnapshot([
        { campaignId: "1", name: "Test", status: "ENABLED", spend: 2_000 },
      ]),
    );

    await getSpendPacerStatus(payload as never, {
      clientId: 99,
      currentDayOfMonth: 15,
      daysInMonth: 31,
      staleAfterMinutes: 60,
    });

    expect(vi.mocked(getCampaignSnapshot)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ clientId: 99, staleAfterMinutes: 60 }),
    );
  });

  it("sums spend across multiple campaign rows", async () => {
    payload.findByID.mockResolvedValue({
      id: 42,
      spendPolicy: {
        pacingMode: "fixed_monthly",
        monthlyBudgetTarget: 10_000,
        acceptableVariancePercentLow: 90,
        acceptableVariancePercentHigh: 105,
      },
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });

    vi.mocked(getCampaignSnapshot).mockResolvedValue(
      freshSnapshot([
        { campaignId: "1", name: "Campaign A", status: "ENABLED", spend: 1_000 },
        { campaignId: "2", name: "Campaign B", status: "ENABLED", spend: 2_000 },
        { campaignId: "3", name: "Campaign C", status: "ENABLED", spend: 500 },
      ]),
    );

    const result = await getSpendPacerStatus(payload as never, args);

    // Total spend = $1,000 + $2,000 + $500 = $3,500
    expect(result!.actualSpendMicros).toBe(3_500 * 1_000_000);
  });

  it("skips campaign rows with undefined spend", async () => {
    payload.findByID.mockResolvedValue({
      id: 42,
      spendPolicy: { pacingMode: "fixed_monthly", monthlyBudgetTarget: 10_000 },
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });

    vi.mocked(getCampaignSnapshot).mockResolvedValue(
      freshSnapshot([
        { campaignId: "1", name: "Campaign A", status: "ENABLED", spend: 1_000 },
        { campaignId: "2", name: "Campaign B", status: "ENABLED", spend: undefined as unknown as number },
        { campaignId: "3", name: "Campaign C", status: "ENABLED", spend: 500 },
      ]),
    );

    const result = await getSpendPacerStatus(payload as never, args);

    // Only $1,000 + $500 = $1,500 counted
    expect(result!.actualSpendMicros).toBe(1_500 * 1_000_000);
  });

  it("passes custom currentDayOfMonth and daysInMonth to computeSpendPaceStatus", async () => {
    payload.findByID.mockResolvedValue({
      id: 42,
      spendPolicy: { pacingMode: "fixed_monthly", monthlyBudgetTarget: 10_000 },
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });

    vi.mocked(getCampaignSnapshot).mockResolvedValue(
      freshSnapshot([
        { campaignId: "1", name: "Test", status: "ENABLED", spend: 5_000 },
      ]),
    );

    const result = await getSpendPacerStatus(payload as never, {
      clientId: 42,
      currentDayOfMonth: 1,
      daysInMonth: 28,
    });

    expect(result!.currentDayOfMonth).toBe(1);
    expect(result!.daysInMonth).toBe(28);
  });

  it("handles null pacingMode from contract gracefully", async () => {
    payload.findByID.mockResolvedValue({
      id: 42,
      spendPolicy: {
        pacingMode: null,
        monthlyBudgetTarget: 10_000,
        acceptableVariancePercentLow: 90,
        acceptableVariancePercentHigh: 105,
      },
      protectedCampaignIds: [],
      brandCampaignIds: [],
    });

    vi.mocked(getCampaignSnapshot).mockResolvedValue(
      freshSnapshot([
        { campaignId: "1", name: "Test", status: "ENABLED", spend: 5_000 },
      ]),
    );

    const result = await getSpendPacerStatus(payload as never, args);

    expect(result).not.toBeNull();
    expect(result!.state).toBeDefined();
  });

  it("never throws — returns null on unexpected errors", async () => {
    payload.findByID.mockRejectedValue(new Error("unexpected db error"));

    // Should not throw — returns null instead
    const result = await getSpendPacerStatus(payload as never, args);

    expect(result).toBeNull();
  });
});
