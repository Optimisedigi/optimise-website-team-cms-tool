/**
 * Minimal Google Ads audit types, duplicated from website-growth-tools/shared/schema.ts.
 * Kept in CMS so the email generator can run locally without calling growth tools.
 */

export interface GoogleAdsAuditStepResult {
  step: number;
  name: string;
  weight: number;
  score: number; // 0-10
  maxScore: number; // 10
  findings: string[];
  recommendations: string[];
  data?: Record<string, unknown>;
}

export interface GoogleAdsAuditResults {
  id: string;
  customerId: string;
  overallScore: number; // 0-100
  steps: GoogleAdsAuditStepResult[];
  quickWins: string[];
  estimatedMonthlyWaste: number | null;
  accountSummary: {
    totalCampaigns: number;
    activeCampaigns: number;
    totalKeywords: number;
    totalSpend: number;
    totalConversions: number;
    avgCpa: number | null;
    dateRange: string;
  };
  createdAt: string;
}

/** Team-curated selections for email and presentation */
export interface CurationSelections {
  stepFindings: Record<number, number[]>; // step → selected finding indices
  stepRecommendations: Record<number, number[]>; // step → selected rec indices
  emailQuickWins: number[]; // indices into scoredReport.quickWins
  presentationQuickWins: number[]; // indices for presentation
}
