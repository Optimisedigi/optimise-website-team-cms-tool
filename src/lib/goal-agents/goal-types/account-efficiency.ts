/**
 * Goal type: account-efficiency
 *
 * Improves account-wide CPA (and later ROAS) by pulling up to four levers in
 * concert. This module ships **Lever 1 only** — Budget shift between Google
 * Ads campaigns. Levers 2-5 (ad-group pause, keyword pause, bid adjust,
 * strategy alert) are scoped to later tasks; their detector functions and
 * `enabledLevers` filtering are intentionally absent here so that incomplete
 * code can't accidentally fire.
 *
 * Plan: .gg/plans/budget-reallocation-goal-agent.md
 * Reference handler: ./search-term-waste-reducer.ts
 *
 * Lifecycle (mirrors the standard goal-runtime state machine):
 *
 *   awaiting_data → analysing → pending_approval → executing → measuring → complete
 *                         ↘ executing → measuring → complete   (when zero actionable proposals)
 *                                                           ↘ analysing (loop, partial_success)
 *
 * State-machine choice for the "no candidates" case:
 *   `analysing → complete` is NOT a legal transition. When the detector finds
 *   no actionable budget shift we walk `analysing → executing → measuring →
 *   complete` in a single tick by calling `markGoalRunStatus` three times.
 *   This is preferred over routing through `blocked`/`failed` because no human
 *   intervention is needed — a clean account is success, not a problem.
 *
 * Pure module: no LLM, no HTTP. All side-effects go through the injected
 * Payload instance and the apply-dispatcher. The pure detector + verdict
 * functions are exported so unit tests can exercise them without Payload.
 */

import type { Payload } from "payload";

import {
  recordGoalRunSnapshot,
  markGoalRunStatus,
  attachMeasurement,
  type GoalRunStatus,
  type RiskTier,
} from "../goal-run-audit";
import {
  checkRiskTier,
  type TierDefinition,
  type RiskTierLevel,
} from "../check-risk-tier";
import {
  getAccountHealthContract,
  isBrandCampaign,
  isCampaignProtected,
  type AccountHealthContract,
} from "../account-health-contract";
import {
  getCampaignSnapshot,
  getAllLatestForClient,
  type CampaignSnapshotRow,
  type AdGroupSnapshotRow,
  type KeywordSnapshotRow,
} from "../../google-ads-snapshots";
import {
  dispatchApply,
  type ApplyHandlerResult,
} from "../../agents/_shared/apply-dispatcher";

// ─── Module identifier ─────────────────────────────────────────────────────

export const GOAL_KEY = "account-efficiency";

// ─── Public context + return types ─────────────────────────────────────────

/**
 * Minimal subset of the goal-runs row this handler reads. We deliberately
 * narrow rather than importing the Payload-generated GoalRun so tests can
 * build fixtures without satisfying every CMS-only field.
 */
export interface GoalRunDoc {
  id: number;
  goal: string;
  status: GoalRunStatus;
  client: number;
  iterationsCount: number;
  coolingOffUntil?: string | null;
  nextCheckAt?: string | null;
  /**
   * Per-run knobs supplied at create time. Stored as JSON on the goal-runs
   * row; shape validated lazily in `loadParameters()` with defaults filled
   * in for any missing key.
   */
  parameters?: Record<string, unknown> | null;
}

export interface AccountEfficiencyContext {
  payload: Payload;
  goalRun: GoalRunDoc;
  clientId: number;
  now: Date;
}

/**
 * What `tick()` returns to the scheduler. The scheduler persists
 * `nextCheckAt` and `coolingOffUntil` on the goal-runs row; the handler only
 * computes them. Identical shape to search-term-waste-reducer's TickResult.
 */
export interface TickResult {
  /** Status the goal-run is now in (may equal the prior status). */
  status: GoalRunStatus;
  /** When the scheduler should re-tick this run. ISO string. */
  nextCheckAt: string;
  /** Earliest time the next mutation may run. ISO string. Null = unchanged. */
  coolingOffUntil?: string | null;
  /** Set when iterationsCount changed (measuring → analysing loop). */
  iterationsCount?: number;
  /** Free-form summary for activity log / debugging. */
  note?: string;
}

// ─── Parameters ────────────────────────────────────────────────────────────

/** Levers the agent can fire. Only `budget_shift` is wired in this module. */
export type AccountEfficiencyLever =
  | "budget_shift"
  | "ad_group_pause"
  | "keyword_pause"
  | "bid_adjust"
  | "strategy_alert";

/** Per-goal-run settings. See plan §"Per-goal-run settings" for semantics. */
export interface AccountEfficiencyParameters {
  optimisationMetric: "cpa";
  targetImprovementPercent: number;
  bufferTolerancePercent: number;
  observationDays: number;
  campaignWindowDays: number;
  measurementDays: number;
  maxDonorReductionPercent: number;
  bidUpliftStep: number;
  minDailyBudgetFloor: number;
  minAdGroupSpend: number;
  minKeywordSpend: number;
  minConvertingAdGroupConversions: number;
  maxTargetCpaUpliftPercent: number;
  maxTargetRoasReductionPercent: number;
  enabledLevers: AccountEfficiencyLever[];
  includedCampaignIds?: string[];
  excludedCampaignIds?: string[];
}

const DEFAULT_PARAMETERS: AccountEfficiencyParameters = Object.freeze({
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
  enabledLevers: Object.freeze(["budget_shift"]) as AccountEfficiencyLever[],
}) as AccountEfficiencyParameters;

// ─── Constants (tunable defaults) ──────────────────────────────────────────

/** Re-poll for a fresh snapshot every 6h while awaiting_data. */
const AWAITING_DATA_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** Re-poll for an approval decision every 6h. */
const PENDING_APPROVAL_BACKOFF_MS = 6 * 60 * 60 * 1000;
/** Snapshot must be fresher than 24h to be usable. */
const SNAPSHOT_STALE_AFTER_MINUTES = 1440;
/** Hard cap on observe→act→measure loops before we declare done. */
const MAX_ITERATIONS = 3;
/** Donor candidacy: cost in window must reach this floor to qualify. */
const DONOR_MIN_SPEND_DOLLARS = 200;
/** Recipient candidacy: conversions in window must reach this floor. */
const RECIPIENT_MIN_CONVERSIONS = 5;
/** Recipient candidacy: searchBudgetLostIS must exceed this percent. */
const RECIPIENT_MIN_BUDGET_LOST_IS = 10;
/** Recipient candidacy: searchRankLostIS must be below this percent. */
const RECIPIENT_MAX_RANK_LOST_IS = 20;
/** Floating-point tolerance for the daily-budget conservation check. */
const SHIFT_CONSERVATION_TOLERANCE = 0.01;

// ─── Entry point ───────────────────────────────────────────────────────────

/**
 * Single entry point the scheduler invokes. Dispatches on `goalRun.status`.
 * Returns the next state + when to re-tick.
 */
export async function tick(ctx: AccountEfficiencyContext): Promise<TickResult> {
  switch (ctx.goalRun.status) {
    case "awaiting_data":
      return handleAwaitingData(ctx);
    case "analysing":
      return handleAnalysing(ctx);
    case "pending_approval":
      return handlePendingApproval(ctx);
    case "executing":
      return handleExecuting(ctx);
    case "measuring":
      return handleMeasuring(ctx);
    case "complete":
    case "failed":
      // Terminal — scheduler should not invoke us, but be defensive.
      return {
        status: ctx.goalRun.status,
        nextCheckAt: ctx.now.toISOString(),
        note: `Goal run is terminal (${ctx.goalRun.status}); no-op.`,
      };
    case "blocked":
      // The blocked state is recovered manually — caller resumes by writing
      // status back to "analysing". Don't auto-recover here.
      return {
        status: "blocked",
        nextCheckAt: new Date(ctx.now.getTime() + AWAITING_DATA_BACKOFF_MS).toISOString(),
        note: "Blocked — waiting for manual resume.",
      };
    default:
      // Exhaustiveness fallback.
      throw new Error(`account-efficiency: unhandled status "${ctx.goalRun.status}"`);
  }
}

// ─── Pure: parameter loading ───────────────────────────────────────────────

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string" && v.trim() !== "") out.push(v.trim());
  }
  return out.length > 0 ? out : undefined;
}

function asLeverArray(value: unknown): AccountEfficiencyLever[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const valid: ReadonlyArray<AccountEfficiencyLever> = [
    "budget_shift",
    "ad_group_pause",
    "keyword_pause",
    "bid_adjust",
    "strategy_alert",
  ];
  const out: AccountEfficiencyLever[] = [];
  for (const v of value) {
    if (typeof v === "string" && (valid as ReadonlyArray<string>).includes(v)) {
      out.push(v as AccountEfficiencyLever);
    }
  }
  return out.length > 0 ? out : undefined;
}

function loadParameters(raw: unknown): AccountEfficiencyParameters {
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
  const included = asStringArray(r.includedCampaignIds);
  const excluded = asStringArray(r.excludedCampaignIds);
  const params: AccountEfficiencyParameters = {
    optimisationMetric: "cpa",
    targetImprovementPercent: asNumber(r.targetImprovementPercent, DEFAULT_PARAMETERS.targetImprovementPercent),
    bufferTolerancePercent: asNumber(r.bufferTolerancePercent, DEFAULT_PARAMETERS.bufferTolerancePercent),
    observationDays: asNumber(r.observationDays, DEFAULT_PARAMETERS.observationDays),
    campaignWindowDays: asNumber(r.campaignWindowDays, DEFAULT_PARAMETERS.campaignWindowDays),
    measurementDays: asNumber(r.measurementDays, DEFAULT_PARAMETERS.measurementDays),
    maxDonorReductionPercent: asNumber(r.maxDonorReductionPercent, DEFAULT_PARAMETERS.maxDonorReductionPercent),
    bidUpliftStep: asNumber(r.bidUpliftStep, DEFAULT_PARAMETERS.bidUpliftStep),
    minDailyBudgetFloor: asNumber(r.minDailyBudgetFloor, DEFAULT_PARAMETERS.minDailyBudgetFloor),
    minAdGroupSpend: asNumber(r.minAdGroupSpend, DEFAULT_PARAMETERS.minAdGroupSpend),
    minKeywordSpend: asNumber(r.minKeywordSpend, DEFAULT_PARAMETERS.minKeywordSpend),
    minConvertingAdGroupConversions: asNumber(
      r.minConvertingAdGroupConversions,
      DEFAULT_PARAMETERS.minConvertingAdGroupConversions,
    ),
    maxTargetCpaUpliftPercent: asNumber(
      r.maxTargetCpaUpliftPercent,
      DEFAULT_PARAMETERS.maxTargetCpaUpliftPercent,
    ),
    maxTargetRoasReductionPercent: asNumber(
      r.maxTargetRoasReductionPercent,
      DEFAULT_PARAMETERS.maxTargetRoasReductionPercent,
    ),
    enabledLevers: asLeverArray(r.enabledLevers) ?? [...DEFAULT_PARAMETERS.enabledLevers],
  };
  if (included) params.includedCampaignIds = included;
  if (excluded) params.excludedCampaignIds = excluded;
  return params;
}

// ─── Pure: verdict ─────────────────────────────────────────────────────────

export type Verdict =
  | "target_met"
  | "partial_success"
  | "marginal"
  | "no_improvement";

export interface VerdictResult {
  verdict: Verdict;
  improvementPercent: number;
  regressed: boolean;
}

/**
 * Plan §"Measurement — what counts as success":
 *   improvement = ((baseline − current) / baseline) × 100
 *   ≥ target → target_met
 *   ≥ buffer → partial_success
 *   > 0      → marginal
 *   ≤ 0      → no_improvement (regressed)
 *
 * For CPA, "improvement" is a *reduction*: a lower current CPA is better.
 * If baselineCpa is 0 or non-finite we can't compute a ratio, so we return
 * `no_improvement` with `regressed: false`.
 */
export function computeVerdict(args: {
  baselineCpa: number;
  currentCpa: number;
  targetImprovementPercent: number;
  bufferTolerancePercent: number;
}): VerdictResult {
  const { baselineCpa, currentCpa, targetImprovementPercent, bufferTolerancePercent } = args;
  if (!Number.isFinite(baselineCpa) || baselineCpa <= 0) {
    return { verdict: "no_improvement", improvementPercent: 0, regressed: false };
  }
  const improvementPercent = ((baselineCpa - currentCpa) / baselineCpa) * 100;
  if (improvementPercent >= targetImprovementPercent) {
    return { verdict: "target_met", improvementPercent, regressed: false };
  }
  if (improvementPercent >= bufferTolerancePercent) {
    return { verdict: "partial_success", improvementPercent, regressed: false };
  }
  if (improvementPercent > 0) {
    return { verdict: "marginal", improvementPercent, regressed: false };
  }
  return { verdict: "no_improvement", improvementPercent, regressed: true };
}

// ─── Pure: budget-shift detector ───────────────────────────────────────────

export interface BudgetShiftDonor {
  campaignId: string;
  campaignName: string;
  oldDailyBudget: number;
  newDailyBudget: number;
  freedDollars: number;
  cost: number;
  conversions: number;
}

export interface BudgetShiftRecipient {
  campaignId: string;
  campaignName: string;
  oldDailyBudget: number;
  newDailyBudget: number;
  gainedDollars: number;
  conversions: number;
  searchBudgetLostIS: number;
  searchRankLostIS: number;
}

/** Item in the budget-update apply handler's `campaigns` array. */
export interface BudgetUpdateCampaign {
  campaignId: string;
  campaignName: string;
  /**
   * Pre-detector placeholder. Final percentage is recomputed at execute time
   * once the audit's monthlyBudget is known (so that the saved CMS row
   * matches the canonical `monthly × % ÷ 30.4 = daily` invariant).
   */
  budgetPercentage: number;
  calculatedDailyBudget: number;
  enabled: boolean;
}

/** Item in the budget-push-live apply handler's `campaigns` array. */
export interface BudgetPushLiveCampaign {
  campaignId: string;
  dailyBudget: number;
}

/**
 * BudgetShiftProposal — the proposedPayload the handler stores on the
 * goal-run-snapshot row. Carries every input the apply step needs so the
 * approval/execute path is a pure read of this object.
 */
export type AccountEfficiencyActionType =
  | "budget-update"
  | "ad-group-pause"
  | "keyword-pause"
  | "campaign-target-cpa-update"
  | "campaign-target-roas-update"
  | "campaign-bid-strategy-change";

export interface AccountEfficiencyProposalEnvelope {
  lever: AccountEfficiencyLever;
  actionType: AccountEfficiencyActionType;
  title: string;
  renderedMarkdown: string;
  riskActionType: string;
  campaignIds: string[];
  budgetImpact: number;
  payload: Record<string, unknown>;
  baseline: Record<string, unknown>;
}

export interface BudgetShiftProposal {
  action: "budget-shift";
  scope: "account";
  donors: BudgetShiftDonor[];
  recipients: BudgetShiftRecipient[];
  totalShiftDollars: number;
  baselineCpa: number;
  baselineSpend: number;
  baselineConversions: number;
  snapshotCapturedAt: string;
  budgetUpdateCampaigns: BudgetUpdateCampaign[];
  budgetPushLiveCampaigns: BudgetPushLiveCampaign[];
  /** Free-form notes (e.g. conservation-check warnings). */
  notes?: string[];
  /** Set if the detector built an inconsistent shift; caller must refuse. */
  error?: string;
}

export interface DetectBudgetShiftArgs {
  campaignRows: ReadonlyArray<CampaignSnapshotRow>;
  parameters: AccountEfficiencyParameters;
  brandCampaignIds: ReadonlyArray<string>;
  protectedCampaignIds: ReadonlyArray<string>;
  snapshotCapturedAt: string;
}

interface DailyBudgetSource {
  /** Daily budget the row carries today. Inferred when not directly stored. */
  oldDailyBudget: number;
}

/**
 * The campaign snapshot stores spend over the snapshot's reporting window,
 * not the current daily budget. We approximate the daily budget from spend
 * over `campaignWindowDays`. This is a stop-gap until the snapshot row
 * carries an explicit `dailyBudget` field; the executing handler will
 * cross-reference the audit's stored daily budget before pushing live.
 */
function inferDailyBudget(row: CampaignSnapshotRow, windowDays: number): DailyBudgetSource {
  const safeWindow = windowDays > 0 ? windowDays : 1;
  const inferred = (row.spend ?? 0) / safeWindow;
  return { oldDailyBudget: inferred > 0 ? inferred : 0 };
}

function isExcluded(campaignId: string, excluded?: ReadonlyArray<string>): boolean {
  if (!excluded || excluded.length === 0) return false;
  const needle = campaignId.trim().toLowerCase();
  for (const id of excluded) {
    if (id.trim().toLowerCase() === needle) return true;
  }
  return false;
}

function isBrandOrProtected(
  campaignId: string,
  brand: ReadonlyArray<string>,
  protectedIds: ReadonlyArray<string>,
): boolean {
  const needle = campaignId.trim().toLowerCase();
  for (const id of brand) if (id.trim().toLowerCase() === needle) return true;
  for (const id of protectedIds) if (id.trim().toLowerCase() === needle) return true;
  return false;
}

/**
 * Pure detector: given a snapshot row set + parameters + brand/protected
 * lists, decide whether a budget shift is worth proposing and, if so, build
 * the full proposal payload. Returns `null` when no shift would be made.
 *
 * Algorithm (plan §"Lever 1 — Budget shift between campaigns"):
 *   1. Filter snapshot rows to enabled campaigns excluding brand/protected/excluded.
 *   2. Donor = cost ≥ $200 AND conversions === 0.
 *   3. Recipient = conversions ≥ 5 AND searchBudgetLostIS > 10 AND searchRankLostIS < 20.
 *   4. Per donor: reduce daily budget by up to maxDonorReductionPercent,
 *      never below minDailyBudgetFloor. Sum freed budget.
 *   5. Distribute freed budget across recipients proportionally to each
 *      recipient's (searchBudgetLostIS/100 × currentDailyBudget).
 *   6. Conservation check: sum(new daily) === sum(old daily) ± $0.01.
 */
export function detectBudgetShift(args: DetectBudgetShiftArgs): BudgetShiftProposal | null {
  const { campaignRows, parameters, brandCampaignIds, protectedCampaignIds, snapshotCapturedAt } = args;

  // Step 1: filter to actionable rows. Enabled campaigns only, exclude brand /
  // protected / explicit deny-list. Allow-list narrows further when set.
  const allowList = parameters.includedCampaignIds && parameters.includedCampaignIds.length > 0
    ? new Set(parameters.includedCampaignIds.map((id) => id.trim().toLowerCase()))
    : null;

  const eligible: CampaignSnapshotRow[] = [];
  for (const row of campaignRows) {
    if (row.status && row.status.toUpperCase() !== "ENABLED") continue;
    if (isBrandOrProtected(row.campaignId, brandCampaignIds, protectedCampaignIds)) continue;
    if (isExcluded(row.campaignId, parameters.excludedCampaignIds)) continue;
    if (allowList && !allowList.has(row.campaignId.trim().toLowerCase())) continue;
    eligible.push(row);
  }

  if (eligible.length === 0) return null;

  // Baseline CPA: sum(spend) / sum(conversions) across the full eligible set.
  // This is the measurement anchor used to compute the verdict 14 days later.
  let baselineSpend = 0;
  let baselineConversions = 0;
  for (const row of eligible) {
    baselineSpend += row.spend ?? 0;
    baselineConversions += row.conversions ?? 0;
  }
  const baselineCpa = baselineConversions > 0 ? baselineSpend / baselineConversions : 0;

  // Step 2 + 3: classify donors and recipients.
  const donorCandidates: Array<{ row: CampaignSnapshotRow; oldDailyBudget: number; cost: number }> = [];
  const recipientCandidates: Array<{
    row: CampaignSnapshotRow;
    oldDailyBudget: number;
    searchBudgetLostIS: number;
    searchRankLostIS: number;
  }> = [];

  for (const row of eligible) {
    const cost = row.spend ?? 0;
    const conv = row.conversions ?? 0;
    const { oldDailyBudget } = inferDailyBudget(row, parameters.campaignWindowDays);

    if (cost >= DONOR_MIN_SPEND_DOLLARS && conv === 0) {
      donorCandidates.push({ row, oldDailyBudget, cost });
      continue;
    }

    const budgetLostIS = row.searchBudgetLostIS;
    const rankLostIS = row.searchRankLostIS;
    if (
      conv >= RECIPIENT_MIN_CONVERSIONS &&
      typeof budgetLostIS === "number" &&
      budgetLostIS > RECIPIENT_MIN_BUDGET_LOST_IS &&
      typeof rankLostIS === "number" &&
      rankLostIS < RECIPIENT_MAX_RANK_LOST_IS
    ) {
      recipientCandidates.push({
        row,
        oldDailyBudget,
        searchBudgetLostIS: budgetLostIS,
        searchRankLostIS: rankLostIS,
      });
    }
  }

  if (donorCandidates.length === 0 || recipientCandidates.length === 0) return null;

  // Step 4: compute donor reductions + freed budget.
  const reductionRatio = Math.max(0, Math.min(100, parameters.maxDonorReductionPercent)) / 100;
  const floor = Math.max(0, parameters.minDailyBudgetFloor);

  const donors: BudgetShiftDonor[] = [];
  let totalFreed = 0;
  for (const d of donorCandidates) {
    const desiredNew = d.oldDailyBudget * (1 - reductionRatio);
    const newDailyBudget = Math.max(floor, desiredNew);
    // If reducing this donor would push it below floor with no headroom, skip.
    if (newDailyBudget >= d.oldDailyBudget) continue;
    const freed = d.oldDailyBudget - newDailyBudget;
    if (freed <= 0) continue;
    donors.push({
      campaignId: d.row.campaignId,
      campaignName: d.row.name,
      oldDailyBudget: d.oldDailyBudget,
      newDailyBudget,
      freedDollars: freed,
      cost: d.cost,
      conversions: d.row.conversions ?? 0,
    });
    totalFreed += freed;
  }

  if (donors.length === 0 || totalFreed <= 0) return null;

  // Step 5: distribute freed budget proportionally to each recipient's
  // (searchBudgetLostIS / 100) × currentDailyBudget. This weighs both the
  // amount of impression share lost AND the size of the campaign — a
  // recipient that's losing 50% IS on a $40/day campaign deserves more than
  // a recipient losing 50% IS on a $5/day campaign.
  const weights = recipientCandidates.map((r) => (r.searchBudgetLostIS / 100) * r.oldDailyBudget);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) return null;

  const recipients: BudgetShiftRecipient[] = recipientCandidates.map((r, i) => {
    const share = (weights[i]! / totalWeight) * totalFreed;
    return {
      campaignId: r.row.campaignId,
      campaignName: r.row.name,
      oldDailyBudget: r.oldDailyBudget,
      newDailyBudget: r.oldDailyBudget + share,
      gainedDollars: share,
      conversions: r.row.conversions ?? 0,
      searchBudgetLostIS: r.searchBudgetLostIS,
      searchRankLostIS: r.searchRankLostIS,
    };
  });

  // Step 6: conservation check.
  const sumOld = donors.reduce((a, d) => a + d.oldDailyBudget, 0) +
    recipients.reduce((a, r) => a + r.oldDailyBudget, 0);
  const sumNew = donors.reduce((a, d) => a + d.newDailyBudget, 0) +
    recipients.reduce((a, r) => a + r.newDailyBudget, 0);
  const drift = Math.abs(sumNew - sumOld);
  const notes: string[] = [];
  let error: string | undefined;
  if (drift > SHIFT_CONSERVATION_TOLERANCE) {
    error = `Daily-budget conservation violated: old=$${sumOld.toFixed(4)} new=$${sumNew.toFixed(4)} drift=$${drift.toFixed(4)} > tolerance=$${SHIFT_CONSERVATION_TOLERANCE.toFixed(2)}`;
  } else if (drift > 0) {
    notes.push(`Conservation drift $${drift.toFixed(4)} within tolerance.`);
  }

  // Build the apply-handler-shaped arrays. budgetPercentage stays as 0 here —
  // the executing handler recomputes it once the audit's monthlyBudget is
  // known (so CMS rows store the canonical monthly × % invariant).
  const budgetUpdateCampaigns: BudgetUpdateCampaign[] = [
    ...donors.map<BudgetUpdateCampaign>((d) => ({
      campaignId: d.campaignId,
      campaignName: d.campaignName,
      budgetPercentage: 0,
      calculatedDailyBudget: d.newDailyBudget,
      enabled: d.newDailyBudget > 0,
    })),
    ...recipients.map<BudgetUpdateCampaign>((r) => ({
      campaignId: r.campaignId,
      campaignName: r.campaignName,
      budgetPercentage: 0,
      calculatedDailyBudget: r.newDailyBudget,
      enabled: r.newDailyBudget > 0,
    })),
  ];

  const budgetPushLiveCampaigns: BudgetPushLiveCampaign[] = [
    ...donors.map<BudgetPushLiveCampaign>((d) => ({
      campaignId: d.campaignId,
      dailyBudget: d.newDailyBudget,
    })),
    ...recipients.map<BudgetPushLiveCampaign>((r) => ({
      campaignId: r.campaignId,
      dailyBudget: r.newDailyBudget,
    })),
  ];

  const proposal: BudgetShiftProposal = {
    action: "budget-shift",
    scope: "account",
    donors,
    recipients,
    totalShiftDollars: totalFreed,
    baselineCpa,
    baselineSpend,
    baselineConversions,
    snapshotCapturedAt,
    budgetUpdateCampaigns,
    budgetPushLiveCampaigns,
  };
  if (notes.length > 0) proposal.notes = notes;
  if (error) proposal.error = error;
  return proposal;
}

// ─── Pure: ad-group pause detector ─────────────────────────────────────────

export interface DetectAdGroupPausesArgs {
  adGroupRows: ReadonlyArray<AdGroupSnapshotRow>;
  campaignRows: ReadonlyArray<CampaignSnapshotRow>;
  parameters: AccountEfficiencyParameters;
  brandCampaignIds: ReadonlyArray<string>;
  protectedCampaignIds: ReadonlyArray<string>;
  conversionTrackingEnabledFrom?: string | null;
  now: Date;
}

export function detectAdGroupPauses(args: DetectAdGroupPausesArgs): AccountEfficiencyProposalEnvelope[] {
  const trackingFrom = args.conversionTrackingEnabledFrom
    ? new Date(args.conversionTrackingEnabledFrom).getTime()
    : Number.NaN;
  const trackingMature = Number.isFinite(trackingFrom) &&
    args.now.getTime() - trackingFrom >= args.parameters.observationDays * 24 * 60 * 60 * 1000;
  if (!trackingMature) return [];

  const campaigns = new Map(args.campaignRows.map((row) => [row.campaignId, row]));
  const proposals: AccountEfficiencyProposalEnvelope[] = [];
  for (const row of args.adGroupRows) {
    if (row.status && row.status.toUpperCase() !== "ENABLED") continue;
    if (!row.adGroupId || !row.campaignId) continue;
    if (isBrandOrProtected(row.campaignId, args.brandCampaignIds, args.protectedCampaignIds)) continue;
    if (isExcluded(row.campaignId, args.parameters.excludedCampaignIds)) continue;
    const parent = campaigns.get(row.campaignId);
    if (!parent || (parent.status && parent.status.toUpperCase() !== "ENABLED")) continue;
    const spend = row.spend ?? 0;
    const conversions = row.conversions ?? 0;
    if (spend < args.parameters.minAdGroupSpend || conversions !== 0) continue;

    const payload = {
      action: "ad-group-pause",
      operation: "pause",
      campaignId: row.campaignId,
      campaignName: parent.name,
      adGroupId: row.adGroupId,
      adGroupName: row.name,
      spend,
      conversions,
      evidenceNote: "Ad-group age is not available in local snapshots; explicit approval is required before pausing.",
      guardrailOverrides: ["hard_approval_lock"],
    };
    proposals.push({
      lever: "ad_group_pause",
      actionType: "ad-group-pause",
      title: `Pause ad group: ${row.name}`,
      renderedMarkdown:
        `**Ad-group pause proposed.**\n\n` +
        `- Campaign: ${parent.name} (${row.campaignId})\n` +
        `- Ad group: ${row.name} (${row.adGroupId})\n` +
        `- Spend: $${spend.toFixed(2)} with 0 conversions\n` +
        `- Requires approval: ad-group age is not available in snapshots.\n`,
      riskActionType: "ad-group-pause",
      campaignIds: [row.campaignId],
      budgetImpact: spend,
      payload,
      baseline: { spend, conversions },
    });
  }
  return proposals;
}

// ─── Pure: keyword pause detector ──────────────────────────────────────────

export interface DetectKeywordPausesArgs {
  keywordRows: ReadonlyArray<KeywordSnapshotRow>;
  adGroupRows: ReadonlyArray<AdGroupSnapshotRow>;
  campaignRows: ReadonlyArray<CampaignSnapshotRow>;
  parameters: AccountEfficiencyParameters;
  brandCampaignIds: ReadonlyArray<string>;
  protectedCampaignIds: ReadonlyArray<string>;
  brandKeywords: ReadonlyArray<string>;
}

function isBrandKeyword(text: string, brandKeywords: ReadonlyArray<string>): boolean {
  const normalised = text.toLowerCase();
  return brandKeywords.some((brand) => {
    const trimmed = brand.trim().toLowerCase();
    return trimmed.length >= 3 && normalised.includes(trimmed);
  });
}

export function detectKeywordPauses(args: DetectKeywordPausesArgs): AccountEfficiencyProposalEnvelope[] {
  const adGroups = new Map(args.adGroupRows.map((row) => [row.adGroupId, row]));
  const campaigns = new Map(args.campaignRows.map((row) => [row.campaignId, row]));
  const proposals: AccountEfficiencyProposalEnvelope[] = [];
  for (const row of args.keywordRows) {
    if (!row.keywordId || !row.adGroupId || !row.campaignId || !row.text.trim()) continue;
    if (isBrandOrProtected(row.campaignId, args.brandCampaignIds, args.protectedCampaignIds)) continue;
    if (isExcluded(row.campaignId, args.parameters.excludedCampaignIds)) continue;
    if (isBrandKeyword(row.text, args.brandKeywords)) continue;
    const parentAdGroup = adGroups.get(row.adGroupId);
    if (!parentAdGroup || (parentAdGroup.status && parentAdGroup.status.toUpperCase() !== "ENABLED")) continue;
    const parentCampaign = campaigns.get(row.campaignId);
    if (!parentCampaign || (parentCampaign.status && parentCampaign.status.toUpperCase() !== "ENABLED")) continue;
    const spend = row.spend ?? 0;
    const conversions = row.conversions ?? 0;
    if (spend < args.parameters.minKeywordSpend || conversions !== 0) continue;

    const payload = {
      action: "keyword-pause",
      operation: "pause",
      campaignId: row.campaignId,
      campaignName: parentCampaign.name,
      adGroupId: row.adGroupId,
      adGroupName: parentAdGroup.name,
      keywordId: row.keywordId,
      keywordText: row.text,
      matchType: row.matchType,
      spend,
      conversions,
      evidenceNote: "Keyword rank/quality diagnostics are not available in local snapshots; explicit approval is required before pausing.",
      guardrailOverrides: ["approval_required_missing_rank_diagnostics"],
    };
    proposals.push({
      lever: "keyword_pause",
      actionType: "keyword-pause",
      title: `Pause keyword: ${row.text}`,
      renderedMarkdown:
        `**Keyword pause proposed.**\n\n` +
        `- Campaign: ${parentCampaign.name} (${row.campaignId})\n` +
        `- Ad group: ${parentAdGroup.name} (${row.adGroupId})\n` +
        `- Keyword: ${row.text} (${row.matchType})\n` +
        `- Spend: $${spend.toFixed(2)} with 0 conversions\n` +
        `- Requires approval: keyword-level rank diagnostics are not available in snapshots.\n`,
      riskActionType: "keyword-pause",
      campaignIds: [row.campaignId],
      budgetImpact: spend,
      payload,
      baseline: { spend, conversions },
    });
  }
  return proposals;
}

// ─── Pure: bid adjustment detector ─────────────────────────────────────────

export interface DetectBidAdjustmentsArgs {
  adGroupRows: ReadonlyArray<AdGroupSnapshotRow>;
  campaignRows: ReadonlyArray<CampaignSnapshotRow>;
  parameters: AccountEfficiencyParameters;
  brandCampaignIds: ReadonlyArray<string>;
  protectedCampaignIds: ReadonlyArray<string>;
}

export function detectBidAdjustments(args: DetectBidAdjustmentsArgs): AccountEfficiencyProposalEnvelope[] {
  const campaigns = new Map(args.campaignRows.map((row) => [row.campaignId, row]));
  const accountSpend = args.campaignRows.reduce((sum, row) => sum + (row.spend ?? 0), 0);
  const accountConversions = args.campaignRows.reduce((sum, row) => sum + (row.conversions ?? 0), 0);
  const accountCpa = accountConversions > 0 ? accountSpend / accountConversions : 0;
  if (accountCpa <= 0) return [];

  const proposals: AccountEfficiencyProposalEnvelope[] = [];
  const proposedCampaignIds = new Set<string>();
  for (const row of args.adGroupRows) {
    if (!row.campaignId || !row.adGroupId) continue;
    if (proposedCampaignIds.has(row.campaignId)) continue;
    if (isBrandOrProtected(row.campaignId, args.brandCampaignIds, args.protectedCampaignIds)) continue;
    if (isExcluded(row.campaignId, args.parameters.excludedCampaignIds)) continue;
    const campaign = campaigns.get(row.campaignId);
    if (!campaign) continue;
    const conversions = row.conversions ?? 0;
    const spend = row.spend ?? 0;
    const adGroupCpa = conversions > 0 ? spend / conversions : Number.POSITIVE_INFINITY;
    if (conversions < args.parameters.minConvertingAdGroupConversions) continue;
    if (adGroupCpa > accountCpa) continue;
    if ((row.searchRankLostIS ?? 0) <= 20) continue;
    if ((campaign.searchBudgetLostIS ?? 100) >= 10) continue;
    if (campaign.bidStrategy !== "target_cpa" && campaign.bidStrategy !== "maximize_conversions") continue;
    if (typeof campaign.targetCpaMicros !== "number" || campaign.targetCpaMicros <= 0) continue;

    const uplift = Math.max(0, Math.min(100, args.parameters.maxTargetCpaUpliftPercent)) / 100;
    const newTargetCpaMicros = Math.round(campaign.targetCpaMicros * (1 + uplift));
    const payload = {
      action: "campaign-target-cpa-update",
      campaignId: campaign.campaignId,
      campaignName: campaign.name,
      expectedBidStrategy: campaign.bidStrategy,
      bidStrategyId: campaign.bidStrategyId,
      currentTargetCpaMicros: campaign.targetCpaMicros,
      newTargetCpaMicros,
      evidenceAdGroupId: row.adGroupId,
      evidenceAdGroupName: row.name,
      evidence: { adGroupCpa, accountCpa, conversions, searchRankLostIS: row.searchRankLostIS },
    };
    proposals.push({
      lever: "bid_adjust",
      actionType: "campaign-target-cpa-update",
      title: `Raise target CPA cap: ${campaign.name}`,
      renderedMarkdown:
        `**Target CPA uplift proposed.**\n\n` +
        `- Campaign: ${campaign.name} (${campaign.campaignId})\n` +
        `- Evidence ad group: ${row.name} (${row.adGroupId})\n` +
        `- Ad-group CPA $${adGroupCpa.toFixed(2)} vs account CPA $${accountCpa.toFixed(2)}\n` +
        `- Rank lost IS: ${(row.searchRankLostIS ?? 0).toFixed(1)}%; campaign budget lost IS: ${(campaign.searchBudgetLostIS ?? 0).toFixed(1)}%\n` +
        `- Target CPA: $${(campaign.targetCpaMicros / 1_000_000).toFixed(2)} → $${(newTargetCpaMicros / 1_000_000).toFixed(2)}\n`,
      riskActionType: "campaign-target-cpa-update",
      campaignIds: [campaign.campaignId],
      budgetImpact: 0,
      payload,
      baseline: { accountCpa, adGroupCpa, currentTargetCpaMicros: campaign.targetCpaMicros },
    });
    proposedCampaignIds.add(row.campaignId);
  }
  return proposals;
}

// ─── Pure: strategy mismatch detector ──────────────────────────────────────

export interface DetectStrategyMismatchesArgs {
  campaignRows: ReadonlyArray<CampaignSnapshotRow>;
  parameters: AccountEfficiencyParameters;
  brandCampaignIds: ReadonlyArray<string>;
  protectedCampaignIds: ReadonlyArray<string>;
}

export function detectStrategyMismatches(args: DetectStrategyMismatchesArgs): AccountEfficiencyProposalEnvelope[] {
  const proposals: AccountEfficiencyProposalEnvelope[] = [];
  for (const campaign of args.campaignRows) {
    if (isBrandOrProtected(campaign.campaignId, args.brandCampaignIds, args.protectedCampaignIds)) continue;
    if (isExcluded(campaign.campaignId, args.parameters.excludedCampaignIds)) continue;
    const conversions = campaign.conversions ?? 0;
    const cpa = campaign.cpa ?? (conversions > 0 ? (campaign.spend ?? 0) / conversions : null);
    let reason: string | null = null;
    if (campaign.bidStrategy === "maximize_clicks" && conversions >= 5) {
      reason = "Campaign has conversion volume but is still on Maximize Clicks.";
    } else if (campaign.bidStrategy === "target_impressions" && conversions > 0 && cpa !== null) {
      reason = "Campaign has CPA performance data but uses Target Impression Share.";
    } else if (campaign.bidStrategy === "manual_cpc" && conversions >= 10) {
      reason = "Campaign has enough conversion volume to consider Smart Bidding instead of Manual CPC.";
    } else if (campaign.bidStrategy === "target_cpa" && typeof campaign.targetCpaMicros === "number" && cpa !== null) {
      const targetCpa = campaign.targetCpaMicros / 1_000_000;
      if (targetCpa > cpa * 1.5) reason = "Target CPA appears loose versus observed CPA.";
    }
    if (!reason) continue;
    const payload = {
      action: "campaign-bid-strategy-change",
      campaignId: campaign.campaignId,
      campaignName: campaign.name,
      currentBidStrategy: campaign.bidStrategy,
      recommendation: reason,
      proposalOnly: true,
      guardrailOverrides: ["hard_approval_lock", "manual_recommendation_only"],
    };
    proposals.push({
      lever: "strategy_alert",
      actionType: "campaign-bid-strategy-change",
      title: `Review bid strategy: ${campaign.name}`,
      renderedMarkdown:
        `**Bid strategy review recommended.**\n\n` +
        `- Campaign: ${campaign.name} (${campaign.campaignId})\n` +
        `- Current strategy: ${campaign.bidStrategy ?? "unknown"}\n` +
        `- Reason: ${reason}\n` +
        `- This is proposal-only and requires a human strategy decision.\n`,
      riskActionType: "campaign-bid-strategy-change",
      campaignIds: [campaign.campaignId],
      budgetImpact: 0,
      payload,
      baseline: { conversions, cpa, bidStrategy: campaign.bidStrategy },
    });
  }
  return proposals;
}

// ─── State: awaiting_data ──────────────────────────────────────────────────

/**
 * Plan §"Gap 1": impression-share data must be present on the campaign
 * snapshot rows before any of this agent's detectors can run. If even one
 * eligible row has `searchImpressionShare === undefined` we treat the
 * prerequisite as missing.
 */
function snapshotHasImpressionShareData(rows: ReadonlyArray<CampaignSnapshotRow>): boolean {
  for (const row of rows) {
    if (typeof row.searchImpressionShare === "number") return true;
  }
  return false;
}

async function walkToComplete(
  ctx: AccountEfficiencyContext,
  reason: string,
  step: number,
  proposedPayload: Record<string, unknown>,
  riskTier: RiskTier = "green",
): Promise<void> {
  // Plan/state-machine: analysing → complete is NOT legal. Walk through
  // executing → measuring → complete so the audit trail records the run
  // reaching the same terminal state without lying about transitions.
  await recordGoalRunSnapshot(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    step,
    action: "budget-shift",
    riskTier,
    status: "approved",
    proposedPayload,
    blockReason: reason,
  });
  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "executing",
  });
  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "measuring",
  });
  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "complete",
    completedAt: ctx.now.toISOString(),
  });
}

async function handleAwaitingData(ctx: AccountEfficiencyContext): Promise<TickResult> {
  const snapshot = await getCampaignSnapshot(ctx.payload, {
    clientId: ctx.clientId,
    staleAfterMinutes: SNAPSHOT_STALE_AFTER_MINUTES,
  });

  if (!snapshot || snapshot.isStale) {
    const nextCheckAt = new Date(ctx.now.getTime() + AWAITING_DATA_BACKOFF_MS).toISOString();
    return {
      status: "awaiting_data",
      nextCheckAt,
      note: snapshot
        ? `Campaign snapshot stale (age ${snapshot.ageMinutes}m); backing off ${AWAITING_DATA_BACKOFF_MS / 3_600_000}h.`
        : "No campaign snapshot for client yet; backing off.",
    };
  }

  // Gap 1 prerequisite: snapshot must carry impression-share data. If the
  // cron hasn't been re-run since the schema enrichment, complete cleanly
  // with a blockReason rather than spinning the run forever.
  if (!snapshotHasImpressionShareData(snapshot.rows)) {
    const step = (await countSnapshotsForRun(ctx.payload, ctx.goalRun.id)) + 1;
    await walkToComplete(
      ctx,
      "impression-share data not yet in snapshots (Gap 1 prerequisite). Wait one snapshot cycle after deploy.",
      step,
      {
        action: "budget-shift",
        scope: "account",
        reason: "missing impression-share data on campaign snapshot",
        snapshotCapturedAt: snapshot.capturedAt,
        rowCount: snapshot.rowCount,
      },
    );
    return {
      status: "complete",
      nextCheckAt: ctx.now.toISOString(),
      note: "Impression-share data missing from snapshot; walked run to complete.",
    };
  }

  // Fresh snapshot with IS data — flip to analysing and re-tick immediately.
  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "analysing",
  });

  return {
    status: "analysing",
    nextCheckAt: ctx.now.toISOString(),
    note: `Fresh campaign snapshot with IS data available (age ${snapshot.ageMinutes}m); transitioning to analysing.`,
  };
}

// ─── State: analysing ──────────────────────────────────────────────────────

async function loadRiskTiers(payload: Payload): Promise<TierDefinition[]> {
  const res = await payload.find({
    // goal-risk-tiers may not be registered in payload.config.ts in every
    // build; cast to bypass the union type. Safe at runtime since the slug
    // matches the collection's `slug:` value in src/collections/GoalRiskTiers.ts.
    collection: "goal-risk-tiers" as never,
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs = res.docs as Array<any>;
  return docs.map((d) => ({
    tier: d.tier as RiskTierLevel,
    maxBudgetImpactDollars:
      typeof d.maxBudgetImpactDollars === "number" ? d.maxBudgetImpactDollars : null,
    allowedActionTypes: Array.isArray(d.allowedActionTypes)
      ? (d.allowedActionTypes as Array<{ actionType?: string }>)
          .map((a) => a?.actionType)
          .filter((s): s is string => typeof s === "string" && s.length > 0)
      : undefined,
    requiresApproval: Boolean(d.requiresApproval),
    autoExecute: Boolean(d.autoExecute),
  }));
}

/** Count snapshots already recorded under this goal-run (used as step #). */
async function countSnapshotsForRun(payload: Payload, goalRunId: number): Promise<number> {
  const res = await payload.find({
    collection: "goal-run-snapshots",
    where: { goalRun: { equals: goalRunId } },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  return typeof res.totalDocs === "number" ? res.totalDocs : res.docs.length;
}

function buildBudgetShiftEnvelope(
  proposal: BudgetShiftProposal,
  parameters: AccountEfficiencyParameters,
): AccountEfficiencyProposalEnvelope {
  const campaignIds = [
    ...proposal.donors.map((d) => d.campaignId),
    ...proposal.recipients.map((r) => r.campaignId),
  ];
  return {
    lever: "budget_shift",
    actionType: "budget-update",
    title: `Budget shift: $${proposal.totalShiftDollars.toFixed(2)}/day across ${campaignIds.length} campaigns`,
    renderedMarkdown:
      `**Budget reallocation proposed.**\n\n` +
      `- Donors: ${proposal.donors.length} campaign(s), freeing $${proposal.totalShiftDollars.toFixed(2)}/day\n` +
      `- Recipients: ${proposal.recipients.length} campaign(s)\n` +
      `- Baseline CPA: ${proposal.baselineCpa > 0 ? `$${proposal.baselineCpa.toFixed(2)}` : "n/a"} (spend $${proposal.baselineSpend.toFixed(2)} / conv ${proposal.baselineConversions})\n` +
      `- Target improvement: ${parameters.targetImprovementPercent}% (buffer ${parameters.bufferTolerancePercent}%)\n`,
    riskActionType: "budget-update",
    campaignIds,
    budgetImpact: proposal.totalShiftDollars,
    payload: proposal as unknown as Record<string, unknown>,
    baseline: {
      baselineCpa: proposal.baselineCpa,
      baselineSpend: proposal.baselineSpend,
      baselineConversions: proposal.baselineConversions,
      snapshotCapturedAt: proposal.snapshotCapturedAt,
    },
  };
}

async function handleAnalysing(ctx: AccountEfficiencyContext): Promise<TickResult> {
  const snapshot = await getCampaignSnapshot(ctx.payload, {
    clientId: ctx.clientId,
    staleAfterMinutes: SNAPSHOT_STALE_AFTER_MINUTES,
  });

  if (!snapshot || snapshot.isStale) {
    // Lost freshness between awaiting_data and analysing — bounce back.
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "awaiting_data",
    });
    return {
      status: "awaiting_data",
      nextCheckAt: new Date(ctx.now.getTime() + AWAITING_DATA_BACKOFF_MS).toISOString(),
      note: "Campaign snapshot vanished or went stale during analysing; back to awaiting_data.",
    };
  }

  const parameters = loadParameters(ctx.goalRun.parameters ?? null);
  const contract: AccountHealthContract | null = await getAccountHealthContract(
    ctx.payload,
    ctx.clientId,
  );
  const brandIds = contract?.brandCampaignIds ?? [];
  const protectedIds = contract?.protectedCampaignIds ?? [];

  // Build brand-or-protected lookup for tier classification later — same
  // contract is consulted for both filter (skip) and tier (escalate). Per
  // the contract this list is normalised already.
  const isBrand = (id: string): boolean =>
    contract ? isBrandCampaign(contract, id) : false;
  const isProtected = (id: string): boolean =>
    contract ? isCampaignProtected(contract, id) : false;

  const stepBase = (await countSnapshotsForRun(ctx.payload, ctx.goalRun.id)) + 1;
  const envelopes: AccountEfficiencyProposalEnvelope[] = [];
  const needsAdGroup = parameters.enabledLevers.some((lever) =>
    lever === "ad_group_pause" || lever === "bid_adjust",
  );
  const needsKeyword = parameters.enabledLevers.includes("keyword_pause");
  const allSnapshots = needsAdGroup || needsKeyword
    ? await getAllLatestForClient(ctx.payload, {
        clientId: ctx.clientId,
        staleAfterMinutes: SNAPSHOT_STALE_AFTER_MINUTES,
      })
    : null;
  const adGroupRows = allSnapshots?.ad_group && !allSnapshots.ad_group.isStale
    ? allSnapshots.ad_group.rows
    : [];
  const keywordRows = allSnapshots?.keyword && !allSnapshots.keyword.isStale
    ? allSnapshots.keyword.rows
    : [];

  if (parameters.enabledLevers.includes("budget_shift")) {
    const proposal = detectBudgetShift({
      campaignRows: snapshot.rows,
      parameters,
      brandCampaignIds: brandIds,
      protectedCampaignIds: protectedIds,
      snapshotCapturedAt: snapshot.capturedAt,
    });

    if (proposal?.error) {
      await recordGoalRunSnapshot(ctx.payload, {
        goalRunId: ctx.goalRun.id,
        step: stepBase,
        action: "budget-shift",
        riskTier: "yellow",
        status: "blocked_by_scope",
        proposedPayload: proposal as unknown as Record<string, unknown>,
        blockReason: proposal.error,
      });
      await markGoalRunStatus(ctx.payload, {
        goalRunId: ctx.goalRun.id,
        status: "failed",
        error: proposal.error,
        completedAt: ctx.now.toISOString(),
      });
      return {
        status: "failed",
        nextCheckAt: ctx.now.toISOString(),
        note: proposal.error,
      };
    }

    if (proposal) envelopes.push(buildBudgetShiftEnvelope(proposal, parameters));
  }

  if (parameters.enabledLevers.includes("ad_group_pause") && adGroupRows.length > 0) {
    envelopes.push(...detectAdGroupPauses({
      adGroupRows,
      campaignRows: snapshot.rows,
      parameters,
      brandCampaignIds: brandIds,
      protectedCampaignIds: protectedIds,
      conversionTrackingEnabledFrom: contract?.spendPolicy.conversionTrackingEnabledFrom ?? null,
      now: ctx.now,
    }));
  }

  if (parameters.enabledLevers.includes("keyword_pause") && adGroupRows.length > 0 && keywordRows.length > 0) {
    envelopes.push(...detectKeywordPauses({
      keywordRows,
      adGroupRows,
      campaignRows: snapshot.rows,
      parameters,
      brandCampaignIds: brandIds,
      protectedCampaignIds: protectedIds,
      brandKeywords: [],
    }));
  }

  if (parameters.enabledLevers.includes("bid_adjust") && adGroupRows.length > 0) {
    envelopes.push(...detectBidAdjustments({
      adGroupRows,
      campaignRows: snapshot.rows,
      parameters,
      brandCampaignIds: brandIds,
      protectedCampaignIds: protectedIds,
    }));
  }

  if (parameters.enabledLevers.includes("strategy_alert")) {
    envelopes.push(...detectStrategyMismatches({
      campaignRows: snapshot.rows,
      parameters,
      brandCampaignIds: brandIds,
      protectedCampaignIds: protectedIds,
    }));
  }

  if (envelopes.length === 0) {
    await walkToComplete(
      ctx,
      "no actionable account-efficiency proposals",
      stepBase,
      {
        action: "account-efficiency",
        scope: "account",
        reason: "no actionable proposals",
        enabledLevers: parameters.enabledLevers,
        snapshotCapturedAt: snapshot.capturedAt,
        snapshotRowCount: snapshot.rowCount,
      },
    );
    return {
      status: "complete",
      nextCheckAt: ctx.now.toISOString(),
      note: "No account-efficiency proposals found; walked to complete.",
    };
  }

  const tiers = await loadRiskTiers(ctx.payload);
  // Lever 1 skips brand/protected at the detector; flag false here so the
  // tier check applies the configured budget-update rule rather than black.
  let queuedApprovals = 0;
  let autoApproved = 0;

  for (let i = 0; i < envelopes.length; i += 1) {
    const envelope = envelopes[i]!;
    const tierResult = checkRiskTier({
      proposal: {
        actionType: envelope.riskActionType,
        budgetImpact: envelope.budgetImpact,
        campaignIds: envelope.campaignIds,
      },
      clientTiers: tiers,
      isBrandCampaign: envelope.campaignIds.some((id) => isBrand(id)),
      isProtectedCampaign: envelope.campaignIds.some((id) => isProtected(id)),
    });

    if (tierResult.escalation === "auto_execute") {
      await recordGoalRunSnapshot(ctx.payload, {
        goalRunId: ctx.goalRun.id,
        step: stepBase + i,
        action: envelope.lever.replaceAll("_", "-"),
        riskTier: tierResult.tier as RiskTier,
        status: "approved",
        proposedPayload: envelope.payload,
      });
      autoApproved += 1;
      continue;
    }

    const approvalRow = (await ctx.payload.create({
      collection: "agent-approval-queue",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        title: envelope.title,
        agentName: GOAL_KEY,
        agentRunId: String(ctx.goalRun.id),
        proposalType: envelope.actionType,
        proposalPayload: envelope.payload,
        status: "pending",
        client: ctx.clientId,
        rendered: { internalMarkdown: envelope.renderedMarkdown },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      overrideAccess: true,
    })) as { id: number };

    await recordGoalRunSnapshot(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      step: stepBase + i,
      action: envelope.lever.replaceAll("_", "-"),
      riskTier: tierResult.tier as RiskTier,
      status: "proposed",
      proposedPayload: envelope.payload,
      approvalId: approvalRow.id,
    });
    queuedApprovals += 1;
  }

  const nextStatus: GoalRunStatus = queuedApprovals > 0 ? "pending_approval" : "executing";
  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: nextStatus,
  });

  return {
    status: nextStatus,
    nextCheckAt: queuedApprovals > 0
      ? new Date(ctx.now.getTime() + PENDING_APPROVAL_BACKOFF_MS).toISOString()
      : ctx.now.toISOString(),
    note: `Created ${envelopes.length} account-efficiency proposal(s): ${autoApproved} auto-approved, ${queuedApprovals} pending approval.`,
  };
}

// ─── State: pending_approval ───────────────────────────────────────────────

interface SnapshotForRun {
  id: number;
  approvalId?: number;
  status?: string;
  action?: string;
}

async function findSnapshotsForRun(
  payload: Payload,
  goalRunId: number,
): Promise<SnapshotForRun[]> {
  const res = await payload.find({
    collection: "goal-run-snapshots",
    where: { goalRun: { equals: goalRunId } },
    sort: "createdAt",
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.docs as Array<any>).map((doc) => {
    const approvalId = typeof doc.approval === "number"
      ? doc.approval
      : typeof doc.approval?.id === "number"
        ? doc.approval.id
        : undefined;
    return {
      id: doc.id as number,
      approvalId,
      status: doc.status as string | undefined,
      action: typeof doc.action === "string" ? doc.action : undefined,
    };
  });
}

async function findLatestSnapshotForRun(
  payload: Payload,
  goalRunId: number,
): Promise<SnapshotForRun | null> {
  const snapshots = await findSnapshotsForRun(payload, goalRunId);
  return snapshots.length > 0 ? snapshots[snapshots.length - 1]! : null;
}

async function handlePendingApproval(ctx: AccountEfficiencyContext): Promise<TickResult> {
  const snapshots = await findSnapshotsForRun(ctx.payload, ctx.goalRun.id);
  const approvalSnapshots = snapshots.filter((s) => typeof s.approvalId === "number");
  if (approvalSnapshots.length === 0) {
    return {
      status: "pending_approval",
      nextCheckAt: new Date(ctx.now.getTime() + PENDING_APPROVAL_BACKOFF_MS).toISOString(),
      note: "No approval rows found yet; waiting.",
    };
  }

  const approvals: Array<{ id: number; status?: string; snapshotId: number }> = [];
  for (const snapshot of approvalSnapshots) {
    const approval = (await ctx.payload.findByID({
      collection: "agent-approval-queue",
      id: snapshot.approvalId!,
      overrideAccess: true,
      depth: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)) as { id: number; status?: string };
    approvals.push({ id: approval.id, status: approval.status, snapshotId: snapshot.id });
  }

  const pending = approvals.filter((a) => a.status !== "approved" && a.status !== "applied" && a.status !== "rejected");
  if (pending.length > 0) {
    return {
      status: "pending_approval",
      nextCheckAt: new Date(ctx.now.getTime() + PENDING_APPROVAL_BACKOFF_MS).toISOString(),
      note: `${pending.length}/${approvals.length} approval row(s) still pending; waiting.`,
    };
  }

  const approved = approvals.filter((a) => a.status === "approved" || a.status === "applied");
  const rejected = approvals.filter((a) => a.status === "rejected");

  for (const rejectedApproval of rejected) {
    await ctx.payload.update({
      collection: "goal-run-snapshots",
      id: rejectedApproval.snapshotId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: "rejected" } as any,
      overrideAccess: true,
    });
  }

  if (approved.length === 0) {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "failed",
      error: "Every account-efficiency proposal was rejected.",
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "failed",
      nextCheckAt: ctx.now.toISOString(),
      note: "All approval rows rejected; goal-run failed.",
    };
  }

  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "executing",
  });
  return {
    status: "executing",
    nextCheckAt: ctx.now.toISOString(),
    note: `${approved.length} approval row(s) approved/applied; ${rejected.length} rejected optional proposal(s); transitioning to executing.`,
  };
}

// ─── State: executing ──────────────────────────────────────────────────────

/**
 * Look up the audit row whose budgets we're going to mutate. The
 * `budget-update` + `budget-push-live` apply handlers both require
 * `auditId`. We use the client's most-recent google-ads-audits row.
 */
async function resolveLatestAuditId(
  payload: Payload,
  clientId: number,
): Promise<{ auditId: number; monthlyBudget: number | null } | null> {
  const res = await payload.find({
    collection: "google-ads-audits",
    where: { client: { equals: clientId } },
    sort: "-createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = res.docs?.[0] as any;
  if (!doc) return null;
  const auditId = typeof doc.id === "number" ? doc.id : Number(doc.id);
  if (!Number.isFinite(auditId)) return null;
  const monthlyBudget = typeof doc.monthlyBudget === "number" ? doc.monthlyBudget : null;
  return { auditId, monthlyBudget };
}

/**
 * Recompute `budgetPercentage` on each campaign_allocations row using the
 * audit's monthlyBudget. The canonical invariant the CMS enforces is
 * `monthly × percent ÷ 30.4 = daily`, so percentage = daily × 30.4 ÷ monthly.
 * When monthlyBudget is unknown we leave percentage at 0 — the handler will
 * still update calculatedDailyBudget, which is what budget-push-live reads.
 */
function finaliseBudgetUpdateCampaigns(
  campaigns: ReadonlyArray<BudgetUpdateCampaign>,
  monthlyBudget: number | null,
): BudgetUpdateCampaign[] {
  if (!monthlyBudget || monthlyBudget <= 0) {
    return campaigns.map((c) => ({ ...c }));
  }
  return campaigns.map((c) => ({
    ...c,
    budgetPercentage: (c.calculatedDailyBudget * 30.4) / monthlyBudget * 100,
  }));
}

function executionOrder(snapshot: SnapshotForRun & { action?: string }): number {
  switch (snapshot.action) {
    case "budget-shift":
      return 10;
    case "ad-group-pause":
      return 20;
    case "keyword-pause":
      return 30;
    case "bid-adjust":
      return 40;
    case "strategy-alert":
      return 50;
    default:
      return 999;
  }
}

function proposalTypeForSnapshotAction(action: string | undefined): string | null {
  switch (action) {
    case "ad-group-pause":
      return "ad-group-pause";
    case "keyword-pause":
      return "keyword-pause";
    case "bid-adjust":
      return "campaign-target-cpa-update";
    case "strategy-alert":
      return "campaign-bid-strategy-change";
    default:
      return null;
  }
}

function withAuditId(proposed: Record<string, unknown>, auditId: number): Record<string, unknown> {
  if (proposed.auditId !== undefined && proposed.auditId !== null) return proposed;
  return { ...proposed, auditId };
}

async function handleExecuting(ctx: AccountEfficiencyContext): Promise<TickResult> {
  const snapshotRefs = await findSnapshotsForRun(ctx.payload, ctx.goalRun.id);
  const executableRefs = snapshotRefs
    .filter((s) => s.status === "approved" || s.status === "applied")
    .sort((a, b) => executionOrder(a) - executionOrder(b) || a.id - b.id);

  if (executableRefs.length === 0) {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "measuring",
    });
    return {
      status: "measuring",
      nextCheckAt: ctx.now.toISOString(),
      note: "No approved proposal snapshots to execute; advancing to measuring.",
    };
  }

  const audit = await resolveLatestAuditId(ctx.payload, ctx.clientId);
  const parameters = loadParameters(ctx.goalRun.parameters ?? null);
  const coolingOffUntil = new Date(
    ctx.now.getTime() + parameters.measurementDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  let appliedCount = 0;

  try {
    for (const snapshotRef of executableRefs) {
      if (snapshotRef.status === "applied") continue;
      const snapshotDoc = (await ctx.payload.findByID({
        collection: "goal-run-snapshots",
        id: snapshotRef.id,
        overrideAccess: true,
        depth: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)) as { id: number; action?: string; proposedPayload?: Record<string, unknown> };

      const proposed = (snapshotDoc.proposedPayload ?? {}) as Record<string, unknown>;
      if (snapshotDoc.action !== "budget-shift") {
        const proposalType = proposalTypeForSnapshotAction(snapshotDoc.action);
        if (!proposalType) continue;
        if (!audit) {
          throw new Error(`account-efficiency: no google-ads-audits row found for client ${ctx.clientId}; cannot resolve auditId for ${proposalType}.`);
        }
        const result = await dispatchApply(
          proposalType,
          withAuditId(proposed, audit.auditId),
          { payload: ctx.payload, approvalId: snapshotRef.approvalId ?? 0, userId: 0 },
        );
        await ctx.payload.update({
          collection: "goal-run-snapshots",
          id: snapshotRef.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: {
            status: "applied",
            modifiedPayload: {
              appliedAt: ctx.now.toISOString(),
              auditId: audit.auditId,
              proposalType,
              message: result.message ?? null,
              detail: result.detail ?? null,
              coolingOffUntil,
            },
          } as any,
          overrideAccess: true,
        });
        appliedCount += 1;
        continue;
      }

      const budgetUpdateRaw = Array.isArray(proposed.budgetUpdateCampaigns)
        ? (proposed.budgetUpdateCampaigns as ReadonlyArray<BudgetUpdateCampaign>)
        : [];
      const budgetPushLiveRaw = Array.isArray(proposed.budgetPushLiveCampaigns)
        ? (proposed.budgetPushLiveCampaigns as ReadonlyArray<BudgetPushLiveCampaign>)
        : [];
      if (budgetUpdateRaw.length === 0 || budgetPushLiveRaw.length === 0) continue;
      if (!audit) {
        throw new Error(`account-efficiency: no google-ads-audits row found for client ${ctx.clientId}; cannot resolve auditId for budget-update.`);
      }

      const budgetUpdateCampaigns = finaliseBudgetUpdateCampaigns(budgetUpdateRaw, audit.monthlyBudget);
      const updateResult: ApplyHandlerResult = await dispatchApply(
        "budget-update",
        {
          auditId: audit.auditId,
          mode: "campaign_allocations",
          campaigns: budgetUpdateCampaigns,
        },
        { payload: ctx.payload, approvalId: snapshotRef.approvalId ?? 0, userId: 0 },
      );
      const pushResult: ApplyHandlerResult = await dispatchApply(
        "budget-push-live",
        { auditId: audit.auditId, campaigns: budgetPushLiveRaw },
        { payload: ctx.payload, approvalId: snapshotRef.approvalId ?? 0, userId: 0 },
      );

      await ctx.payload.update({
        collection: "goal-run-snapshots",
        id: snapshotRef.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          status: "applied",
          modifiedPayload: {
            appliedAt: ctx.now.toISOString(),
            auditId: audit.auditId,
            budgetUpdate: { message: updateResult.message ?? null, detail: updateResult.detail ?? null },
            budgetPushLive: { message: pushResult.message ?? null, detail: pushResult.detail ?? null },
            finalisedBudgetUpdateCampaigns: budgetUpdateCampaigns,
            coolingOffUntil,
          },
        } as any,
        overrideAccess: true,
      });
      appliedCount += 1;
    }

    await ctx.payload.update({
      collection: "goal-runs",
      id: ctx.goalRun.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { coolingOffUntil } as any,
      overrideAccess: true,
    });
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "measuring",
    });
    return {
      status: "measuring",
      nextCheckAt: coolingOffUntil,
      coolingOffUntil,
      note: `Applied ${appliedCount} account-efficiency proposal(s); measuring window ends ${coolingOffUntil}.`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "failed",
      error: `account-efficiency dispatch failed: ${errMsg}`,
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "failed",
      nextCheckAt: ctx.now.toISOString(),
      note: `Dispatch failed: ${errMsg}`,
    };
  }
}

// ─── State: measuring ──────────────────────────────────────────────────────

async function handleMeasuring(ctx: AccountEfficiencyContext): Promise<TickResult> {
  const coolingOffUntil = ctx.goalRun.coolingOffUntil;
  if (coolingOffUntil) {
    const coolingOffTs = new Date(coolingOffUntil).getTime();
    if (Number.isFinite(coolingOffTs) && ctx.now.getTime() < coolingOffTs) {
      return {
        status: "measuring",
        nextCheckAt: coolingOffUntil,
        note: `Still in cooling-off; next check at ${coolingOffUntil}.`,
      };
    }
  }

  const latest = await findLatestSnapshotForRun(ctx.payload, ctx.goalRun.id);
  if (!latest) {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "failed",
      error: "measuring: no executing-step snapshot to measure against.",
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "failed",
      nextCheckAt: ctx.now.toISOString(),
      note: "No executing-step snapshot.",
    };
  }

  const snapshotDoc = (await ctx.payload.findByID({
    collection: "goal-run-snapshots",
    id: latest.id,
    overrideAccess: true,
    depth: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)) as { id: number; proposedPayload?: Record<string, unknown> };

  const proposed = (snapshotDoc.proposedPayload ?? {}) as Record<string, unknown>;
  const baselineCpa = typeof proposed.baselineCpa === "number" ? proposed.baselineCpa : 0;

  const fresh = await getCampaignSnapshot(ctx.payload, {
    clientId: ctx.clientId,
    staleAfterMinutes: SNAPSHOT_STALE_AFTER_MINUTES,
  });

  if (!fresh) {
    return {
      status: "measuring",
      nextCheckAt: new Date(ctx.now.getTime() + AWAITING_DATA_BACKOFF_MS).toISOString(),
      note: "No fresh snapshot for measurement; backing off.",
    };
  }

  // Re-derive the eligible set the same way the detector did, so currentCpa
  // is computed across the same non-brand/protected campaign population the
  // baseline came from.
  const contract: AccountHealthContract | null = await getAccountHealthContract(
    ctx.payload,
    ctx.clientId,
  );
  const brandIds = contract?.brandCampaignIds ?? [];
  const protectedIds = contract?.protectedCampaignIds ?? [];
  const parameters = loadParameters(ctx.goalRun.parameters ?? null);
  const allowList = parameters.includedCampaignIds && parameters.includedCampaignIds.length > 0
    ? new Set(parameters.includedCampaignIds.map((id) => id.trim().toLowerCase()))
    : null;

  let currentSpend = 0;
  let currentConversions = 0;
  for (const row of fresh.rows) {
    if (row.status && row.status.toUpperCase() !== "ENABLED") continue;
    if (isBrandOrProtected(row.campaignId, brandIds, protectedIds)) continue;
    if (isExcluded(row.campaignId, parameters.excludedCampaignIds)) continue;
    if (allowList && !allowList.has(row.campaignId.trim().toLowerCase())) continue;
    currentSpend += row.spend ?? 0;
    currentConversions += row.conversions ?? 0;
  }
  const currentCpa = currentConversions > 0 ? currentSpend / currentConversions : 0;

  const verdictResult = computeVerdict({
    baselineCpa,
    currentCpa,
    targetImprovementPercent: parameters.targetImprovementPercent,
    bufferTolerancePercent: parameters.bufferTolerancePercent,
  });

  const nextIterations = (ctx.goalRun.iterationsCount ?? 0) + 1;

  await attachMeasurement(ctx.payload, {
    snapshotId: latest.id,
    measuredAt: ctx.now.toISOString(),
    measuredResult: {
      verdict: verdictResult.verdict,
      improvementPercent: verdictResult.improvementPercent,
      regressed: verdictResult.regressed,
      baselineCpa,
      currentCpa,
      currentSpend,
      currentConversions,
      measuredAtIteration: nextIterations,
    },
  });

  await ctx.payload.update({
    collection: "goal-runs",
    id: ctx.goalRun.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { iterationsCount: nextIterations } as any,
    overrideAccess: true,
  });

  // Plan §"Measurement": all verdicts terminate as `complete` except
  // partial_success below the iteration cap, which loops back to analysing.
  // Failure is reserved for execution problems (handled in handleExecuting).
  const shouldLoop =
    verdictResult.verdict === "partial_success" && nextIterations < MAX_ITERATIONS;

  if (!shouldLoop) {
    await markGoalRunStatus(ctx.payload, {
      goalRunId: ctx.goalRun.id,
      status: "complete",
      completedAt: ctx.now.toISOString(),
    });
    return {
      status: "complete",
      nextCheckAt: ctx.now.toISOString(),
      iterationsCount: nextIterations,
      note: `Verdict=${verdictResult.verdict} improvement=${verdictResult.improvementPercent.toFixed(2)}% (baseline $${baselineCpa.toFixed(2)} → current $${currentCpa.toFixed(2)}).`,
    };
  }

  await markGoalRunStatus(ctx.payload, {
    goalRunId: ctx.goalRun.id,
    status: "analysing",
  });
  return {
    status: "analysing",
    nextCheckAt: ctx.now.toISOString(),
    iterationsCount: nextIterations,
    note: `Partial success ${verdictResult.improvementPercent.toFixed(2)}% < ${parameters.targetImprovementPercent}%; looping to analysing (iteration ${nextIterations}/${MAX_ITERATIONS}).`,
  };
}
