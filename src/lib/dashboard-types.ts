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

/** Top Ads type */

export interface GoogleAdsDashboardTopAd {
  adId: string;
  campaignName: string;
  adGroupName: string;
  headlines: string[];
  descriptions: string[];
  finalUrl: string | null;
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

export interface GoogleAdsDashboardQualityData {
  campaigns: Array<{ id: string; name: string }>;
  snapshots: GoogleAdsDashboardQualitySnapshot[];
  topAds: GoogleAdsDashboardTopAd[];
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
