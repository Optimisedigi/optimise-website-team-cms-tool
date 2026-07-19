import type { SnapshotDatasetKey } from "./types";

export const GOOGLE_ADS_AUDIT_RUBRIC_VERSION = "2026-07-complete-evidence-v2";
export const GOOGLE_ADS_AUDIT_CATEGORY_IDS = [
  "website", "accountStructure", "keywordIntent", "tracking", "campaignStructure", "channelPerformance",
  "searchQueries", "negativeKeywords", "adsAssets", "brandGeneric", "historicalPerformance", "audienceStrategy", "competition",
] as const;
export type GoogleAdsAuditCategoryId = (typeof GOOGLE_ADS_AUDIT_CATEGORY_IDS)[number];
export type EvidenceState = "pass" | "fail" | "unknown";

export interface ScorecardCheck {
  id: string;
  label: string;
  state: EvidenceState;
  score: number;
  maximum: number;
  rationale: string;
  formula: string;
  threshold: string;
  applicability: "applicable" | "not_applicable" | "unknown";
  evidence: Array<{ datasetKey?: SnapshotDatasetKey; reference: string; rowIndexes?: number[]; identities?: string[] }>;
}
export interface AuditCategoryScorecard {
  id: GoogleAdsAuditCategoryId;
  label: string;
  weight: number;
  score: number | null;
  maximum: number;
  status: "scored" | "insufficient_evidence";
  checks: ScorecardCheck[];
  evidenceSummary: string;
}
export interface GoogleAdsAuditScorecard {
  rubricVersion: typeof GOOGLE_ADS_AUDIT_RUBRIC_VERSION | string;
  unknownDataPolicy: "exclude_from_weighted_denominator";
  categories: AuditCategoryScorecard[];
  total: number | null;
  weightedDenominator: number;
  maximum: 100;
}

export const CATEGORY_WEIGHTS: Record<GoogleAdsAuditCategoryId, number> = {
  website: 10, accountStructure: 8, keywordIntent: 9, tracking: 10, campaignStructure: 8, channelPerformance: 7,
  searchQueries: 9, negativeKeywords: 7, adsAssets: 8, brandGeneric: 6, historicalPerformance: 6, audienceStrategy: 5, competition: 7,
};

/** Unknown evidence is not scored and its category weight is excluded from the denominator. */
export function calculateWeightedScore(categories: AuditCategoryScorecard[]): Pick<GoogleAdsAuditScorecard, "total" | "weightedDenominator" | "maximum"> {
  const scored = categories.filter((category) => category.status === "scored" && category.score !== null && category.maximum > 0);
  const weightedDenominator = scored.reduce((sum, category) => sum + category.weight, 0);
  if (weightedDenominator === 0) return { total: null, weightedDenominator, maximum: 100 };
  const weighted = scored.reduce((sum, category) => sum + (category.score! / category.maximum) * category.weight, 0);
  return { total: Math.round((weighted / weightedDenominator) * 100), weightedDenominator, maximum: 100 };
}

export function scorecard(categories: AuditCategoryScorecard[]): GoogleAdsAuditScorecard {
  return { rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION, unknownDataPolicy: "exclude_from_weighted_denominator", categories, ...calculateWeightedScore(categories) };
}
