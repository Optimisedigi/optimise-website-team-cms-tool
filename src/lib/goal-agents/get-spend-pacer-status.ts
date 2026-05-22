/**
 * getSpendPacerStatus — integration helper.
 *
 * Reads the client's spend policy and latest campaign snapshot from Payload,
 * computes MTD spend pace, and returns a SpendPaceStatus the goal agent can
 * self-check against before proposing spend-moving actions.
 *
 * This is a thin orchestration layer over computeSpendPaceStatus — it handles
 * Payload reads; the pacing math is entirely in spend-pacer.ts.
 *
 * No external HTTP. No LLM.
 *
 * @see docs/goal-agents-architecture-and-build-plan.md §Layer 3 — Spend Pacer
 */

import type { Payload } from "payload";

import { computeSpendPaceStatus, type SpendPaceStatus } from "./spend-pacer";
import {
  getAccountHealthContract,
  type AccountHealthContract,
} from "./account-health-contract";
import {
  getCampaignSnapshot,
  type CampaignSnapshotRow,
} from "../google-ads-snapshots";

export interface GetSpendPacerStatusArgs {
  clientId: number;
  /**
   * Override today's day-of-month (useful for testing or simulating historical
   * snapshots).
   */
  currentDayOfMonth?: number;
  /**
   * Override the days in the calendar month.
   */
  daysInMonth?: number;
  /**
   * Staleness threshold for the campaign snapshot. Defaults to 24 hours.
   */
  staleAfterMinutes?: number;
}

/**
 * Return the current spend pace status for a client.
 *
 * Returns `null` if:
 *   - The client cannot be loaded (not found, access error)
 *   - No campaign snapshot exists for the client yet
 *   - The snapshot is stale (older than staleAfterMinutes)
 *
 * Never throws — all error paths return null so callers always get a
 * defined or null result, never an exception.
 */
export async function getSpendPacerStatus(
  payload: Payload,
  args: GetSpendPacerStatusArgs,
): Promise<SpendPaceStatus | null> {
  // Load the Account Health Contract for this client
  const contract: AccountHealthContract | null =
    await getAccountHealthContract(payload, args.clientId);

  // If the client can't be loaded, return null
  if (!contract) return null;

  // If the client has no spend policy at all, there's nothing to pace
  if (!contract.hasPolicy) return null;

  const { spendPolicy } = contract;

  // Load the latest campaign-level snapshot
  const snapshot = await getCampaignSnapshot(payload, {
    clientId: args.clientId,
    staleAfterMinutes: args.staleAfterMinutes ?? 1440,
  });

  // If no snapshot available or it's stale, we can't compute pace
  if (!snapshot || snapshot.isStale) return null;

  // Sum spend across all campaigns in the snapshot
  const mtdSpendMicros = sumCampaignSpendMicros(snapshot.rows);

  // Compute the pace status
  const status = computeSpendPaceStatus({
    monthlyBudgetMicros: microsFromDollars(spendPolicy.monthlyBudgetTarget ?? 0),
    pacingMode: spendPolicy.pacingMode,
    mtdSpendMicros,
    currentDayOfMonth: args.currentDayOfMonth,
    daysInMonth: args.daysInMonth,
    varianceBandLow: spendPolicy.acceptableVariancePercentLow / 100,
    varianceBandHigh: spendPolicy.acceptableVariancePercentHigh / 100,
  });

  return status;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sum `spend` across all campaign rows.
 * The `spend` field in CampaignSnapshotRow is in dollars (from Growth Tools),
 * so we convert to micros before returning.
 */
function sumCampaignSpendMicros(rows: CampaignSnapshotRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (typeof row.spend === "number" && row.spend >= 0) {
      total += microsFromDollars(row.spend);
    }
  }
  return total;
}

/** Convert dollars to micros: 1 dollar = 1,000,000 micros. */
function microsFromDollars(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}
