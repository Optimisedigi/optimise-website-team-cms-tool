/**
 * Read helpers for the `google-ads-snapshots` Payload collection.
 *
 * Pure reads — these helpers never call Growth Tools and never write. The
 * daily cron is responsible for keeping snapshots fresh (see upsert.ts).
 * Both OptiMate tools and goal-agent workers go through this module so the
 * shape and staleness logic stay consistent.
 */

import type { Payload } from "payload";

import type {
  AdGroupSnapshotRow,
  CampaignSnapshotRow,
  KeywordSnapshotRow,
  LevelRow,
  SearchTermSnapshotRow,
  SnapshotLevel,
  SnapshotRecord,
} from "./types";

export type {
  AdGroupSnapshotRow,
  CampaignSnapshotRow,
  KeywordSnapshotRow,
  LevelRow,
  MatchType,
  SearchTermSnapshotRow,
  SnapshotLevel,
  SnapshotRecord,
} from "./types";

/** Default staleness threshold: 24 hours. */
const DEFAULT_STALE_AFTER_MINUTES = 1440;

/**
 * Long-lookback window labels the multi-window cron persists alongside the
 * primary (30-day / structural) snapshot. The default reader must NOT return
 * these so legacy callers keep getting the primary row even though there are
 * now several rows per (client, level).
 */
export const KEYWORD_WINDOW_90D = "LAST_90_DAYS";
export const AD_GROUP_WINDOW_60D = "LAST_60_DAYS";
const LONG_WINDOW_LABELS: ReadonlySet<string> = new Set([
  KEYWORD_WINDOW_90D,
  AD_GROUP_WINDOW_60D,
]);

/** Raw doc shape we expect back from Payload.find on this collection. */
interface SnapshotDoc {
  id: string | number;
  client: string | number | { id: string | number };
  level: SnapshotLevel;
  capturedAt: string;
  dateRangeLabel?: string | null;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  customerId: string;
  rowCount?: number | null;
  rows?: unknown;
  sourceEndpoint?: string | null;
  fetchDurationMs?: number | null;
  error?: string | null;
}

function extractClientId(doc: SnapshotDoc): string {
  const c = doc.client;
  if (typeof c === "string" || typeof c === "number") return String(c);
  if (c && typeof c === "object" && "id" in c) return String(c.id);
  return "";
}

function ageMinutesFrom(capturedAt: string): number {
  const ts = new Date(capturedAt).getTime();
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  const diffMs = Date.now() - ts;
  return Math.max(0, Math.floor(diffMs / 60_000));
}

function narrowRows<L extends SnapshotLevel>(raw: unknown): LevelRow<L>[] {
  // The DB column is JSON. At read time we trust the cron-side writer to
  // have stored the right shape per level. We narrow to an array; callers
  // get the level-specific row type via the generic param.
  if (!Array.isArray(raw)) return [];
  return raw as LevelRow<L>[];
}

function buildRecord<L extends SnapshotLevel>(
  doc: SnapshotDoc,
  level: L,
  staleAfterMinutes: number,
): SnapshotRecord<L> {
  const ageMinutes = ageMinutesFrom(doc.capturedAt);
  const record: SnapshotRecord<L> = {
    level,
    clientId: extractClientId(doc),
    customerId: doc.customerId,
    capturedAt: doc.capturedAt,
    rowCount: typeof doc.rowCount === "number" ? doc.rowCount : 0,
    rows: narrowRows<L>(doc.rows),
    isStale: ageMinutes > staleAfterMinutes,
    ageMinutes,
  };
  if (doc.dateRangeLabel) record.dateRangeLabel = doc.dateRangeLabel;
  if (doc.dateRangeStart) record.dateRangeStart = doc.dateRangeStart;
  if (doc.dateRangeEnd) record.dateRangeEnd = doc.dateRangeEnd;
  if (doc.sourceEndpoint) record.sourceEndpoint = doc.sourceEndpoint;
  if (typeof doc.fetchDurationMs === "number") {
    record.fetchDurationMs = doc.fetchDurationMs;
  }
  if (doc.error) record.error = doc.error;
  return record;
}

export interface GetLatestSnapshotArgs<L extends SnapshotLevel> {
  clientId: string | number;
  level: L;
  /** Defaults to 1440 (24 hours). */
  staleAfterMinutes?: number;
  /**
   * When set, only a snapshot tagged with this exact `dateRangeLabel` matches.
   * Used to read the additive long-lookback windows (60d ad-group, 90d
   * keyword). When omitted the reader returns the primary snapshot and skips
   * the long-window rows so legacy callers are unaffected.
   */
  dateRangeLabel?: string;
}

/**
 * Generic reader — returns the latest snapshot for (client, level) or null
 * if the cron has never written one yet for this client.
 *
 * Multi-window note: there can now be several rows per (client, level) — the
 * primary (30d / structural) plus additive long-lookback windows. When
 * `dateRangeLabel` is supplied we match that window exactly (returning null if
 * absent). When it's omitted we return the primary, explicitly skipping the
 * long-window rows.
 */
export async function getLatestSnapshot<L extends SnapshotLevel>(
  payload: Payload,
  args: GetLatestSnapshotArgs<L>,
): Promise<SnapshotRecord<L> | null> {
  const staleAfterMinutes = args.staleAfterMinutes ?? DEFAULT_STALE_AFTER_MINUTES;
  if (args.dateRangeLabel !== undefined) {
    const result = await payload.find({
      collection: "google-ads-snapshots",
      where: {
        and: [
          { client: { equals: args.clientId } },
          { level: { equals: args.level } },
          { dateRangeLabel: { equals: args.dateRangeLabel } },
        ],
      },
      sort: "-capturedAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const doc = (result.docs as unknown as SnapshotDoc[])[0];
    if (!doc) return null;
    return buildRecord<L>(doc, args.level, staleAfterMinutes);
  }

  // No explicit window: return the primary row, skipping additive long
  // windows. Fetch a small page and pick the first non-long-window doc so
  // this stays correct even with several rows per (client, level).
  const result = await payload.find({
    collection: "google-ads-snapshots",
    where: {
      and: [
        { client: { equals: args.clientId } },
        { level: { equals: args.level } },
      ],
    },
    sort: "-capturedAt",
    limit: 10,
    depth: 0,
    overrideAccess: true,
  });
  const docs = result.docs as unknown as SnapshotDoc[];
  const primary = docs.find(
    (d) => !d.dateRangeLabel || !LONG_WINDOW_LABELS.has(d.dateRangeLabel),
  );
  if (!primary) return null;
  return buildRecord<L>(primary, args.level, staleAfterMinutes);
}

export interface GetLevelSnapshotArgs {
  clientId: string | number;
  staleAfterMinutes?: number;
}

export async function getCampaignSnapshot(
  payload: Payload,
  args: GetLevelSnapshotArgs,
): Promise<SnapshotRecord<"campaign"> | null> {
  return getLatestSnapshot(payload, { ...args, level: "campaign" });
}

export async function getAdGroupSnapshot(
  payload: Payload,
  args: GetLevelSnapshotArgs,
): Promise<SnapshotRecord<"ad_group"> | null> {
  return getLatestSnapshot(payload, { ...args, level: "ad_group" });
}

export async function getKeywordSnapshot(
  payload: Payload,
  args: GetLevelSnapshotArgs,
): Promise<SnapshotRecord<"keyword"> | null> {
  return getLatestSnapshot(payload, { ...args, level: "keyword" });
}

export async function getSearchTermSnapshot(
  payload: Payload,
  args: GetLevelSnapshotArgs,
): Promise<SnapshotRecord<"search_term"> | null> {
  return getLatestSnapshot(payload, { ...args, level: "search_term" });
}

/**
 * Read the additive 90-day keyword window the multi-window cron persists.
 * Returns null when that window has not been captured yet — callers must treat
 * "absent" as "cannot confirm" (never pause on missing long-window data).
 */
export async function getKeywordSnapshotForWindow(
  payload: Payload,
  args: GetLevelSnapshotArgs,
): Promise<SnapshotRecord<"keyword"> | null> {
  return getLatestSnapshot(payload, {
    ...args,
    level: "keyword",
    dateRangeLabel: KEYWORD_WINDOW_90D,
  });
}

/**
 * Read the additive 60-day ad-group window the multi-window cron persists.
 * Returns null when that window has not been captured yet — callers must treat
 * "absent" as "cannot confirm".
 */
export async function getAdGroupSnapshotForWindow(
  payload: Payload,
  args: GetLevelSnapshotArgs,
): Promise<SnapshotRecord<"ad_group"> | null> {
  return getLatestSnapshot(payload, {
    ...args,
    level: "ad_group",
    dateRangeLabel: AD_GROUP_WINDOW_60D,
  });
}

export interface GetAllLatestForClientArgs {
  clientId: string | number;
  staleAfterMinutes?: number;
}

export interface AllLatestForClient {
  campaign: SnapshotRecord<"campaign"> | null;
  ad_group: SnapshotRecord<"ad_group"> | null;
  keyword: SnapshotRecord<"keyword"> | null;
  search_term: SnapshotRecord<"search_term"> | null;
}

/**
 * Convenience: fetch all four level snapshots for a single client in
 * parallel. Returns nulls for levels the cron hasn't written yet.
 */
export async function getAllLatestForClient(
  payload: Payload,
  args: GetAllLatestForClientArgs,
): Promise<AllLatestForClient> {
  const [campaign, adGroup, keyword, searchTerm] = await Promise.all([
    getCampaignSnapshot(payload, args),
    getAdGroupSnapshot(payload, args),
    getKeywordSnapshot(payload, args),
    getSearchTermSnapshot(payload, args),
  ]);
  return {
    campaign,
    ad_group: adGroup,
    keyword,
    search_term: searchTerm,
  };
}
