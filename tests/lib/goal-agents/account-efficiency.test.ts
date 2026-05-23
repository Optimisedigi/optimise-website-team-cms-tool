/**
 * Unit tests for the pure functions exported by the account-efficiency goal
 * handler. These tests deliberately exercise only the pure compute layer —
 * no Payload, no HTTP, no scheduler. The full state-machine integration is
 * covered separately once the agent is wired to a real client.
 */
import { describe, it, expect } from "vitest";

import {
  computeVerdict,
  detectBudgetShift,
  detectAdGroupPauses,
  detectKeywordPauses,
  detectBidAdjustments,
  detectStrategyMismatches,
  type AccountEfficiencyParameters,
  type DetectBudgetShiftArgs,
} from "@/lib/goal-agents/goal-types/account-efficiency";
import type { AdGroupSnapshotRow, CampaignSnapshotRow, KeywordSnapshotRow } from "@/lib/google-ads-snapshots/types";

// ─── Fixture factories ─────────────────────────────────────────────────────

function defaultParameters(
  overrides?: Partial<AccountEfficiencyParameters>,
): AccountEfficiencyParameters {
  return {
    optimisationMetric: "cpa",
    targetImprovementPercent: 15,
    bufferTolerancePercent: 5,
    observationDays: 28,
    campaignWindowDays: 7,
    measurementDays: 14,
    maxDonorReductionPercent: 30,
    bidUpliftStep: 15,
    minDailyBudgetFloor: 5,
    minAdGroupSpend: 200,
    minKeywordSpend: 100,
    minConvertingAdGroupConversions: 5,
    maxTargetCpaUpliftPercent: 15,
    maxTargetRoasReductionPercent: 10,
    enabledLevers: ["budget_shift"],
    ...overrides,
  };
}

/**
 * The detector infers oldDailyBudget from `spend / campaignWindowDays`. We
 * generate spend that targets a specific intended daily budget so the test
 * assertions can express dollar amounts directly.
 */
function row(args: {
  campaignId: string;
  name?: string;
  dailyBudget: number;
  windowDays?: number;
  conversions: number;
  searchBudgetLostIS?: number;
  searchRankLostIS?: number;
  status?: string;
}): CampaignSnapshotRow {
  const windowDays = args.windowDays ?? 7;
  const spend = args.dailyBudget * windowDays;
  const row: CampaignSnapshotRow = {
    campaignId: args.campaignId,
    name: args.name ?? `Campaign ${args.campaignId}`,
    status: args.status ?? "ENABLED",
    spend,
    clicks: 0,
    impressions: 0,
    conversions: args.conversions,
    ctr: 0,
    cpa: args.conversions > 0 ? spend / args.conversions : null,
  };
  if (args.searchBudgetLostIS !== undefined) row.searchBudgetLostIS = args.searchBudgetLostIS;
  if (args.searchRankLostIS !== undefined) row.searchRankLostIS = args.searchRankLostIS;
  return row;
}

function detectArgs(
  campaignRows: CampaignSnapshotRow[],
  overrides?: Partial<DetectBudgetShiftArgs>,
): DetectBudgetShiftArgs {
  return {
    campaignRows,
    parameters: defaultParameters(),
    brandCampaignIds: [],
    protectedCampaignIds: [],
    snapshotCapturedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── Group 1 — detectBudgetShift happy path ────────────────────────────────

describe("detectBudgetShift — happy path", () => {
  it("proposes a shift from the zero-conversion donor to the budget-bound recipient", () => {
    // Donor A: $20/day × 7 days = $140 spend; conv 0. But $140 < $200 donor
    // threshold, so bump to $30/day so spend is $210 — donor qualifies.
    const A = row({
      campaignId: "A",
      name: "A — zero-conv donor",
      dailyBudget: 30,
      conversions: 0,
    });
    // Recipient B: $10/day × 7 = $70 spend, 8 conv, budget-bound.
    const B = row({
      campaignId: "B",
      name: "B — budget-bound recipient",
      dailyBudget: 10,
      conversions: 8,
      searchBudgetLostIS: 25,
      searchRankLostIS: 5,
    });
    // C: 3 conv but budgetLostIS below 10 — neither donor nor recipient.
    const C = row({
      campaignId: "C",
      dailyBudget: 5,
      conversions: 3,
      searchBudgetLostIS: 8,
      searchRankLostIS: 5,
    });
    // D: brand campaign — must be skipped from both lists.
    const D = row({
      campaignId: "D",
      dailyBudget: 30,
      conversions: 0,
    });

    const proposal = detectBudgetShift(
      detectArgs([A, B, C, D], { brandCampaignIds: ["D"] }),
    );

    expect(proposal).not.toBeNull();
    if (!proposal) return;

    expect(proposal.donors).toHaveLength(1);
    expect(proposal.donors[0]!.campaignId).toBe("A");
    expect(proposal.donors[0]!.oldDailyBudget).toBeCloseTo(30, 2);
    // 30% reduction → newDailyBudget = $21, freed = $9.
    expect(proposal.donors[0]!.newDailyBudget).toBeCloseTo(21, 2);
    expect(proposal.donors[0]!.freedDollars).toBeCloseTo(9, 2);

    expect(proposal.recipients).toHaveLength(1);
    expect(proposal.recipients[0]!.campaignId).toBe("B");
    // Single recipient: gets all freed budget.
    expect(proposal.recipients[0]!.gainedDollars).toBeCloseTo(9, 2);
    expect(proposal.recipients[0]!.newDailyBudget).toBeCloseTo(19, 2);

    expect(proposal.totalShiftDollars).toBeCloseTo(9, 2);

    // baselineCpa = sum spend / sum conv across A, B, C (excluding brand D).
    // spend = $30×7 + $10×7 + $5×7 = $315; conv = 0+8+3 = 11.
    // baselineCpa ≈ 28.636…
    expect(proposal.baselineCpa).toBeCloseTo(315 / 11, 2);
    expect(proposal.baselineSpend).toBeCloseTo(315, 2);
    expect(proposal.baselineConversions).toBe(11);

    // No detector-level error.
    expect(proposal.error).toBeUndefined();

    // Apply-handler-shaped arrays both populated.
    expect(proposal.budgetUpdateCampaigns).toHaveLength(2);
    expect(proposal.budgetPushLiveCampaigns).toHaveLength(2);
  });
});

// ─── Group 2 — null when no donors ─────────────────────────────────────────

describe("detectBudgetShift — no donors", () => {
  it("returns null when every cost ≥ $200 campaign also has conversions", () => {
    // A used to be the donor; now it has 5 conversions, disqualifying it.
    const A = row({ campaignId: "A", dailyBudget: 30, conversions: 5 });
    const B = row({
      campaignId: "B",
      dailyBudget: 10,
      conversions: 8,
      searchBudgetLostIS: 25,
      searchRankLostIS: 5,
    });

    const proposal = detectBudgetShift(detectArgs([A, B]));
    expect(proposal).toBeNull();
  });
});

// ─── Group 3 — null when no recipients ─────────────────────────────────────

describe("detectBudgetShift — no recipients", () => {
  it("returns null when no campaign meets recipient criteria", () => {
    const A = row({ campaignId: "A", dailyBudget: 30, conversions: 0 });
    // B's budgetLostIS drops below the 10% threshold.
    const B = row({
      campaignId: "B",
      dailyBudget: 10,
      conversions: 8,
      searchBudgetLostIS: 5,
      searchRankLostIS: 5,
    });

    const proposal = detectBudgetShift(detectArgs([A, B]));
    expect(proposal).toBeNull();
  });

  it("returns null when the only recipient is rank-bound (searchRankLostIS ≥ 20)", () => {
    const A = row({ campaignId: "A", dailyBudget: 30, conversions: 0 });
    const B = row({
      campaignId: "B",
      dailyBudget: 10,
      conversions: 8,
      searchBudgetLostIS: 25,
      searchRankLostIS: 50, // rank-bound, not budget-bound
    });

    const proposal = detectBudgetShift(detectArgs([A, B]));
    expect(proposal).toBeNull();
  });
});

// ─── Group 4 — maxDonorReductionPercent + minDailyBudgetFloor ──────────────

describe("detectBudgetShift — donor reduction caps", () => {
  it("honours maxDonorReductionPercent (50% on $30/day donor frees $15)", () => {
    const A = row({ campaignId: "A", dailyBudget: 30, conversions: 0 });
    const B = row({
      campaignId: "B",
      dailyBudget: 10,
      conversions: 8,
      searchBudgetLostIS: 25,
      searchRankLostIS: 5,
    });

    const proposal = detectBudgetShift(
      detectArgs([A, B], {
        parameters: defaultParameters({ maxDonorReductionPercent: 50 }),
      }),
    );

    expect(proposal).not.toBeNull();
    if (!proposal) return;
    expect(proposal.donors[0]!.newDailyBudget).toBeCloseTo(15, 2);
    expect(proposal.donors[0]!.freedDollars).toBeCloseTo(15, 2);
  });

  it("honours minDailyBudgetFloor (donor $6/day, 30%, floor $5 → freed $1)", () => {
    // To qualify as a donor we still need ≥$200 spend in window. Build a
    // donor whose daily budget infers from cost: with windowDays=30 (above
    // any default), $6/day × 30 = $180 < $200 — fails. Use windowDays=40:
    // $6 × 40 = $240 ≥ $200.
    const A = row({
      campaignId: "A",
      dailyBudget: 6,
      windowDays: 40,
      conversions: 0,
    });
    const B = row({
      campaignId: "B",
      dailyBudget: 10,
      windowDays: 40,
      conversions: 8,
      searchBudgetLostIS: 25,
      searchRankLostIS: 5,
    });

    const proposal = detectBudgetShift(
      detectArgs([A, B], {
        parameters: defaultParameters({
          campaignWindowDays: 40,
          minDailyBudgetFloor: 5,
          maxDonorReductionPercent: 30,
        }),
      }),
    );

    expect(proposal).not.toBeNull();
    if (!proposal) return;
    // Desired new = $6 × (1 - 0.30) = $4.20 → clamped up to floor $5.
    expect(proposal.donors[0]!.newDailyBudget).toBeCloseTo(5, 2);
    expect(proposal.donors[0]!.freedDollars).toBeCloseTo(1, 2);
  });
});

// ─── Group 5 — brand + protected exclusion ─────────────────────────────────

describe("detectBudgetShift — brand and protected campaigns", () => {
  it("filters out brand AND protected campaigns from donor and recipient lists", () => {
    // Two donor-eligible: one brand, one protected.
    const A = row({ campaignId: "A", dailyBudget: 30, conversions: 0 });
    const B = row({ campaignId: "B", dailyBudget: 30, conversions: 0 });
    // Two recipient-eligible: one brand, one protected.
    const C = row({
      campaignId: "C",
      dailyBudget: 10,
      conversions: 8,
      searchBudgetLostIS: 25,
      searchRankLostIS: 5,
    });
    const D = row({
      campaignId: "D",
      dailyBudget: 10,
      conversions: 8,
      searchBudgetLostIS: 25,
      searchRankLostIS: 5,
    });

    const proposal = detectBudgetShift(
      detectArgs([A, B, C, D], {
        brandCampaignIds: ["A", "C"],
        protectedCampaignIds: ["B", "D"],
      }),
    );
    expect(proposal).toBeNull();
  });
});

describe("remaining account-efficiency detectors", () => {
  const campaign: CampaignSnapshotRow = {
    campaignId: "C1",
    name: "Search",
    status: "ENABLED",
    spend: 1000,
    clicks: 100,
    impressions: 1000,
    conversions: 20,
    ctr: 10,
    cpa: 50,
    searchBudgetLostIS: 5,
    searchRankLostIS: 10,
    bidStrategy: "target_cpa",
    targetCpaMicros: 50_000_000,
  };
  const adGroup: AdGroupSnapshotRow = {
    campaignId: "C1",
    adGroupId: "A1",
    name: "Generic",
    status: "ENABLED",
    spend: 250,
    conversions: 0,
    searchRankLostIS: 35,
  };

  it("detectAdGroupPauses stands down when conversion tracking maturity is missing", () => {
    expect(detectAdGroupPauses({
      adGroupRows: [adGroup],
      campaignRows: [campaign],
      parameters: defaultParameters({ enabledLevers: ["ad_group_pause"] }),
      brandCampaignIds: [],
      protectedCampaignIds: [],
      conversionTrackingEnabledFrom: null,
      now: new Date("2026-06-01T00:00:00Z"),
    })).toHaveLength(0);
  });

  it("detectAdGroupPauses emits approval-required pause proposals for mature zero-conversion ad groups", () => {
    const proposals = detectAdGroupPauses({
      adGroupRows: [adGroup],
      campaignRows: [campaign],
      parameters: defaultParameters({ enabledLevers: ["ad_group_pause"] }),
      brandCampaignIds: [],
      protectedCampaignIds: [],
      conversionTrackingEnabledFrom: "2026-04-01T00:00:00Z",
      now: new Date("2026-06-01T00:00:00Z"),
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.actionType).toBe("ad-group-pause");
    expect(proposals[0]!.payload.guardrailOverrides).toContain("hard_approval_lock");
  });

  it("detectKeywordPauses filters brand keywords and proposes generic zero-conversion keywords", () => {
    const rows: KeywordSnapshotRow[] = [
      { campaignId: "C1", adGroupId: "A1", keywordId: "K1", text: "acme plumbing", matchType: "PHRASE", spend: 500, conversions: 0 },
      { campaignId: "C1", adGroupId: "A1", keywordId: "K2", text: "emergency plumber", matchType: "PHRASE", spend: 150, conversions: 0 },
    ];
    const proposals = detectKeywordPauses({
      keywordRows: rows,
      adGroupRows: [adGroup],
      campaignRows: [campaign],
      parameters: defaultParameters({ enabledLevers: ["keyword_pause"] }),
      brandCampaignIds: [],
      protectedCampaignIds: [],
      brandKeywords: ["acme"],
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.payload.keywordText).toBe("emergency plumber");
  });

  it("detectBidAdjustments emits capped target CPA updates for rank-lost efficient ad groups", () => {
    const proposals = detectBidAdjustments({
      adGroupRows: [{ ...adGroup, conversions: 10, spend: 300, searchRankLostIS: 35 }],
      campaignRows: [campaign],
      parameters: defaultParameters({ enabledLevers: ["bid_adjust"], maxTargetCpaUpliftPercent: 10 }),
      brandCampaignIds: [],
      protectedCampaignIds: [],
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.actionType).toBe("campaign-target-cpa-update");
    expect(proposals[0]!.payload.newTargetCpaMicros).toBe(55_000_000);
  });

  it("detectStrategyMismatches emits proposal-only strategy alerts", () => {
    const proposals = detectStrategyMismatches({
      campaignRows: [{ ...campaign, bidStrategy: "maximize_clicks", conversions: 8 }],
      parameters: defaultParameters({ enabledLevers: ["strategy_alert"] }),
      brandCampaignIds: [],
      protectedCampaignIds: [],
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.actionType).toBe("campaign-bid-strategy-change");
    expect(proposals[0]!.payload.proposalOnly).toBe(true);
  });
});

// ─── Group 6 — computeVerdict band boundaries ──────────────────────────────

describe("computeVerdict — band boundaries", () => {
  const target = 15;
  const buffer = 5;

  it("returns target_met at exactly 15% improvement", () => {
    const v = computeVerdict({
      baselineCpa: 100,
      currentCpa: 85,
      targetImprovementPercent: target,
      bufferTolerancePercent: buffer,
    });
    expect(v.verdict).toBe("target_met");
    expect(v.improvementPercent).toBeCloseTo(15, 2);
    expect(v.regressed).toBe(false);
  });

  it("returns partial_success just below the target band", () => {
    const v = computeVerdict({
      baselineCpa: 100,
      currentCpa: 85.01,
      targetImprovementPercent: target,
      bufferTolerancePercent: buffer,
    });
    expect(v.verdict).toBe("partial_success");
    expect(v.regressed).toBe(false);
  });

  it("returns partial_success at exactly 5% improvement (buffer boundary inclusive)", () => {
    const v = computeVerdict({
      baselineCpa: 100,
      currentCpa: 95,
      targetImprovementPercent: target,
      bufferTolerancePercent: buffer,
    });
    expect(v.verdict).toBe("partial_success");
    expect(v.improvementPercent).toBeCloseTo(5, 2);
  });

  it("returns marginal just below the buffer band", () => {
    const v = computeVerdict({
      baselineCpa: 100,
      currentCpa: 95.01,
      targetImprovementPercent: target,
      bufferTolerancePercent: buffer,
    });
    expect(v.verdict).toBe("marginal");
    expect(v.regressed).toBe(false);
  });

  it("returns no_improvement with regressed=true at 0% (no change)", () => {
    const v = computeVerdict({
      baselineCpa: 100,
      currentCpa: 100,
      targetImprovementPercent: target,
      bufferTolerancePercent: buffer,
    });
    expect(v.verdict).toBe("no_improvement");
    expect(v.improvementPercent).toBeCloseTo(0, 2);
    expect(v.regressed).toBe(true);
  });

  it("returns no_improvement with regressed=true when CPA got worse", () => {
    const v = computeVerdict({
      baselineCpa: 100,
      currentCpa: 110,
      targetImprovementPercent: target,
      bufferTolerancePercent: buffer,
    });
    expect(v.verdict).toBe("no_improvement");
    expect(v.improvementPercent).toBeCloseTo(-10, 2);
    expect(v.regressed).toBe(true);
  });

  it("handles baselineCpa = 0 by returning no_improvement, regressed=false", () => {
    const v = computeVerdict({
      baselineCpa: 0,
      currentCpa: 50,
      targetImprovementPercent: target,
      bufferTolerancePercent: buffer,
    });
    expect(v.verdict).toBe("no_improvement");
    expect(v.regressed).toBe(false);
  });
});
