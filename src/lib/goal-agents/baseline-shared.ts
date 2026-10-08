/**
 * Pure, browser-safe half of the goal-run baseline: types, window maths and
 * aggregation. No Payload / Growth Tools imports so client components can
 * use the types and `percentChange` without pulling the server bundle.
 * The I/O (fetch + freeze) lives in ./baseline.ts.
 */

import type { CampaignSnapshotRow } from "../google-ads-snapshots/types";

export const BASELINE_VERSION = 1;
export const BASELINE_WINDOW_DAYS = 7;

export type BaselinePointKey = "week" | "month" | "quarter";

export interface BaselineWindow {
  key: BaselinePointKey;
  label: string;
  /** Days between the window end and the day before the run started. */
  offsetDays: number;
  /** Inclusive YYYY-MM-DD (UTC). */
  start: string;
  /** Inclusive YYYY-MM-DD (UTC). */
  end: string;
}

export interface BaselineMetrics {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  /** spend / conversions; null when there were no conversions. */
  cpa: number | null;
  /** clicks / impressions × 100; 0 when there were no impressions. */
  ctr: number;
  /** conversions / clicks × 100; 0 when there were no clicks. */
  conversionRate: number;
}

export interface BaselineCampaignShare {
  campaignId: string;
  name: string;
  status: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  /** Share of total in-scope spend, 0-100. */
  spendSharePercent: number;
}

export interface BaselinePoint extends BaselineWindow {
  metrics: BaselineMetrics;
  /** Sorted by spend desc, then campaignId for determinism. */
  campaigns: BaselineCampaignShare[];
  /** Number of campaigns that matched the scope in this window. */
  campaignCount: number;
}

export interface GoalRunBaseline {
  version: number;
  /** YYYY-MM-DD of the day the goal run was created (UTC). */
  anchorDate: string;
  frozenAt: string;
  scope: {
    includedCampaignIds: string[] | null;
  };
  points: BaselinePoint[];
}

export const BASELINE_POINT_DEFINITIONS: ReadonlyArray<{
  key: BaselinePointKey;
  label: string;
  offsetDays: number;
}> = Object.freeze([
  { key: "week", label: "Last week before run", offsetDays: 0 },
  { key: "month", label: "One month before run", offsetDays: 30 },
  { key: "quarter", label: "Three months before run", offsetDays: 90 },
]);

// ─── Pure helpers ──────────────────────────────────────────────────────────

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A 7-day window ending `offsetDays` before `anchorExclusive` (the window never
 * includes the anchor day itself).
 */
export function windowEndingBefore(
  anchorExclusive: Date,
  offsetDays: number,
  days: number = BASELINE_WINDOW_DAYS,
): { start: string; end: string } {
  const anchor = utcDay(anchorExclusive);
  const end = new Date(anchor.getTime() - (offsetDays + 1) * 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { start: ymd(start), end: ymd(end) };
}

/** The three frozen baseline windows for a run that started at `runStartedAt`. */
export function baselineWindows(runStartedAt: Date): BaselineWindow[] {
  return BASELINE_POINT_DEFINITIONS.map((def) => ({
    ...def,
    ...windowEndingBefore(runStartedAt, def.offsetDays),
  }));
}

/** Live comparison windows: everything since the run started, and the latest 7 days. */
export function currentWindows(
  runStartedAt: Date,
  now: Date,
): { sinceStart: { start: string; end: string }; last7: { start: string; end: string } } {
  const startDay = utcDay(runStartedAt);
  const today = utcDay(now);
  // Google Ads data for "today" is partial — end on yesterday unless the run
  // started today, in which case there's nothing complete yet and we show today.
  const yesterday = new Date(today.getTime() - 86_400_000);
  const end = yesterday.getTime() >= startDay.getTime() ? yesterday : today;
  const last7 = windowEndingBefore(new Date(end.getTime() + 86_400_000), 0);
  return {
    sinceStart: { start: ymd(startDay), end: ymd(end) },
    last7,
  };
}

export function normaliseScope(includedCampaignIds: unknown): string[] | null {
  if (!Array.isArray(includedCampaignIds)) return null;
  const ids = includedCampaignIds
    .filter((id): id is string => typeof id === "string" && id.trim() !== "")
    .map((id) => id.trim());
  return ids.length > 0 ? [...new Set(ids)].sort() : null;
}

/**
 * Aggregate campaign rows into account metrics + spend allocation. When
 * `scope` is non-null only campaigns whose id is in the list are counted.
 */
export function aggregateCampaignRows(
  rows: ReadonlyArray<CampaignSnapshotRow>,
  scope: string[] | null,
): { metrics: BaselineMetrics; campaigns: BaselineCampaignShare[] } {
  const allow = scope ? new Set(scope.map((id) => id.toLowerCase())) : null;
  const inScope = rows.filter((row) =>
    allow ? allow.has(String(row.campaignId).trim().toLowerCase()) : true,
  );

  let spend = 0;
  let clicks = 0;
  let impressions = 0;
  let conversions = 0;
  for (const row of inScope) {
    spend += row.spend ?? 0;
    clicks += row.clicks ?? 0;
    impressions += row.impressions ?? 0;
    conversions += row.conversions ?? 0;
  }

  const campaigns: BaselineCampaignShare[] = inScope
    .map((row) => {
      const rowSpend = row.spend ?? 0;
      const rowConversions = row.conversions ?? 0;
      return {
        campaignId: String(row.campaignId),
        name: row.name || String(row.campaignId),
        status: row.status || "UNKNOWN",
        spend: round2(rowSpend),
        clicks: row.clicks ?? 0,
        conversions: round2(rowConversions),
        cpa: rowConversions > 0 ? round2(rowSpend / rowConversions) : null,
        spendSharePercent: spend > 0 ? round2((rowSpend / spend) * 100) : 0,
      };
    })
    .sort((a, b) => b.spend - a.spend || a.campaignId.localeCompare(b.campaignId));

  return {
    metrics: {
      spend: round2(spend),
      clicks,
      impressions,
      conversions: round2(conversions),
      cpa: conversions > 0 ? round2(spend / conversions) : null,
      ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
      conversionRate: clicks > 0 ? round2((conversions / clicks) * 100) : 0,
    },
    campaigns,
  };
}

/** (current − baseline) / baseline × 100, or null when the baseline is 0/null. */
export function percentChange(baseline: number | null, current: number | null): number | null {
  if (baseline === null || current === null) return null;
  if (!Number.isFinite(baseline) || baseline === 0) return null;
  return round2(((current - baseline) / baseline) * 100);
}

export function buildPoint(
  window: BaselineWindow,
  rows: ReadonlyArray<CampaignSnapshotRow>,
  scope: string[] | null,
): BaselinePoint {
  const { metrics, campaigns } = aggregateCampaignRows(rows, scope);
  return { ...window, metrics, campaigns, campaignCount: campaigns.length };
}

export function isGoalRunBaseline(value: unknown): value is GoalRunBaseline {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === "number" &&
    typeof v.anchorDate === "string" &&
    typeof v.frozenAt === "string" &&
    Array.isArray(v.points) &&
    v.points.length === BASELINE_POINT_DEFINITIONS.length
  );
}

