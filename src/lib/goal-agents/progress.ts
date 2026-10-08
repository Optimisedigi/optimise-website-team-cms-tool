/**
 * Daily goal-run progress recorder.
 *
 * Called once a day from the Google Ads snapshots cron (after the snapshots
 * themselves are refreshed). For every goal run that is still worth tracking
 * (see `shouldRecordProgress`) it fetches yesterday's single-day metrics and
 * the trailing 7 days, scoped to the run's campaigns, and appends a
 * `ProgressPoint` to `goal_runs.progress`.
 *
 * Idempotent per (run, date): re-running the same day replaces the point.
 * Each run is isolated — a Growth Tools failure for one run is reported in
 * the summary and never blocks the others.
 */

import type { Payload } from "payload";

import { fetchCampaignLevel } from "../google-ads-snapshots/cron";
import { aggregateCampaignRows, normaliseScope, type CampaignFetcher, type BaselineMetrics } from "./baseline";
import {
  emptyProgress,
  isGoalRunProgress,
  progressDateFor,
  shouldRecordProgress,
  upsertProgressPoint,
  type GoalRunProgress,
  type ProgressPoint,
} from "./progress-shared";

export * from "./progress-shared";

interface RawGoalRunDoc {
  id: number | string;
  status?: string | null;
  client?: number | string | { id?: number | string } | null;
  parameters?: Record<string, unknown> | null;
  progress?: unknown;
  createdAt?: string | null;
  completedAt?: string | null;
}

interface RawClientDoc {
  id: number | string;
  googleAdsCustomerId?: string | null;
}

export interface RecordProgressOptions {
  now?: Date;
  fetchCampaign?: CampaignFetcher;
}

export interface RecordProgressSummary {
  date: string;
  runsConsidered: number;
  runsRecorded: number;
  runsSkipped: number;
  errors: Array<{ goalRunId: number; error: string }>;
}

function clientIdOf(raw: RawGoalRunDoc["client"]): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return Number(raw);
  if (raw && typeof raw === "object" && raw.id !== undefined) return Number(raw.id);
  return null;
}

function normaliseCustomerId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/-/g, "");
  return trimmed || null;
}

function daysBefore(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

async function fetchWindowMetrics(
  fetcher: CampaignFetcher,
  customerId: string,
  scope: string[] | null,
  start: string,
  end: string,
  label: string,
): Promise<{ ok: true; metrics: BaselineMetrics } | { ok: false; error: string }> {
  const result = await fetcher(customerId, { dateRange: `${start},${end}`, rangeLabel: label });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, metrics: aggregateCampaignRows(result.rows, scope).metrics };
}

/** Build one day's point for a run. Returns an error string instead of throwing. */
export async function buildProgressPoint(args: {
  customerId: string;
  scope: string[] | null;
  date: string;
  now: Date;
  fetchCampaign?: CampaignFetcher;
}): Promise<{ ok: true; point: ProgressPoint } | { ok: false; error: string }> {
  const fetcher = args.fetchCampaign ?? fetchCampaignLevel;
  try {
    const [day, trailing7] = await Promise.all([
      fetchWindowMetrics(fetcher, args.customerId, args.scope, args.date, args.date, "PROGRESS_DAY"),
      fetchWindowMetrics(fetcher, args.customerId, args.scope, daysBefore(args.date, 6), args.date, "PROGRESS_7D"),
    ]);
    if (!day.ok) return { ok: false, error: `day window: ${day.error}` };
    if (!trailing7.ok) return { ok: false, error: `trailing-7 window: ${trailing7.error}` };
    return {
      ok: true,
      point: { date: args.date, day: day.metrics, trailing7: trailing7.metrics, recordedAt: args.now.toISOString() },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function recordGoalRunProgress(
  payload: Payload,
  opts: RecordProgressOptions = {},
): Promise<RecordProgressSummary> {
  const now = opts.now ?? new Date();
  const date = progressDateFor(now);
  const summary: RecordProgressSummary = {
    date,
    runsConsidered: 0,
    runsRecorded: 0,
    runsSkipped: 0,
    errors: [],
  };

  const runsResult = await payload.find({
    collection: "goal-runs",
    where: { status: { not_equals: "failed" } } as never,
    sort: "-createdAt",
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });
  const runs = runsResult.docs as unknown as RawGoalRunDoc[];
  summary.runsConsidered = runs.length;

  const customerIdCache = new Map<number, string | null>();

  for (const run of runs) {
    const goalRunId = Number(run.id);
    if (!run.createdAt || !shouldRecordProgress({ status: run.status, completedAt: run.completedAt, createdAt: run.createdAt, now })) {
      summary.runsSkipped += 1;
      continue;
    }
    const clientId = clientIdOf(run.client);
    if (!clientId) {
      summary.runsSkipped += 1;
      continue;
    }

    let customerId = customerIdCache.get(clientId);
    if (customerId === undefined) {
      try {
        const client = (await payload.findByID({
          collection: "clients",
          id: clientId,
          depth: 0,
          overrideAccess: true,
        })) as unknown as RawClientDoc | null;
        customerId = normaliseCustomerId(client?.googleAdsCustomerId);
      } catch {
        customerId = null;
      }
      customerIdCache.set(clientId, customerId);
    }
    if (!customerId) {
      summary.runsSkipped += 1;
      continue;
    }

    const built = await buildProgressPoint({
      customerId,
      scope: normaliseScope(run.parameters?.includedCampaignIds),
      date,
      now,
      fetchCampaign: opts.fetchCampaign,
    });
    if (!built.ok) {
      summary.errors.push({ goalRunId, error: built.error });
      continue;
    }

    const existing: GoalRunProgress = isGoalRunProgress(run.progress) ? run.progress : emptyProgress();
    const next = upsertProgressPoint(existing, built.point);
    try {
      await payload.update({
        collection: "goal-runs",
        id: goalRunId,
        data: { progress: next } as never,
        overrideAccess: true,
      });
      summary.runsRecorded += 1;
    } catch (err) {
      summary.errors.push({ goalRunId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return summary;
}
