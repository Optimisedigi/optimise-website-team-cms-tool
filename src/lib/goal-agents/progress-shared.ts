/**
 * Pure, browser-safe half of goal-run progress tracking: the daily series
 * stored on `goal_runs.progress` plus the status-bar / chart maths. No
 * Payload or Growth Tools imports. The recorder lives in ./progress.ts.
 */

import type { BaselineMetrics } from "./baseline-shared";

export const PROGRESS_VERSION = 1;
/** Stop appending daily points this many days after a run completes/fails. */
export const PROGRESS_TAIL_DAYS = 14;
/** Hard cap so a forgotten run can't grow the JSON forever. */
export const PROGRESS_MAX_DAYS = 120;

export interface ProgressPoint {
  /** YYYY-MM-DD (UTC) — the single day these metrics cover. */
  date: string;
  /** That one day, scoped to the run's campaigns. */
  day: BaselineMetrics;
  /** The 7 days ending on `date` (smoother CPA line). */
  trailing7: BaselineMetrics;
  recordedAt: string;
}

export interface GoalRunProgress {
  version: number;
  /** Sorted ascending by date; one entry per date. */
  points: ProgressPoint[];
}

export function isGoalRunProgress(value: unknown): value is GoalRunProgress {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.version === "number" && Array.isArray(v.points);
}

export function emptyProgress(): GoalRunProgress {
  return { version: PROGRESS_VERSION, points: [] };
}

/** Insert-or-replace by date, keep sorted, cap length. */
export function upsertProgressPoint(
  progress: GoalRunProgress,
  point: ProgressPoint,
): GoalRunProgress {
  const byDate = new Map(progress.points.map((p) => [p.date, p]));
  byDate.set(point.date, point);
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    version: PROGRESS_VERSION,
    points: points.slice(Math.max(0, points.length - PROGRESS_MAX_DAYS)),
  };
}

/** Which calendar day (UTC) a point should cover for a recorder running at `now`: yesterday. */
export function progressDateFor(now: Date): string {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Should the recorder still append points for this run? Active runs: always.
 * Finished runs: only for PROGRESS_TAIL_DAYS after completion so the chart
 * shows the settle-in period, then stop.
 */
export function shouldRecordProgress(args: {
  status: string | null | undefined;
  completedAt: string | null | undefined;
  createdAt: string;
  now: Date;
}): boolean {
  const ageDays = (args.now.getTime() - new Date(args.createdAt).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 1 || ageDays > PROGRESS_MAX_DAYS) return false;
  const finished = args.status === "complete" || args.status === "failed";
  if (!finished) return true;
  if (!args.completedAt) return false;
  const sinceDone = (args.now.getTime() - new Date(args.completedAt).getTime()) / 86_400_000;
  return Number.isFinite(sinceDone) && sinceDone <= PROGRESS_TAIL_DAYS;
}

// ─── Status bar ────────────────────────────────────────────────────────────

export interface RunTimeline {
  startedAt: string;
  /** End of the run horizon: start + horizonDays (runDurationDays). */
  cycleEndsAt: string;
  /** Length of the horizon the bar spans, in days. */
  measurementDays: number;
  elapsedMs: number;
  remainingMs: number;
  /** 0–100, clamped. */
  percentComplete: number;
  isFinished: boolean;
}

export function runTimeline(args: {
  createdAt: string;
  completedAt: string | null;
  status: string | null;
  /** The run horizon (runDurationDays). */
  measurementDays: number;
  now: Date;
}): RunTimeline {
  const start = new Date(args.createdAt).getTime();
  const days = args.measurementDays > 0 ? args.measurementDays : 42;
  const end = start + days * 86_400_000;
  const isFinished = args.status === "complete" || args.status === "failed";
  // A finished run's clock stops at completedAt: it must not keep ticking or
  // keep filling the bar as calendar time passes, or it reads as still live.
  const completedMs = args.completedAt ? new Date(args.completedAt).getTime() : Number.NaN;
  const clockMs = isFinished && Number.isFinite(completedMs) ? completedMs : args.now.getTime();
  const elapsedMs = Math.max(0, clockMs - start);
  const remainingMs = isFinished ? 0 : Math.max(0, end - clockMs);
  const pct = Math.min(100, Math.max(0, ((clockMs - start) / (end - start)) * 100));
  return {
    startedAt: new Date(start).toISOString(),
    cycleEndsAt: new Date(end).toISOString(),
    measurementDays: days,
    elapsedMs,
    remainingMs,
    percentComplete: Math.round(pct * 10) / 10,
    isFinished,
  };
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ─── Chart ─────────────────────────────────────────────────────────────────

export interface CpaChartSeries {
  /** Trailing-7-day CPA per date (null where no conversions). */
  trailing: Array<{ date: string; cpa: number | null }>;
  /** Single-day CPA per date (null where no conversions). */
  daily: Array<{ date: string; cpa: number | null }>;
  baselineCpa: number | null;
  targetCpa: number | null;
  /** Latest trailing-7 CPA, for the headline. */
  latestCpa: number | null;
  /** (latest − baseline) / baseline × 100. Negative = improving. */
  changePercent: number | null;
  yMax: number;
}

export function buildCpaChartSeries(args: {
  progress: GoalRunProgress | null;
  baselineCpa: number | null;
  targetImprovementPercent: number | null;
}): CpaChartSeries {
  const points = args.progress?.points ?? [];
  const trailing = points.map((p) => ({ date: p.date, cpa: p.trailing7.cpa }));
  const daily = points.map((p) => ({ date: p.date, cpa: p.day.cpa }));
  const targetCpa =
    args.baselineCpa !== null && args.targetImprovementPercent !== null
      ? Math.round(args.baselineCpa * (1 - args.targetImprovementPercent / 100) * 100) / 100
      : null;
  const latest = [...trailing].reverse().find((p) => p.cpa !== null)?.cpa ?? null;
  const changePercent =
    latest !== null && args.baselineCpa !== null && args.baselineCpa > 0
      ? Math.round(((latest - args.baselineCpa) / args.baselineCpa) * 1000) / 10
      : null;
  const candidates = [
    ...trailing.map((p) => p.cpa),
    ...daily.map((p) => p.cpa),
    args.baselineCpa,
    targetCpa,
  ].filter((v): v is number => v !== null && Number.isFinite(v));
  const yMax = candidates.length > 0 ? Math.max(...candidates) * 1.15 : 100;
  return { trailing, daily, baselineCpa: args.baselineCpa, targetCpa, latestCpa: latest, changePercent, yMax };
}

// ─── Changes by hour ───────────────────────────────────────────────────────

export interface HourBucket<T> {
  /** ISO timestamp truncated to the hour (UTC). */
  hour: string;
  items: T[];
}

/** Group timestamped rows into hourly buckets, newest hour first. */
export function groupByHour<T extends { createdAt: string | null }>(rows: T[]): HourBucket<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.createdAt) continue;
    const d = new Date(row.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const hour = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()),
    ).toISOString();
    const list = buckets.get(hour) ?? [];
    list.push(row);
    buckets.set(hour, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([hour, items]) => ({
      hour,
      items: [...items].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")),
    }));
}
