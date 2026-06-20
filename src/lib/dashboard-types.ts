/** Types mirrored from website-growth-tools GoogleAdsDashboardData */

/**
 * Build a YYYY-MM list ending at the current month, oldest first.
 * Used to anchor every monthly chart to the same 14-month window so May 2026
 * lines up with April 2025 across Overview, Progress, and Quality tabs.
 */
export function buildMonthAnchorList(monthsBack: number): string[] {
  const today = new Date();
  const list: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    list.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return list;
}

/**
 * Pad a series of monthly data points to a complete N-month window ending at
 * the current month. Missing months are filled by `makeEmpty(month)`. Existing
 * data points outside the window are dropped; data points inside the window
 * keep all their fields. Result is oldest-first.
 */
export function padMonthlySeries<T extends { month: string }>(
  rows: T[] | null | undefined,
  monthsBack: number,
  makeEmpty: (month: string) => T,
): T[] {
  const anchor = buildMonthAnchorList(monthsBack);
  const byMonth = new Map<string, T>();
  for (const r of rows || []) {
    if (r?.month) byMonth.set(String(r.month).slice(0, 7), r);
  }
  return anchor.map((m) => byMonth.get(m) ?? makeEmpty(m));
}

export const DASHBOARD_MONTHLY_WINDOW = 14;


export interface GoogleAdsDashboardKpis {
  spend: number;
  clicks: number;
  impressions?: number;
  avgCpc: number;
  ctr?: number | null;
  conversions: number;
  cpa: number | null;
  // Previous month comparison — null when the active range is a custom
  // day span (period-over-period is semantically ambiguous there).
  prevSpend: number | null;
  prevClicks: number | null;
  prevImpressions?: number | null;
  prevAvgCpc: number | null;
  prevCtr?: number | null;
  prevConversions: number | null;
  prevCpa: number | null;
  // Year-ago month comparison — null for custom ranges (see prev*).
  yoySpend: number | null;
  yoyClicks: number | null;
  yoyImpressions?: number | null;
  yoyAvgCpc: number | null;
  yoyCtr?: number | null;
  yoyConversions: number | null;
  yoyCpa: number | null;
  /** Per-conversion-action totals for the active range. Drives the
   *  "Conversions broken down" mini cards under the main Conversions
   *  KPI tile. Only populated when the conversion-action filter is on. */
  conversionsByAction?: Record<string, number>;
}

export interface GoogleAdsDashboardMonthly {
  month: string;
  spend: number;
  conversions: number;
  brandSpend: number;
  genericSpend: number;
  /** Per-conversion-action breakdown for this month. Only populated when
   *  the dashboard has a conversion-action filter active (the default
   *  child-account-owned set or a user-picked subset). */
  conversionsByAction?: Record<string, number>;
}

export interface GoogleAdsDashboardCampaign {
  name: string;
  channelType: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  /** Per-conversion-action breakdown of conversions counted in this row.
   *  Sums to conversions. Empty when the conversion-action filter is off. */
  conversionsByAction?: Record<string, number>;
}

export interface GoogleAdsDashboardKeyword {
  term: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
}

export interface GoogleAdsDashboardSearchTerm {
  term: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa: number | null;
  /** Per-conversion-action breakdown of `conversions`. Only populated
   *  when the dashboard fetch had a conversion-action filter active. */
  conversionsByAction?: Record<string, number>;
  /** Per-category roll-up using the client's editable categories. Only
   *  populated when the client has at least one category configured. */
  conversionsByCategory?: Record<string, number>;
}

export interface GoogleAdsDashboardCompetitor {
  domain: string;
  impressionShare: number;
  overlapRate: number;
  positionAboveRate: number;
  outrankingShare: number;
}

export interface GoogleAdsDashboardAuctionInsight {
  campaignName: string;
  competitors: GoogleAdsDashboardCompetitor[];
}

export interface GoogleAdsDashboardAdGroupAuctionInsight {
  campaignName: string;
  adGroupName: string;
  competitors: GoogleAdsDashboardCompetitor[];
}

export interface GoogleAdsDashboardImpressionShareMonthlyPoint {
  month: string;
  impressionShare: number;
  budgetLost?: number;
  rankLost?: number;
  impressions?: number;
}

export interface GoogleAdsDashboardImpressionShareAdGroup {
  campaignName: string;
  adGroupName: string;
  monthly: GoogleAdsDashboardImpressionShareMonthlyPoint[];
}

export interface GoogleAdsDashboardImpressionShare {
  overallVisibility: number;
  budgetLost: number;
  rankLost: number;
  byCampaign: Array<{
    name: string;
    impressionShare: number;
    budgetLost: number;
    rankLost: number;
    impressions: number;
    monthly?: GoogleAdsDashboardImpressionShareMonthlyPoint[];
  }>;
  monthly?: GoogleAdsDashboardImpressionShareMonthlyPoint[];
  byAdGroup?: GoogleAdsDashboardImpressionShareAdGroup[];
}

export interface GoogleAdsDashboardNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface GoogleAdsDashboardActivityStats {
  negativesAdded: number;
  budgetChanges: number;
  bidAdjustments: number;
  customStats: Array<{ label: string; value: number }>;
}

export interface GoogleAdsDashboardData {
  clientName: string;
  customerId: string;
  slug?: string;
  range?: string;
  dateRangeLabel?: string;
  logoUrl?: string;
  lastUpdated: string;
  availableConversionActions?: string[];
  kpis: GoogleAdsDashboardKpis;
  monthlyTrend: GoogleAdsDashboardMonthly[];
  campaignBreakdown: GoogleAdsDashboardCampaign[];
  topKeywords: GoogleAdsDashboardKeyword[];
  topConverters: GoogleAdsDashboardSearchTerm[];
  budgetWasters: GoogleAdsDashboardSearchTerm[];
  irrelevantTerms: GoogleAdsDashboardSearchTerm[];
  auctionInsights: GoogleAdsDashboardAuctionInsight[];
  adGroupAuctionInsights?: GoogleAdsDashboardAdGroupAuctionInsight[];
  impressionShare: GoogleAdsDashboardImpressionShare;
  activityStats: GoogleAdsDashboardActivityStats;
  notes: GoogleAdsDashboardNote[];
  workDone: Array<{ description: string; date: string }>;
  /** Conversion split by user-defined category for the active range. Each
   *  client configures their own buckets (Phone Calls, Form Submits, Email
   *  Clicks, etc.) on the Client doc. Null when no categorisation exists. */
  conversionSplit?: {
    categories: Array<{ label: string; color: string }>;
    totals: Record<string, number>;
  } | null;
  /** Per-campaign split keyed by category label (top 15 by total). */
  conversionSplitByCampaign?: Array<{ name: string; byCategory: Record<string, number>; total: number }>;
}

/** Per-month historical waste / relevancy figures for the Progress tab's
 * Monthly Trend chart. Powers true per-month overlay lines (instead of
 * projecting a single period's aggregate against each month). */
export interface GoogleAdsDashboardMonthlyWasteRelevancy {
  /** YYYY-MM string. */
  month: string;
  /** Total ad spend that month. */
  totalSpend: number;
  /** Spend on search terms with 0 conversions that month. */
  nonConvertingSpend: number;
  /** Spend on terms currently flagged as irrelevant (in the client's NKL
   *  set today). The trend tells the story "how much budget would today's
   *  NKL have saved each month if it had been in place then." */
  irrelevantSpend: number;
  /** Spend blocked only by competitor-tagged NKLs. Kept out of the default
   *  relevancy % — folded back in when the dashboard competitor toggle is on. */
  competitorExcludedSpend?: number;
  /** Spend blocked only by brand-tagged NKLs. Kept out of the default
   *  relevancy % — folded back in when the dashboard brand toggle is on. */
  brandExcludedSpend?: number;
  /** Spend on search terms matching the client's brand keywords (substring
   *  match). Drives the Overview tab's Monthly Performance brand/generic
   *  split. Zero when the client has no brand keywords configured. */
  brandSpend: number;
}

/** Avoided Spend (negative keyword value tracking) */

export interface GoogleAdsDashboardAvoidedSpend {
  monthsBack: number;
  /** YYYY-MM strings, oldest first. Length = monthsBack. */
  months: string[];
  perKeyword: Array<{
    text: string;
    matchType: "EXACT" | "PHRASE" | "BROAD";
    negatedSince: string;
    monthlySpend: Record<string, number>;
  }>;
  /** Sum across keywords for each month (post-dedup). */
  totals: Record<string, number>;
  /** Convenience sum across all months. */
  cumulativeAvoided: number;
  /** Distinct (keyword, matchType) count after dedup. */
  keywordCount: number;
}

/** Top Ads type */

export interface GoogleAdsDashboardTopAd {
  adId: string;
  /** Internal Google Ads name field (often the asset filename for image ads,
   * e.g. "display_gads_300x250.jpg"). Useful as a fallback label when an
   * image ad has no headline copy. */
  adName?: string;
  campaignName: string;
  adGroupName: string;
  headlines: string[];
  descriptions: string[];
  finalUrl: string | null;
  /** Public Google CDN image URL when available. Set for IMAGE_AD
   * (preview_image_url) and RESPONSIVE_DISPLAY_AD (resolved from the first
   * marketing image asset). null for search ads. */
  imageUrl?: string | null;
  /** Up to 3 representative assets for RDA ads — the best-performing
   * landscape, square, and logo asset (each with Google's BEST/GOOD/LOW/
   * PENDING `performance_label`). Empty for search and IMAGE_AD ads. */
  topAssets?: Array<{
    url: string;
    shape: "landscape" | "square" | "logo";
    performanceLabel: string;
  }>;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  adType?: string;
}

/** Quality Score tracking types */

export interface GoogleAdsDashboardQualityKeyword {
  campaignId: string;
  campaignName: string;
  adGroupId: string;
  adGroupName: string;
  keywordText: string;
  matchType: string;
  qualityScore: number | null;
  creativeQuality: string | null;
  searchPredictedCtr: string | null;
  landingPageQuality: string | null;
  avgCpc: number;
  clicks: number;
  impressions: number;
  spend: number;
  conversions: number;
  costPerConversion: number | null;
  finalUrl: string | null;
}

export interface GoogleAdsDashboardQualitySnapshot {
  month: string;
  keywords: GoogleAdsDashboardQualityKeyword[];
}

/**
 * Per-month aggregate of historical quality-score components, pulled live
 * from Google Ads (metrics.historical_*) so the dashboard chart can show
 * a real 6-month trend even before the monthly snapshot writer has
 * accumulated data.
 *
 * - qualityScore: 1-10, impression-weighted across enabled keywords
 * - creativeQuality / landingPageQuality / searchPredictedCtr: 1-3 numeric
 *   conversions of the BELOW_AVERAGE / AVERAGE / ABOVE_AVERAGE enums
 */
export interface GoogleAdsDashboardQualityTrendPoint {
  month: string; // YYYY-MM
  qualityScore: number | null;
  creativeQuality: number | null;
  searchPredictedCtr: number | null;
  landingPageQuality: number | null;
  avgCpc: number;
  impressions: number;
}

export interface GoogleAdsDashboardQualityData {
  campaigns: Array<{ id: string; name: string }>;
  snapshots: GoogleAdsDashboardQualitySnapshot[];
  topAds: GoogleAdsDashboardTopAd[];
  /** 6-month live QS trend from Google Ads. Optional for back-compat with
   * older Growth Tools deployments. */
  qualityTrend?: GoogleAdsDashboardQualityTrendPoint[];
}

// ============================================================================
// Campaign Budget Management Types
// ============================================================================

export type BidStrategyType =
  | "manual_cpc"
  | "maximize_conversions"
  | "maximize_conversion_value"
  | "target_cpa"
  | "target_roas"
  | "target_impressions"
  | "maximize_clicks";

export interface CampaignBudget {
  id: string;
  auditId: string;
  customerId: string;

  // Campaign reference
  campaignId: string;
  campaignName: string;
  adGroupId?: string;
  adGroupName?: string;

  // Budget allocation (percentage-based)
  budgetPercentage: number;
  calculatedDailyBudget: number; // Calculated: monthly × % ÷ 30.4
  actualDailyBudget?: number; // Last pushed to Google Ads
  lastPushedAt?: string;

  // Bid settings
  bidStrategy: BidStrategyType;
  bidStrategyId?: string;
  manualCpcBid?: number;

  // Targeting
  locationIds?: string[];
  locationNames?: string[];

  // Performance (refreshed from API)
  metricsLastUpdated: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  conversions: number;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

// Monthly budget config (stored on audit or as separate collection)
export interface MonthlyBudgetConfig {
  auditId: string;
  monthlyTotal: number;
  currency: string;
  daysInMonth: number; // Usually 30.4
  updatedAt: string;
}

export interface CampaignBudgetMetrics {
  campaignId: string;
  impressions: number;
  clicks: number;
  avgCpc: number;
  conversions: number;
  costPerConversion: number | null;
}

// ============================================================================
// Ad Extensions Types
// ============================================================================

export type ExtensionType = "sitelink" | "structured_snippet";

export type ExtensionLevel = "account" | "campaign" | "ad_group";

export type ExtensionStatus = "draft" | "deployed" | "paused" | "error";

export interface SitelinkData {
  linkText: string;
  linkUrl: string;
  description1?: string;
  description2?: string;
}

export interface StructuredSnippetData {
  header: string;
  values: string[];
}

export interface AdExtensionAssignment {
  campaignId: string;
  campaignName: string;
}

export interface AdExtension {
  id: string;
  auditId: string;
  customerId: string;

  // Extension type
  extensionType: ExtensionType;

  // Extension data (varies by type)
  extensionData: SitelinkData | StructuredSnippetData;

  // Level & assignments
  level: ExtensionLevel;

  // Google Ads IDs (populated after deploy)
  assetId?: string;
  assetSetId?: string;

  // Assignment targets
  assignedCampaigns: AdExtensionAssignment[];
  assignedAdGroups: AdExtensionAssignment[];

  // Status
  status: ExtensionStatus;
  deployedAt?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

// Pre-defined headers for structured snippets (per Google Ads guidelines)
export const STRUCTURED_SNIPPET_HEADERS = [
  "Destinations",
  "Services",
  "Brands",
  "Schools",
  "Neighborhoods",
  "Types",
  "Collections",
  "Hotels",
  "Insurance Coverage",
  "Models",
  "Entertainment",
  "Activities",
  "Natural Landmarks",
  "Featured Items",
  "Product Types",
  "Services Offered",
  "Programs",
  "Events",
  "Departments",
  "Amenities",
  "Styles",
  "Artists",
  "Owned",
  "Offered",
  "Diets",
  "Curriculums",
  "Insurance Products",
  "Properties",
  "Communities",
  "Shows",
  "Outlets",
  "Clubs",
  "Species",
  "Conditions",
  "Coverage",
  "Plans",
  "Therapists",
  "Forms",
  "Guides",
  "Specializations",
  "Features",
  "Benefits",
  "Rooms",
  "Menu Items",
  "Car Rental Categories",
  "Service Options",
  "Aircraft",
  "Travel Classes",
  "Dining Options",
] as const;

export type StructuredSnippetHeader = (typeof STRUCTURED_SNIPPET_HEADERS)[number];
