/** Types mirrored from website-growth-tools GoogleAdsDashboardData */

export interface GoogleAdsDashboardKpis {
  spend: number;
  clicks: number;
  avgCpc: number;
  conversions: number;
  cpa: number | null;
  // Previous month comparison
  prevSpend: number;
  prevClicks: number;
  prevAvgCpc: number;
  prevConversions: number;
  prevCpa: number | null;
  // Year-ago month comparison
  yoySpend: number;
  yoyClicks: number;
  yoyAvgCpc: number;
  yoyConversions: number;
  yoyCpa: number | null;
}

export interface GoogleAdsDashboardMonthly {
  month: string;
  spend: number;
  conversions: number;
  brandSpend: number;
  genericSpend: number;
}

export interface GoogleAdsDashboardCampaign {
  name: string;
  channelType: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
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
  }>;
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
