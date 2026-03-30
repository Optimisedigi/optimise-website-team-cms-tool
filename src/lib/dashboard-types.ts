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
