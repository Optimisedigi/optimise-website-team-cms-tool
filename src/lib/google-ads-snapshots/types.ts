/**
 * Typed row shapes for the `google-ads-snapshots` Payload collection.
 *
 * The collection stores `rows` as untyped JSON because the shape varies
 * per level. These types are the source of truth for callers reading
 * snapshots back (OptiMate, goal agents, dashboards).
 *
 * Keep these aligned with the docstring in src/collections/GoogleAdsSnapshots.ts.
 */

import type { BidStrategyType } from "../dashboard-types";

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
  /**
   * Impression-share metrics from Google Ads (search network). All three are
   * 0-100 percentages — searchImpressionShare is what we got, the *LostIS
   * fields are what we lost to budget vs rank. Optional because not every
   * upstream response includes them (e.g. campaigns with no impressions in
   * the window) and pre-Gap-1 snapshots won't carry them at all.
   */
  searchImpressionShare?: number;
  searchBudgetLostIS?: number;
  searchRankLostIS?: number;
  /**
   * Bid strategy in use on this campaign at the moment the snapshot was
   * captured. Read from the Growth Tools campaign-list response and mapped
   * via the same name-mapper used by
   * src/app/(frontend)/api/google-ads-budgets/[id]/list/route.ts.
   *
   * Optional because pre-Gap-2 snapshots won't carry it and goal agents must
   * stand down rather than guess when the strategy is unknown.
   */
  bidStrategy?: BidStrategyType;
  bidStrategyId?: string;
  /** Target CPA in micros (Google Ads native unit; 1 unit = $1, 1 micro = $1e-6). */
  targetCpaMicros?: number;
  /** Target ROAS as a decimal multiplier (e.g. 3.5 means 350%). */
  targetRoas?: number;
  /** Target impression-share % for TARGET_IMPRESSION_SHARE strategies (0-100). */
  targetImpressionShare?: number;
  /** Max-CPC ceiling in micros, used by some smart-bidding strategies as a cap. */
  maxCpcCeilingMicros?: number;
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
  /** See CampaignSnapshotRow for semantics. Ad-group-level IS, same units. */
  searchImpressionShare?: number;
  searchBudgetLostIS?: number;
  searchRankLostIS?: number;
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
