/**
 * Typed row shapes for the `google-ads-snapshots` Payload collection.
 *
 * The collection stores `rows` as untyped JSON because the shape varies
 * per level. These types are the source of truth for callers reading
 * snapshots back (OptiMate, goal agents, dashboards).
 *
 * Keep these aligned with the docstring in src/collections/GoogleAdsSnapshots.ts.
 */

export type MatchType = "EXACT" | "PHRASE" | "BROAD" | "UNKNOWN";

export type SnapshotLevel = "campaign" | "ad_group" | "keyword" | "search_term";

export interface CampaignSnapshotRow {
  campaignId: string;
  name: string;
  status: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpa: number | null;
}

export interface AdGroupSnapshotRow {
  adGroupId: string;
  campaignId: string;
  name: string;
  status: string;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
}

export interface KeywordSnapshotRow {
  keywordId?: string;
  adGroupId?: string;
  campaignId?: string;
  text: string;
  matchType: MatchType;
  spend?: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
}

export interface SearchTermSnapshotRow {
  term: string;
  campaignName?: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpa: number | null;
}

/** Mapping from a SnapshotLevel literal to the row interface for that level. */
export type LevelRow<L extends SnapshotLevel> = L extends "campaign"
  ? CampaignSnapshotRow
  : L extends "ad_group"
    ? AdGroupSnapshotRow
    : L extends "keyword"
      ? KeywordSnapshotRow
      : L extends "search_term"
        ? SearchTermSnapshotRow
        : never;

/**
 * A snapshot record as returned by the read helpers — the raw Payload doc is
 * narrowed/decorated with computed staleness info so callers don't have to
 * recompute it everywhere.
 */
export interface SnapshotRecord<L extends SnapshotLevel> {
  level: L;
  clientId: string;
  customerId: string;
  capturedAt: string;
  dateRangeLabel?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  rowCount: number;
  rows: LevelRow<L>[];
  sourceEndpoint?: string;
  fetchDurationMs?: number;
  error?: string;
  /** Computed: ageMinutes > staleAfterMinutes (default 1440 = 24h). */
  isStale: boolean;
  /** Computed: minutes between capturedAt and now. */
  ageMinutes: number;
}
