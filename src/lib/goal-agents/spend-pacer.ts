/**
 * Spend Pacer — pure compute logic.
 *
 * Reads spend velocity from campaign snapshots and the client's spend policy,
 * computes MTD pace, and returns a status the goal agent can self-check
 * against before proposing spend-moving actions.
 *
 * The actual hourly cron that calls this lives in Phase 3 (scheduler).
 * This module is intentionally pure — no HTTP, no Payload, no LLM.
 *
 * @see docs/goal-agents-architecture-and-build-plan.md §Layer 3 — Spend Pacer
 */

import type { PacingMode } from "./account-health-contract";

// ─── Public types ───────────────────────────────────────────────────────────

export type SpendPaceState = "on_track" | "underspending" | "overspending";

export interface SpendPaceStatus {
  state: SpendPaceState;
  /** MTD spend in micros (same unit as monthlyBudgetTarget). */
  actualSpendMicros: number;
  /** Expected MTD spend at current point in month. */
  targetSpendMicros: number;
  /** Actual / target, expressed as a ratio (1.0 = exactly on pace). */
  paceRatio: number;
  /** paceRatio expressed as a percentage, e.g. 95 or 110. */
  pacePercent: number;
  /** The client's monthly budget target in micros. */
  monthlyBudgetMicros: number;
  /** Current day of the calendar month (1–31). */
  currentDayOfMonth: number;
  /** Days in the current calendar month. */
  daysInMonth: number;
  /** Whether the agent may propose actions that reduce spend. */
  canReduceSpend: boolean;
  /** Whether the agent may propose actions that increase spend. */
  canIncreaseSpend: boolean;
  /**
   * Human-readable alert when state !== on_track.
   * Underspending >3 days or overspending >2 days should surface in the
   * audit trail but this helper does not track consecutive days — the caller
   * (cron or goal runtime) is responsible for that.
   */
  alertMessage?: string;
}

// ─── Default pacing constants ───────────────────────────────────────────────

/** Default lower bound of the acceptable variance band, expressed as a fraction. */
const DEFAULT_VARIANCE_LOW = 0.90;
/** Default upper bound of the acceptable variance band, expressed as a fraction. */
const DEFAULT_VARIANCE_HIGH = 1.05;

// ─── Pure compute ────────────────────────────────────────────────────────────

export interface ComputeSpendPaceArgs {
  /** Monthly budget target in micros. Pass 0 or null when the client has no policy. */
  monthlyBudgetMicros: number;
  /**
   * Pacing mode from the Account Health Contract.
   * Null means the client has no explicit pacing mode set.
   */
  pacingMode: PacingMode | null;
  /**
   * Sum of all campaign-level spend in the current MTD snapshot, in micros.
   * Must be non-negative.
   */
  mtdSpendMicros: number;
  /**
   * Current calendar day of month (1 = first day, 28/29/30/31 = last possible).
   * Defaults to today's day if not supplied.
   */
  currentDayOfMonth?: number;
  /**
   * Days in the current calendar month.
   * Defaults to the actual days in the current month if not supplied.
   * Pass this when testing edge cases (e.g. February = 28).
   */
  daysInMonth?: number;
  /**
   * Lower bound of acceptable pace as a fraction (0.90 = 90%).
   * Defaults to 0.90 when not supplied.
   */
  varianceBandLow?: number;
  /**
   * Upper bound of acceptable pace as a fraction (1.05 = 105%).
   * Defaults to 1.05 when not supplied.
   */
  varianceBandHigh?: number;
}

/**
 * Compute MTD spend pace against the client's monthly budget target.
 *
 * Formula (from §Layer 3 of the architecture doc):
 *   Target daily pace = monthly budget / days in month
 *   MTD target = target daily pace × current day of month
 *   Pace ratio = actual MTD spend / MTD target
 *
 * Tolerance band default: 90%–105% of target.
 * Band is configurable via varianceBandLow / varianceBandHigh args.
 *
 * Rules:
 *   underspending → BLOCK spend reductions, ALLOW spend maintenance/increase
 *   overspending  → BLOCK spend increases, ALLOW spend maintenance/reduction
 *   on_track     → all directions allowed
 *
 * Special cases:
 *   - monthlyBudgetMicros = 0/null (no policy): state = on_track, both flags = true
 *   - mtdSpendMicros = 0: state = underspending (not overspending — can't be
 *     overspending if nothing has been spent)
 *   - currentDayOfMonth = 1: MTD target ≈ 0 — paceRatio will be very large or
 *     Infinity on day 1 with zero spend. In this case we clamp to on_track.
 *   - currentDayOfMonth >= daysInMonth: treat as end-of-month (use 100% of budget)
 */
export function computeSpendPaceStatus(
  args: ComputeSpendPaceArgs,
): SpendPaceStatus {
  const {
    monthlyBudgetMicros,
    pacingMode,
    mtdSpendMicros,
    varianceBandLow = DEFAULT_VARIANCE_LOW,
    varianceBandHigh = DEFAULT_VARIANCE_HIGH,
  } = args;

  const now = new Date();
  const currentDayOfMonth = args.currentDayOfMonth ?? now.getDate();
  const daysInMonth = args.daysInMonth ?? daysInCalendarMonth(now);

  // Clamp currentDayOfMonth to [1, daysInMonth]
  const day = Math.min(Math.max(1, currentDayOfMonth), daysInMonth);

  // Guard: no policy set → no restrictions
  if (!monthlyBudgetMicros || monthlyBudgetMicros <= 0) {
    return {
      state: "on_track",
      actualSpendMicros: mtdSpendMicros,
      targetSpendMicros: 0,
      paceRatio: 1,
      pacePercent: 100,
      monthlyBudgetMicros: 0,
      currentDayOfMonth: day,
      daysInMonth,
      canReduceSpend: true,
      canIncreaseSpend: true,
    };
  }

  // Guard: negative spend is impossible — treat as zero
  const actual = Math.max(0, mtdSpendMicros);

  // MTD target = (monthly budget / days in month) × current day
  const dailyTarget = monthlyBudgetMicros / daysInMonth;
  const rawMtdTarget = dailyTarget * day;
  // Use at least 1 micros to avoid division-by-zero on day 1
  const mtdTarget = Math.max(1, rawMtdTarget);

  // End-of-month edge: if day >= daysInMonth, the target is the full monthly budget.
  // For end-of-month, pace is measured against the full budget (not the daily target).
  const isEndOfMonth = day >= daysInMonth;
  const effectiveTarget = isEndOfMonth ? monthlyBudgetMicros : mtdTarget;

  // Day-1 edge: if day === 1 and no spend, treat as on_track (not underspending
  // or overspending — not enough data on day 1 morning)
  const isDayOne = day === 1;

  // Compute pace metrics using the effective target.
  // At end-of-month this gives pacePercent = actual/monthlyBudget × 100 (correct).
  const effectivePaceRatio = actual / Math.max(1, effectiveTarget);
  const pacePercent = Math.round(effectivePaceRatio * 100);

  // Determine state
  let state: SpendPaceState;
  let alertMessage: string | undefined;

  if (isDayOne) {
    // Day 1: not enough data to compare against the daily target.
    // Zero spend → on_track (not underspending — no spend history).
    // Any spend → on_track (can't flag overspend on day-1 data).
    state = "on_track";
  } else if (effectivePaceRatio < varianceBandLow) {
    // Strictly below the acceptable band → underspending
    state = "underspending";
    alertMessage = buildAlertMessage("underspending", pacePercent);
  } else if (effectivePaceRatio > varianceBandHigh) {
    // Strictly above the acceptable band → overspending
    state = "overspending";
    alertMessage = buildAlertMessage("overspending", pacePercent);
  } else {
    state = "on_track";
  }

  // Derive action flags
  let canReduceSpend: boolean;
  let canIncreaseSpend: boolean;

  if (state === "underspending") {
    // Don't make underspend worse
    canReduceSpend = false;
    canIncreaseSpend = true;
  } else if (state === "overspending") {
    // Don't overspend further
    canReduceSpend = true;
    canIncreaseSpend = false;
  } else {
    canReduceSpend = true;
    canIncreaseSpend = true;
  }

  // Performance-cap mode: ceiling is hard — never allow increases above it
  if (pacingMode === "performance_cap") {
    canIncreaseSpend = false;
  }

  return {
    state,
    actualSpendMicros: actual,
    targetSpendMicros: Math.round(effectiveTarget),
    paceRatio: effectivePaceRatio,
    pacePercent,
    monthlyBudgetMicros,
    currentDayOfMonth: day,
    daysInMonth,
    canReduceSpend,
    canIncreaseSpend,
    alertMessage,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysInCalendarMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function buildAlertMessage(state: SpendPaceState, pacePercent: number): string {
  if (state === "underspending") {
    return `Spend is running at ${pacePercent}% of target pace — underspending.`;
  }
  return `Spend is running at ${pacePercent}% of target pace — overspending.`;
}
