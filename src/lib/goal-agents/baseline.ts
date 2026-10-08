/**
 * Goal-run performance baseline.
 *
 * Freezes "what the account looked like before the goal run started" onto the
 * goal-runs row so progress is measured against a fixed anchor even when
 * Google Ads later restates conversions.
 *
 * Three like-for-like 7-day windows are captured relative to the day the run
 * was created (the anchor). Each window ENDS the day before the anchor minus
 * an offset:
 *
 *   week    → offset   0 days  (the 7 days immediately before the run)
 *   month   → offset  30 days  (the same-length window one month earlier)
 *   quarter → offset  90 days  (… three months earlier)
 *
 * Every window is aggregated to account totals and a per-campaign spend
 * allocation, filtered to the run's `includedCampaignIds` scope when set.
 *
 * Pure helpers (`baselineWindows`, `aggregateCampaignRows`, `percentChange`)
 * carry no I/O so they can be unit-tested directly. `captureGoalRunBaseline`
 * is the only function that talks to Growth Tools and Payload.
 */

import type { Payload } from "payload";

import { fetchCampaignLevel, type FetchResult } from "../google-ads-snapshots/cron";
import type { CampaignSnapshotRow } from "../google-ads-snapshots/types";
import {
  BASELINE_VERSION,
  baselineWindows,
  buildPoint,
  normaliseScope,
  type BaselinePoint,
  type BaselineWindow,
  type GoalRunBaseline,
} from "./baseline-shared";

export * from "./baseline-shared";

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// ─── I/O ───────────────────────────────────────────────────────────────────

export type CampaignFetcher = (
  customerId: string,
  options: { dateRange: string; rangeLabel: string },
) => Promise<FetchResult<CampaignSnapshotRow>>;

export interface FetchWindowArgs {
  customerId: string;
  window: BaselineWindow;
  scope: string[] | null;
  fetchCampaign?: CampaignFetcher;
}

export type FetchWindowResult =
  | { ok: true; point: BaselinePoint }
  | { ok: false; error: string; window: BaselineWindow };

/** Fetch one window from Growth Tools and aggregate it. Never throws. */
export async function fetchBaselinePoint(args: FetchWindowArgs): Promise<FetchWindowResult> {
  const fetcher = args.fetchCampaign ?? fetchCampaignLevel;
  try {
    const result = await fetcher(args.customerId, {
      dateRange: `${args.window.start},${args.window.end}`,
      rangeLabel: `BASELINE_${args.window.key.toUpperCase()}`,
    });
    if (!result.ok) return { ok: false, error: result.error, window: args.window };
    return { ok: true, point: buildPoint(args.window, result.rows, args.scope) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, window: args.window };
  }
}

export interface CaptureBaselineArgs {
  payload: Payload;
  goalRunId: number;
  customerId: string;
  runStartedAt: Date;
  includedCampaignIds: unknown;
  now?: Date;
  fetchCampaign?: CampaignFetcher;
}

export type CaptureBaselineResult =
  | { ok: true; baseline: GoalRunBaseline }
  | { ok: false; error: string };

/**
 * Compute all three windows and persist them on the goal-runs row. Only
 * freezes when every window fetched successfully — a partial baseline would
 * silently become the permanent anchor otherwise.
 */
export async function captureGoalRunBaseline(
  args: CaptureBaselineArgs,
): Promise<CaptureBaselineResult> {
  const scope = normaliseScope(args.includedCampaignIds);
  const windows = baselineWindows(args.runStartedAt);
  const points: BaselinePoint[] = [];
  for (const window of windows) {
    const result = await fetchBaselinePoint({
      customerId: args.customerId,
      window,
      scope,
      fetchCampaign: args.fetchCampaign,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: `Baseline window "${window.key}" (${window.start} → ${window.end}) failed: ${result.error}`,
      };
    }
    points.push(result.point);
  }

  const baseline: GoalRunBaseline = {
    version: BASELINE_VERSION,
    anchorDate: ymd(utcDay(args.runStartedAt)),
    frozenAt: (args.now ?? new Date()).toISOString(),
    scope: { includedCampaignIds: scope },
    points,
  };

  await args.payload.update({
    collection: "goal-runs",
    id: args.goalRunId,
    data: { baseline } as never,
    overrideAccess: true,
  });

  return { ok: true, baseline };
}
