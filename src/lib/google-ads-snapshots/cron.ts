/**
 * Daily cron orchestrator for the `google-ads-snapshots` collection.
 *
 * Iterates every client that has a `googleAdsCustomerId` configured and
 * fetches the four levels — campaign, ad_group, keyword, search_term —
 * **sequentially** within a client (so the upstream Growth Tools service
 * sees at most one request per customer at a time) while running up to N
 * clients **in parallel** (default 5) via a tiny in-file worker pool.
 *
 * Per-level failures degrade gracefully:
 *   - The upsert helper preserves the previously-good `rows` when called
 *     with rows=[] and an `error`. We rely on that here so a transient
 *     Growth Tools blip doesn't blank the dashboard.
 *   - A failure in one level does NOT abort subsequent levels for the
 *     same client.
 *   - A failure in one client does NOT abort the rest of the run.
 *
 * The fetchers are intentionally inline (not reusing OptiMate's tool
 * wrappers) because the agent tools are CanonicalTool objects that expect
 * a ctx — they're not callable functions. Reproducing the Growth Tools
 * query-string conventions here keeps the cron decoupled from the agent
 * runtime layer.
 */

import { getPayload, type Payload, type Where } from "payload";

import config from "@/payload.config";

import type { BidStrategyType } from "../dashboard-types";
import type {
  AdGroupSnapshotRow,
  CampaignSnapshotRow,
  KeywordSnapshotRow,
  MatchType,
  SearchTermSnapshotRow,
  SnapshotLevel,
} from "./types";
import { upsertSnapshot } from "./upsert";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunCronOptions {
  payload?: Payload;
  concurrency?: number;
  clientIds?: (string | number)[];
  now?: () => Date;
}

export interface LevelOutcome {
  ok: boolean;
  rowCount: number;
  error?: string;
  sourceEndpoint?: string;
  durationMs: number;
}

export interface CronClientResult {
  clientId: string | number;
  customerId: string;
  campaign: LevelOutcome;
  ad_group: LevelOutcome;
  keyword: LevelOutcome;
  search_term: LevelOutcome;
  /** Additive 90-day keyword window (account-efficiency pause confirmation). */
  keyword_90d?: LevelOutcome;
  /** Additive 60-day ad-group window (account-efficiency pause confirmation). */
  ad_group_60d?: LevelOutcome;
  elapsedMs: number;
}

export interface CronSummary {
  startedAt: string;
  finishedAt: string;
  clientsProcessed: number;
  clientsErrored: number;
  perClient: CronClientResult[];
}

// Discriminated-union result returned by every fetcher. Keeps the
// happy/error paths explicit at the type level so the orchestrator can
// translate them into LevelOutcome + the right upsertSnapshot call.
type FetchOk<R> = {
  ok: true;
  rows: R[];
  sourceEndpoint: string;
  dateRangeLabel: string;
};
type FetchErr = {
  ok: false;
  error: string;
  sourceEndpoint: string;
  dateRangeLabel: string;
};
export type FetchResult<R> = FetchOk<R> | FetchErr;

// ---------------------------------------------------------------------------
// Growth Tools transport
// ---------------------------------------------------------------------------

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL || "http://localhost:5000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
const DEFAULT_RANGE_LABEL = "LAST_30_DAYS";
/** Additive long-lookback windows the account-efficiency agent confirms against. */
const KEYWORD_LONG_WINDOW_LABEL = "LAST_90_DAYS";
const AD_GROUP_LONG_WINDOW_LABEL = "LAST_60_DAYS";
const FETCH_TIMEOUT_MS = 45_000;

interface GrowthEnvelope {
  // The error shape Growth Tools uses on graceful 200-with-message responses.
  error?: string;
}

interface GrowthGetResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

async function growthGet<T extends GrowthEnvelope>(
  pathWithQuery: string,
): Promise<GrowthGetResult<T>> {
  if (!INTERNAL_API_KEY) {
    return {
      ok: false,
      status: 0,
      error: "INTERNAL_API_KEY is not configured on this CMS instance",
    };
  }
  const url = `${GROWTH_TOOLS_URL}${pathWithQuery}`;
  try {
    const r = await fetch(url, {
      headers: { "x-internal-key": INTERNAL_API_KEY },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return {
        ok: false,
        status: r.status,
        error: `Growth Tools ${r.status}: ${text.slice(0, 400)}`,
      };
    }
    const json = (await r.json()) as T;
    // Growth Tools sometimes returns 200 with an `error` envelope (e.g. the
    // endpoint exists but the customer isn't entitled to it). Treat that as
    // an unavailable upstream.
    if (json && typeof json === "object" && typeof json.error === "string" && json.error.length > 0) {
      return { ok: false, status: r.status, error: json.error };
    }
    return { ok: true, status: r.status, data: json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: `Growth Tools request failed: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normaliseCustomerId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/-/g, "");
}

function normaliseMatchType(raw: unknown): MatchType {
  if (typeof raw !== "string") return "UNKNOWN";
  const u = raw.toUpperCase();
  if (u === "EXACT" || u === "PHRASE" || u === "BROAD") return u;
  return "UNKNOWN";
}

/**
 * Map a Growth Tools `biddingStrategyType` (Google Ads enum name) to the
 * CMS-internal BidStrategyType union. Mirrors the mapper in
 * src/app/(frontend)/api/google-ads-budgets/[id]/list/route.ts:116 so the
 * snapshot and the budget collection agree on the strategy spelling.
 *
 * Returns null when the input is missing or unrecognised — callers leave
 * `bidStrategy` undefined on the snapshot row in that case so downstream
 * agents can stand down rather than guess.
 */
function mapBidStrategy(raw: unknown): BidStrategyType | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const upper = raw.trim().toUpperCase();
  const map: Record<string, BidStrategyType> = {
    MANUAL_CPC: "manual_cpc",
    MAXIMIZE_CONVERSIONS: "maximize_conversions",
    MAXIMIZE_CONVERSION_VALUE: "maximize_conversion_value",
    TARGET_CPA: "target_cpa",
    TARGET_ROAS: "target_roas",
    TARGET_IMPRESSION_SHARE: "target_impressions",
    MAXIMIZE_CLICKS: "maximize_clicks",
  };
  return map[upper] ?? null;
}

/** Numeric coercion that returns undefined for non-finite values — used for
 * optional snapshot fields where 0 is meaningfully different from "missing". */
function optionalNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function numberOr(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function stringOr(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

// ---------------------------------------------------------------------------
// Per-level fetchers
// ---------------------------------------------------------------------------

const CAMPAIGN_ENDPOINT = "/api/google-ads/campaign-budgets/get-metrics";
const SEARCH_TERM_ENDPOINT = "/api/google-ads/search-terms";
const AD_GROUP_ENDPOINT = "/api/google-ads/ad-groups/list";
const KEYWORD_ENDPOINT = "/api/google-ads/keyword-historical-spend";

interface RawCampaignMetric {
  campaignId?: unknown;
  campaignName?: unknown;
  status?: unknown;
  cost?: unknown;
  spend?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  conversions?: unknown;
  // Impression-share fields (Growth Tools campaign-metrics endpoint).
  searchImpressionShare?: unknown;
  searchBudgetLostIS?: unknown;
  searchBudgetLostImpressionShare?: unknown;
  searchRankLostIS?: unknown;
  searchRankLostImpressionShare?: unknown;
  // Bid-strategy fields (mirror campaign-list response shape).
  biddingStrategyType?: unknown;
  bidStrategy?: unknown;
  biddingStrategyId?: unknown;
  bidStrategyId?: unknown;
  targetCpaMicros?: unknown;
  targetCpa?: unknown;
  targetRoas?: unknown;
  targetImpressionShare?: unknown;
  maxCpcCeilingMicros?: unknown;
  maxCpcCeilingBidMicros?: unknown;
}

interface RawCampaignEnvelope extends GrowthEnvelope {
  metrics?: unknown;
}

export async function fetchCampaignLevel(
  customerId: string,
  options?: { dateRange?: string; rangeLabel?: string },
): Promise<FetchResult<CampaignSnapshotRow>> {
  const rangeLabel = options?.rangeLabel ?? DEFAULT_RANGE_LABEL;
  const qs = new URLSearchParams({
    customerId,
    dateRange: options?.dateRange ?? DEFAULT_RANGE_LABEL,
  });
  const path = `${CAMPAIGN_ENDPOINT}?${qs.toString()}`;
  const res = await growthGet<RawCampaignEnvelope>(path);
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: res.error ?? "Unknown Growth Tools error",
      sourceEndpoint: CAMPAIGN_ENDPOINT,
      dateRangeLabel: rangeLabel,
    };
  }

  const rawMetrics = Array.isArray(res.data.metrics) ? res.data.metrics : [];
  const rows: CampaignSnapshotRow[] = [];
  for (const item of rawMetrics) {
    if (!isRecord(item)) continue;
    const m = item as RawCampaignMetric;
    const campaignId = stringOr(m.campaignId);
    if (!campaignId) continue;
    const spend = numberOr(m.cost ?? m.spend);
    const clicks = numberOr(m.clicks);
    const impressions = numberOr(m.impressions);
    const conversions = numberOr(m.conversions);

    const row: CampaignSnapshotRow = {
      campaignId,
      name: stringOr(m.campaignName, campaignId),
      status: stringOr(m.status, "UNKNOWN"),
      spend: round2(spend),
      clicks,
      impressions,
      conversions: round2(conversions),
      ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
      cpa: conversions > 0 ? round2(spend / conversions) : null,
    };

    // Impression-share (Gap 1). Growth Tools exposes both short and verbose
    // field names; accept either. All values are 0-100 percentages.
    const sis = optionalNumber(m.searchImpressionShare);
    if (sis !== undefined) row.searchImpressionShare = round2(sis);
    const sbls = optionalNumber(
      m.searchBudgetLostIS ?? m.searchBudgetLostImpressionShare,
    );
    if (sbls !== undefined) row.searchBudgetLostIS = round2(sbls);
    const srls = optionalNumber(
      m.searchRankLostIS ?? m.searchRankLostImpressionShare,
    );
    if (srls !== undefined) row.searchRankLostIS = round2(srls);

    // Bid strategy (Gap 2).
    const strategy = mapBidStrategy(m.biddingStrategyType ?? m.bidStrategy);
    if (strategy) row.bidStrategy = strategy;
    const bidStrategyId = stringOr(m.biddingStrategyId ?? m.bidStrategyId);
    if (bidStrategyId) row.bidStrategyId = bidStrategyId;
    const targetCpaMicros = optionalNumber(m.targetCpaMicros);
    if (targetCpaMicros !== undefined) row.targetCpaMicros = targetCpaMicros;
    else {
      // Some Growth Tools responses report targetCpa as dollars; convert.
      const targetCpa = optionalNumber(m.targetCpa);
      if (targetCpa !== undefined) row.targetCpaMicros = Math.round(targetCpa * 1_000_000);
    }
    const targetRoas = optionalNumber(m.targetRoas);
    if (targetRoas !== undefined) row.targetRoas = targetRoas;
    const targetImpressionShare = optionalNumber(m.targetImpressionShare);
    if (targetImpressionShare !== undefined) row.targetImpressionShare = round2(targetImpressionShare);
    const maxCpcCeilingMicros = optionalNumber(m.maxCpcCeilingMicros ?? m.maxCpcCeilingBidMicros);
    if (maxCpcCeilingMicros !== undefined) row.maxCpcCeilingMicros = maxCpcCeilingMicros;

    rows.push(row);
  }

  return {
    ok: true,
    rows,
    sourceEndpoint: CAMPAIGN_ENDPOINT,
    dateRangeLabel: rangeLabel,
  };
}

interface RawSearchTerm {
  searchTerm?: unknown;
  query?: unknown;
  campaignName?: unknown;
  campaignId?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  cost?: unknown;
  spend?: unknown;
  conversions?: unknown;
}

interface RawSearchTermEnvelope extends GrowthEnvelope {
  searchTerms?: unknown;
  terms?: unknown;
}

export async function fetchSearchTermLevel(
  customerId: string,
): Promise<FetchResult<SearchTermSnapshotRow>> {
  const qs = new URLSearchParams({
    customerId,
    dateRange: DEFAULT_RANGE_LABEL,
    limit: "200",
  });
  const path = `${SEARCH_TERM_ENDPOINT}?${qs.toString()}`;
  const res = await growthGet<RawSearchTermEnvelope>(path);
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: res.error ?? "Unknown Growth Tools error",
      sourceEndpoint: SEARCH_TERM_ENDPOINT,
      dateRangeLabel: DEFAULT_RANGE_LABEL,
    };
  }

  const raw = Array.isArray(res.data.searchTerms)
    ? res.data.searchTerms
    : Array.isArray(res.data.terms)
      ? res.data.terms
      : [];

  const rows: SearchTermSnapshotRow[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const t = item as RawSearchTerm;
    const term = stringOr(t.searchTerm ?? t.query).trim();
    if (!term) continue;
    const impressions = numberOr(t.impressions);
    const clicks = numberOr(t.clicks);
    const spend = numberOr(t.cost ?? t.spend);
    const conversions = numberOr(t.conversions);
    rows.push({
      term,
      campaignName: stringOr(t.campaignName) || undefined,
      impressions,
      clicks,
      spend: round2(spend),
      conversions: round2(conversions),
      cpa: conversions > 0 ? round2(spend / conversions) : null,
    });
  }

  return {
    ok: true,
    rows,
    sourceEndpoint: SEARCH_TERM_ENDPOINT,
    dateRangeLabel: DEFAULT_RANGE_LABEL,
  };
}

interface RawAdGroup {
  adGroupId?: unknown;
  id?: unknown;
  adGroupName?: unknown;
  name?: unknown;
  campaignId?: unknown;
  status?: unknown;
  adGroupStatus?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  conversions?: unknown;
  cost?: unknown;
  spend?: unknown;
  searchImpressionShare?: unknown;
  searchBudgetLostIS?: unknown;
  searchBudgetLostImpressionShare?: unknown;
  searchRankLostIS?: unknown;
  searchRankLostImpressionShare?: unknown;
}

interface RawAdGroupEnvelope extends GrowthEnvelope {
  adGroups?: unknown;
}

/**
 * Ad-group level uses a "structural" range label because the listing
 * endpoint returns the current set of ad groups rather than a metrics
 * window. We still pass `dateRange=THIS_MONTH` to Growth Tools when
 * available (the live proxy does the same) but the snapshot row's
 * `dateRangeLabel` is `STRUCTURAL` to signal "this is the org chart, not
 * a metrics report".
 */
export async function fetchAdGroupLevel(
  customerId: string,
  options?: { dateRange?: string; rangeLabel?: string },
): Promise<FetchResult<AdGroupSnapshotRow>> {
  // Primary pull is structural (current ad groups). The additive 60d window
  // passes an explicit dateRange so the rows carry windowed metrics and the
  // snapshot is tagged with the window label rather than STRUCTURAL.
  const rangeLabel = options?.rangeLabel ?? "STRUCTURAL";
  const params: Record<string, string> = { customerId };
  if (options?.dateRange) params.dateRange = options.dateRange;
  const qs = new URLSearchParams(params);
  const path = `${AD_GROUP_ENDPOINT}?${qs.toString()}`;
  const res = await growthGet<RawAdGroupEnvelope>(path);
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: res.error ?? "Unknown Growth Tools error",
      sourceEndpoint: AD_GROUP_ENDPOINT,
      dateRangeLabel: rangeLabel,
    };
  }

  const raw = Array.isArray(res.data.adGroups) ? res.data.adGroups : [];
  const rows: AdGroupSnapshotRow[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const ag = item as RawAdGroup;
    const adGroupId = stringOr(ag.adGroupId ?? ag.id);
    if (!adGroupId) continue;
    const row: AdGroupSnapshotRow = {
      adGroupId,
      campaignId: stringOr(ag.campaignId),
      name: stringOr(ag.adGroupName ?? ag.name, adGroupId),
      status: stringOr(ag.status ?? ag.adGroupStatus, "UNKNOWN"),
      spend: round2(numberOr(ag.cost ?? ag.spend)),
      clicks: numberOr(ag.clicks),
      impressions: numberOr(ag.impressions),
      conversions: round2(numberOr(ag.conversions)),
    };
    const sis = optionalNumber(ag.searchImpressionShare);
    if (sis !== undefined) row.searchImpressionShare = round2(sis);
    const sbls = optionalNumber(
      ag.searchBudgetLostIS ?? ag.searchBudgetLostImpressionShare,
    );
    if (sbls !== undefined) row.searchBudgetLostIS = round2(sbls);
    const srls = optionalNumber(
      ag.searchRankLostIS ?? ag.searchRankLostImpressionShare,
    );
    if (srls !== undefined) row.searchRankLostIS = round2(srls);
    rows.push(row);
  }

  return {
    ok: true,
    rows,
    sourceEndpoint: AD_GROUP_ENDPOINT,
    dateRangeLabel: rangeLabel,
  };
}

interface RawKeyword {
  keywordId?: unknown;
  id?: unknown;
  adGroupId?: unknown;
  campaignId?: unknown;
  text?: unknown;
  keyword?: unknown;
  matchType?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  cost?: unknown;
  spend?: unknown;
  conversions?: unknown;
}

interface RawKeywordEnvelope extends GrowthEnvelope {
  keywords?: unknown;
}

export async function fetchKeywordLevel(
  customerId: string,
  options?: { rangeLabel?: string },
): Promise<FetchResult<KeywordSnapshotRow>> {
  const rangeLabel = options?.rangeLabel ?? DEFAULT_RANGE_LABEL;
  const qs = new URLSearchParams({
    customerId,
    dateRange: rangeLabel,
  });
  const path = `${KEYWORD_ENDPOINT}?${qs.toString()}`;
  const res = await growthGet<RawKeywordEnvelope>(path);
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: res.error ?? "Unknown Growth Tools error",
      sourceEndpoint: KEYWORD_ENDPOINT,
      dateRangeLabel: rangeLabel,
    };
  }

  const raw = Array.isArray(res.data.keywords) ? res.data.keywords : [];
  const rows: KeywordSnapshotRow[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const k = item as RawKeyword;
    const text = stringOr(k.text ?? k.keyword).trim();
    if (!text) continue;
    rows.push({
      keywordId: stringOr(k.keywordId ?? k.id) || undefined,
      adGroupId: stringOr(k.adGroupId) || undefined,
      campaignId: stringOr(k.campaignId) || undefined,
      text,
      matchType: normaliseMatchType(k.matchType),
      spend: round2(numberOr(k.cost ?? k.spend)),
      clicks: numberOr(k.clicks),
      impressions: numberOr(k.impressions),
      conversions: round2(numberOr(k.conversions)),
    });
  }

  return {
    ok: true,
    rows,
    sourceEndpoint: KEYWORD_ENDPOINT,
    dateRangeLabel: rangeLabel,
  };
}

// ---------------------------------------------------------------------------
// Per-client orchestration
// ---------------------------------------------------------------------------

interface ClientDoc {
  id: string | number;
  googleAdsCustomerId?: string | null;
  name?: string;
}

async function runLevel<R>(
  payload: Payload,
  args: {
    clientId: string | number;
    customerId: string;
    level: SnapshotLevel;
    fetcher: () => Promise<FetchResult<R>>;
    /** Expected window label, used to key the upsert on the catch path. */
    dateRangeLabel?: string;
    /** Optional explicit window bounds persisted on the snapshot row. */
    dateRangeStart?: string;
    dateRangeEnd?: string;
  },
): Promise<LevelOutcome> {
  const t0 = Date.now();
  let result: FetchResult<R>;
  try {
    result = await args.fetcher();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - t0;
    // Still try to persist the error so the dashboard can show "last attempt failed".
    try {
      await upsertSnapshot(payload, {
        clientId: args.clientId,
        level: args.level,
        customerId: args.customerId,
        rows: [],
        error: message,
        ...(args.dateRangeLabel !== undefined ? { dateRangeLabel: args.dateRangeLabel } : {}),
        ...(args.dateRangeStart !== undefined ? { dateRangeStart: args.dateRangeStart } : {}),
        ...(args.dateRangeEnd !== undefined ? { dateRangeEnd: args.dateRangeEnd } : {}),
        fetchDurationMs: durationMs,
      });
    } catch (persistErr) {
      payload.logger?.warn?.(
        `[ga-snapshots-cron] upsert(error) failed for client=${args.clientId} level=${args.level}: ${(persistErr as Error).message}`,
      );
    }
    return { ok: false, rowCount: 0, error: message, durationMs };
  }

  const durationMs = Date.now() - t0;

  if (!result.ok) {
    try {
      await upsertSnapshot(payload, {
        clientId: args.clientId,
        level: args.level,
        customerId: args.customerId,
        rows: [],
        error: result.error,
        sourceEndpoint: result.sourceEndpoint,
        dateRangeLabel: result.dateRangeLabel,
        ...(args.dateRangeStart !== undefined ? { dateRangeStart: args.dateRangeStart } : {}),
        ...(args.dateRangeEnd !== undefined ? { dateRangeEnd: args.dateRangeEnd } : {}),
        fetchDurationMs: durationMs,
      });
    } catch (persistErr) {
      payload.logger?.warn?.(
        `[ga-snapshots-cron] upsert(error) failed for client=${args.clientId} level=${args.level}: ${(persistErr as Error).message}`,
      );
    }
    return {
      ok: false,
      rowCount: 0,
      error: result.error,
      sourceEndpoint: result.sourceEndpoint,
      durationMs,
    };
  }

  try {
    await upsertSnapshot(payload, {
      clientId: args.clientId,
      level: args.level,
      customerId: args.customerId,
      rows: result.rows,
      sourceEndpoint: result.sourceEndpoint,
      dateRangeLabel: result.dateRangeLabel,
      ...(args.dateRangeStart !== undefined ? { dateRangeStart: args.dateRangeStart } : {}),
      ...(args.dateRangeEnd !== undefined ? { dateRangeEnd: args.dateRangeEnd } : {}),
      fetchDurationMs: durationMs,
    });
  } catch (persistErr) {
    const message = (persistErr as Error).message;
    payload.logger?.warn?.(
      `[ga-snapshots-cron] upsert(success) failed for client=${args.clientId} level=${args.level}: ${message}`,
    );
    return {
      ok: false,
      rowCount: result.rows.length,
      error: `persist failed: ${message}`,
      sourceEndpoint: result.sourceEndpoint,
      durationMs,
    };
  }

  return {
    ok: true,
    rowCount: result.rows.length,
    sourceEndpoint: result.sourceEndpoint,
    durationMs,
  };
}

/** Month label used for calendar-month campaign snapshots, e.g. "MONTH_2026-05". */
export function monthRangeLabel(year: number, month: number): string {
  return `MONTH_${year}-${String(month).padStart(2, "0")}`;
}

/** Comma-span date range Growth Tools accepts for a full calendar month. */
export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Current month-to-date and same dates last year, keyed by the current month. */
export function mtdComparisonRanges(now: Date = new Date()): Array<{ label: string; start: string; end: string }> {
  const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const day = now.getUTCDate();
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const lastYearLastDay = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 0)).getUTCDate();
  const lastYearEnd = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), Math.min(day, lastYearLastDay)));
  return [
    { label: `MTD_${key}`, start: ymd(currentStart), end: ymd(currentEnd) },
    { label: `MTD_LY_${key}`, start: ymd(lastYearStart), end: ymd(lastYearEnd) },
  ];
}

/** The last `count` complete calendar months, most recent first. */
export function completedMonths(count: number, now: Date = new Date()): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = [];
  for (let back = 1; back <= count; back++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return months;
}

/**
 * Capture calendar-month campaign snapshots for MoM/YoY pulse trends.
 * Backfills up to 13 complete months on first run; on subsequent runs only
 * the months that are still missing get fetched (normally just the newly
 * completed month). Historical months are immutable so are never re-pulled.
 */
async function captureMonthlyCampaignSnapshots(
  payload: Payload,
  client: ClientDoc,
  customerId: string,
): Promise<void> {
  const months = completedMonths(13);
  const existing = await payload.find({
    collection: "google-ads-snapshots",
    where: {
      and: [
        { client: { equals: client.id } },
        { level: { equals: "campaign" } },
        { dateRangeLabel: { like: "MONTH_%" } },
        { error: { exists: false } },
      ],
    },
    limit: 0,
    pagination: false,
    depth: 0,
    select: { dateRangeLabel: true } as never,
    overrideAccess: true,
  });
  const have = new Set(
    existing.docs.map((doc) => String((doc as { dateRangeLabel?: unknown }).dateRangeLabel ?? "")),
  );

  for (const { year, month } of months) {
    const label = monthRangeLabel(year, month);
    if (have.has(label)) continue;
    const range = monthDateRange(year, month);
    const outcome = await runLevel<CampaignSnapshotRow>(payload, {
      clientId: client.id,
      customerId,
      level: "campaign",
      fetcher: () => fetchCampaignLevel(customerId, {
        dateRange: `${range.start},${range.end}`,
        rangeLabel: label,
      }),
      dateRangeLabel: label,
      dateRangeStart: range.start,
      dateRangeEnd: range.end,
    });
    if (!outcome.ok) {
      payload.logger?.warn?.(
        `[ga-snapshots-cron] monthly snapshot ${label} failed for client=${client.id}: ${outcome.error ?? "unknown"}`,
      );
    }
  }
}

async function captureMtdCampaignSnapshots(
  payload: Payload,
  client: ClientDoc,
  customerId: string,
): Promise<void> {
  for (const range of mtdComparisonRanges()) {
    const outcome = await runLevel<CampaignSnapshotRow>(payload, {
      clientId: client.id,
      customerId,
      level: "campaign",
      fetcher: () => fetchCampaignLevel(customerId, {
        dateRange: `${range.start},${range.end}`,
        rangeLabel: range.label,
      }),
      dateRangeLabel: range.label,
      dateRangeStart: range.start,
      dateRangeEnd: range.end,
    });
    if (!outcome.ok) {
      payload.logger?.warn?.(
        `[ga-snapshots-cron] MTD snapshot ${range.label} failed for client=${client.id}: ${outcome.error ?? "unknown"}`,
      );
    }
  }
}

async function processClient(
  payload: Payload,
  client: ClientDoc,
): Promise<CronClientResult> {
  const start = Date.now();
  const customerId = normaliseCustomerId(client.googleAdsCustomerId) ?? "";

  // Run the four levels sequentially within the client so we never hammer
  // Growth Tools with four concurrent calls for the same customer.
  const campaign = await runLevel<CampaignSnapshotRow>(payload, {
    clientId: client.id,
    customerId,
    level: "campaign",
    fetcher: () => fetchCampaignLevel(customerId),
  });
  const ad_group = await runLevel<AdGroupSnapshotRow>(payload, {
    clientId: client.id,
    customerId,
    level: "ad_group",
    fetcher: () => fetchAdGroupLevel(customerId),
  });
  const keyword = await runLevel<KeywordSnapshotRow>(payload, {
    clientId: client.id,
    customerId,
    level: "keyword",
    fetcher: () => fetchKeywordLevel(customerId),
    dateRangeLabel: DEFAULT_RANGE_LABEL,
  });
  const search_term = await runLevel<SearchTermSnapshotRow>(payload, {
    clientId: client.id,
    customerId,
    level: "search_term",
    fetcher: () => fetchSearchTermLevel(customerId),
    dateRangeLabel: DEFAULT_RANGE_LABEL,
  });

  // Additive long-lookback windows the account-efficiency agent confirms
  // pauses against (90d keyword, 60d ad-group). These are extra rows tagged
  // by their window label — they never clobber the primary snapshots. A
  // failure here is isolated and never aborts the run.
  const keyword_90d = await runLevel<KeywordSnapshotRow>(payload, {
    clientId: client.id,
    customerId,
    level: "keyword",
    fetcher: () => fetchKeywordLevel(customerId, { rangeLabel: KEYWORD_LONG_WINDOW_LABEL }),
    dateRangeLabel: KEYWORD_LONG_WINDOW_LABEL,
  });
  const ad_group_60d = await runLevel<AdGroupSnapshotRow>(payload, {
    clientId: client.id,
    customerId,
    level: "ad_group",
    fetcher: () => fetchAdGroupLevel(customerId, {
      dateRange: AD_GROUP_LONG_WINDOW_LABEL,
      rangeLabel: AD_GROUP_LONG_WINDOW_LABEL,
    }),
    dateRangeLabel: AD_GROUP_LONG_WINDOW_LABEL,
  });

  // Pulse trend snapshots. Isolated like the long-lookback windows above — a
  // failure never aborts the client run.
  try {
    await captureMtdCampaignSnapshots(payload, client, customerId);
    await captureMonthlyCampaignSnapshots(payload, client, customerId);
  } catch (err) {
    payload.logger?.warn?.(
      `[ga-snapshots-cron] pulse snapshot sweep failed for client=${client.id}: ${(err as Error).message}`,
    );
  }

  return {
    clientId: client.id,
    customerId,
    campaign,
    ad_group,
    keyword,
    search_term,
    keyword_90d,
    ad_group_60d,
    elapsedMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Concurrency pool — tiny, dependency-free, capped at N
// ---------------------------------------------------------------------------

/**
 * Run `tasks` with at most `concurrency` running at once. Returns results in
 * the same order as the input. A rejected task surfaces a synthetic
 * CronClientResult with all four levels marked as failed — this should
 * almost never fire because processClient catches its own errors, but it
 * keeps the pool honest in the face of unexpected throws.
 */
async function runPool(
  tasks: Array<() => Promise<CronClientResult>>,
  concurrency: number,
): Promise<CronClientResult[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<CronClientResult>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failed: LevelOutcome = {
          ok: false,
          rowCount: 0,
          error: `client task threw: ${message}`,
          durationMs: 0,
        };
        results[i] = {
          clientId: "",
          customerId: "",
          campaign: failed,
          ad_group: failed,
          keyword: failed,
          search_term: failed,
          elapsedMs: 0,
        };
      }
    }
  }

  const workers: Promise<void>[] = [];
  const n = Math.min(limit, tasks.length);
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run the daily Google Ads snapshot refresh for every connected client.
 * See file docstring for the concurrency / failure-isolation contract.
 */
export async function runGoogleAdsSnapshotsCron(
  opts: RunCronOptions = {},
): Promise<CronSummary> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const payload = opts.payload ?? (await getPayload({ config: await config }));

  // Pull every client that has a non-empty googleAdsCustomerId. We can't
  // express "not empty string" directly in Payload's where DSL, so we fetch
  // "not null" and filter in JS — the list is small (one row per client).
  const where: Where = {
    googleAdsCustomerId: { not_equals: null },
  };
  if (opts.clientIds && opts.clientIds.length > 0) {
    where.id = { in: opts.clientIds };
  }

  const clientsResult = await payload.find({
    collection: "clients",
    where,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const candidates = clientsResult.docs as unknown as ClientDoc[];
  const eligible = candidates.filter(
    (c) => normaliseCustomerId(c.googleAdsCustomerId) !== null,
  );

  const tasks = eligible.map(
    (client) => () => processClient(payload, client),
  );
  const concurrency = opts.concurrency ?? 5;
  const perClient = await runPool(tasks, concurrency);

  const clientsErrored = perClient.filter(
    (r) =>
      !r.campaign.ok || !r.ad_group.ok || !r.keyword.ok || !r.search_term.ok,
  ).length;

  return {
    startedAt,
    finishedAt: now().toISOString(),
    clientsProcessed: perClient.length,
    clientsErrored,
    perClient,
  };
}
