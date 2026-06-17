/**
 * Monthly Google Ads budget recommendation engine (pure, unit-tested).
 *
 * Given last month's per-campaign performance and the account's monthly budget,
 * compute a recommended DAILY budget per campaign. The split rewards campaigns
 * that convert well and convert cheaply, anchored to recent spend so the
 * recommendations stay realistic. This is advisory only — nothing here pushes
 * to Google Ads; the UI surfaces the numbers and a human applies them.
 *
 * Scoring per enabled campaign:
 *   - normalise conversion volume, inverse CPA, ROAS, spend share, impression
 *     share and impression share lost to budget (0..1)
 *   - blend performance quality (CPA/ROAS/conversions), current spend and extra
 *     impression opportunity so efficient campaigns with budget-limited reach
 *     are prioritised
 *   - fall back to recent spend share when a campaign has no conversions, so a
 *     brand-new or non-converting campaign isn't starved to zero.
 *
 * Allocation:
 *   - monthly budget split by score share → per-campaign monthly amount
 *   - divide by days in the target month → recommended daily budget
 *   - clamp each campaign's daily move to ±CLAMP_PCT of its recent daily spend
 *     (when recent spend is known) so we never wildly over/under-correct
 */

export interface CampaignPerformance {
  campaignId: string;
  campaignName: string;
  /** Whether this campaign should receive an allocation. Paused → false. */
  enabled: boolean;
  /** Last-month conversions (already scoped to the client's conversion actions). */
  conversions: number;
  /** Last-month total cost/spend in account currency. */
  spend: number;
  /** Last-month conversion value/revenue in account currency, when available. */
  conversionValue?: number | null;
  /** Last-month ROAS / conversion value per cost, when provided directly. */
  roas?: number | null;
  /** Search impression share (0..1, or 0..100 from upstream — normalised here). */
  impressionShare?: number | null;
  /** Search impression share lost to budget (0..1, or 0..100 from upstream). */
  impressionShareLostToBudget?: number | null;
}

export interface CampaignRecommendation {
  campaignId: string;
  campaignName: string;
  /** Recommended daily budget (account currency), rounded to cents. */
  recommendedDailyBudget: number;
  /** Inputs used, persisted for the "based on last month" tooltip. */
  basis: {
    conversions: number;
    spend: number;
    /** Computed cost-per-acquisition, or null when there were no conversions. */
    cpa: number | null;
    /** Computed ROAS / conversion value per cost, or null when unavailable. */
    roas: number | null;
    /** Search impression share used by the recommendation, normalised to 0..1. */
    impressionShare: number | null;
    /** Search impression share lost to budget used by the recommendation, normalised to 0..1. */
    impressionShareLostToBudget: number | null;
    /** Normalised blended score before allocation. */
    score: number;
  };
}

export interface RecommendationInput {
  /** Total monthly budget for the account (account currency). */
  monthlyBudget: number;
  campaigns: CampaignPerformance[];
  /** Number of days in the target month. Defaults to 30.4 (avg) when omitted. */
  daysInMonth?: number;
  /** Conversion weight inside the performance score (0..1). Default 0.35. */
  convWeight?: number;
  /** Inverse-CPA weight inside the performance score (0..1). Default 0.35. */
  cpaWeight?: number;
  /** ROAS weight inside the performance score (0..1). Default 0.3. */
  roasWeight?: number;
  /** Overall performance quality weight. Default 0.6. */
  performanceWeight?: number;
  /** Overall recent spend weight. Default 0.15. */
  spendWeight?: number;
  /** Overall impression opportunity weight. Default 0.25. */
  impressionOpportunityWeight?: number;
  /** Max fractional move from recent daily spend, e.g. 0.5 = ±50%. Default 0.5. */
  clampPct?: number;
}

export interface RecommendationResult {
  recommendations: CampaignRecommendation[];
  /** Sum of recommended daily budgets (post-clamp), rounded to cents. */
  totalRecommendedDaily: number;
  daysInMonth: number;
}

const DEFAULT_DAYS_IN_MONTH = 30.4;
const DEFAULT_CONV_WEIGHT = 0.35;
const DEFAULT_CPA_WEIGHT = 0.35;
const DEFAULT_ROAS_WEIGHT = 0.3;
const DEFAULT_PERFORMANCE_WEIGHT = 0.6;
const DEFAULT_SPEND_WEIGHT = 0.15;
const DEFAULT_IMPRESSION_OPPORTUNITY_WEIGHT = 0.25;
const DEFAULT_CLAMP_PCT = 0.5;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normaliseShare(value: number | null | undefined): number | null {
  const n = finiteNumber(value);
  if (n === null) return null;
  return clampNumber(n > 1 ? n / 100 : n, 0, 1);
}

function normalisePositive(value: number | null, max: number): number {
  return value !== null && value > 0 && max > 0 ? value / max : 0;
}

/**
 * Compute recommended daily budgets across campaigns. Deterministic: campaigns
 * are processed in input order and ties resolve consistently.
 */
export function computeBudgetRecommendations(
  input: RecommendationInput,
): RecommendationResult {
  const daysInMonth =
    input.daysInMonth && input.daysInMonth > 0
      ? input.daysInMonth
      : DEFAULT_DAYS_IN_MONTH;
  const convWeight = input.convWeight ?? DEFAULT_CONV_WEIGHT;
  const cpaWeight = input.cpaWeight ?? DEFAULT_CPA_WEIGHT;
  const roasWeight = input.roasWeight ?? DEFAULT_ROAS_WEIGHT;
  const performanceWeight = input.performanceWeight ?? DEFAULT_PERFORMANCE_WEIGHT;
  const spendWeight = input.spendWeight ?? DEFAULT_SPEND_WEIGHT;
  const impressionOpportunityWeight = input.impressionOpportunityWeight ?? DEFAULT_IMPRESSION_OPPORTUNITY_WEIGHT;
  const clampPct = input.clampPct ?? DEFAULT_CLAMP_PCT;

  const monthlyBudget = Math.max(0, input.monthlyBudget || 0);
  const enabled = input.campaigns.filter((c) => c.enabled);

  // Pre-compute per-campaign performance and the normalisation maxima.
  const withPerformance = enabled.map((c) => {
    const conversions = Math.max(0, c.conversions || 0);
    const spend = Math.max(0, c.spend || 0);
    const conversionValue = Math.max(0, finiteNumber(c.conversionValue) ?? 0);
    const suppliedRoas = finiteNumber(c.roas);
    const roas = suppliedRoas !== null && suppliedRoas > 0
      ? suppliedRoas
      : spend > 0 && conversionValue > 0
        ? conversionValue / spend
        : null;
    const cpa = conversions > 0 ? spend / conversions : null;
    const impressionShare = normaliseShare(c.impressionShare);
    const impressionShareLostToBudget = normaliseShare(c.impressionShareLostToBudget);
    return { c, conversions, spend, conversionValue, roas, cpa, impressionShare, impressionShareLostToBudget };
  });

  const maxConversions = withPerformance.reduce((m, x) => Math.max(m, x.conversions), 0);
  const totalSpend = withPerformance.reduce((s, x) => s + x.spend, 0);
  // For inverse-CPA normalisation we need the min positive CPA (best) and max.
  const cpaValues = withPerformance
    .map((x) => x.cpa)
    .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  const minCpa = cpaValues.length > 0 ? Math.min(...cpaValues) : 0;
  const maxCpa = cpaValues.length > 0 ? Math.max(...cpaValues) : 0;
  const maxRoas = withPerformance.reduce((m, x) => Math.max(m, x.roas ?? 0), 0);

  // Score each campaign.
  const scored = withPerformance.map((x) => {
    const convNorm = maxConversions > 0 ? x.conversions / maxConversions : 0;

    // Inverse-CPA normalised so the lowest CPA → 1 and the highest → ~0.
    // When all CPAs are equal (or only one), every converting campaign gets 1.
    let invCpaNorm = 0;
    if (x.cpa !== null && x.cpa > 0) {
      if (maxCpa === minCpa) {
        invCpaNorm = 1;
      } else {
        invCpaNorm = (maxCpa - x.cpa) / (maxCpa - minCpa);
      }
    }

    const roasNorm = normalisePositive(x.roas, maxRoas);
    const performanceWeightTotal = convWeight + cpaWeight + roasWeight;
    const performanceScore = performanceWeightTotal > 0
      ? (convWeight * convNorm + cpaWeight * invCpaNorm + roasWeight * roasNorm) / performanceWeightTotal
      : 0;
    const spendScore = totalSpend > 0 ? x.spend / totalSpend : 0;
    const lostToBudget = x.impressionShareLostToBudget ?? 0;
    const impressionRoom = x.impressionShare === null ? 0 : 1 - x.impressionShare;
    const impressionOpportunityScore = Math.max(lostToBudget, lostToBudget * 0.7 + impressionRoom * 0.3);
    const totalBlendWeight = performanceWeight + spendWeight + impressionOpportunityWeight;
    let score = totalBlendWeight > 0
      ? (performanceWeight * performanceScore + spendWeight * spendScore + impressionOpportunityWeight * impressionOpportunityScore) / totalBlendWeight
      : 0;

    // Fallback for non-converting campaigns: don't starve them to zero. Use
    // their recent spend share as a small floor so they keep a presence.
    if (x.conversions <= 0) {
      const spendShare = totalSpend > 0 ? x.spend / totalSpend : 0;
      // Damped so converting campaigns still dominate the split.
      score = Math.max(score, spendShare * 0.25);
    }

    return { ...x, convNorm, invCpaNorm, roasNorm, spendScore, impressionOpportunityScore, score };
  });

  const totalScore = scored.reduce((s, x) => s + x.score, 0);
  // If nobody scored (e.g. no conversions and no spend), fall back to an even split.
  const evenShare = scored.length > 0 ? 1 / scored.length : 0;

  const recommendations: CampaignRecommendation[] = scored.map((x) => {
    const share = totalScore > 0 ? x.score / totalScore : evenShare;
    const monthlyAmount = monthlyBudget * share;
    let daily = monthlyAmount / daysInMonth;

    // Clamp to ±clampPct of recent daily spend when we have a recent baseline.
    const recentDaily = x.spend / daysInMonth;
    if (recentDaily > 0 && clampPct > 0) {
      const low = recentDaily * (1 - clampPct);
      const high = recentDaily * (1 + clampPct);
      daily = clampNumber(daily, low, high);
    }

    return {
      campaignId: x.c.campaignId,
      campaignName: x.c.campaignName,
      recommendedDailyBudget: round2(Math.max(0, daily)),
      basis: {
        conversions: round2(x.conversions),
        spend: round2(x.spend),
        cpa: x.cpa === null ? null : round2(x.cpa),
        roas: x.roas === null ? null : round2(x.roas),
        impressionShare: x.impressionShare === null ? null : round2(x.impressionShare),
        impressionShareLostToBudget: x.impressionShareLostToBudget === null ? null : round2(x.impressionShareLostToBudget),
        score: round2(x.score),
      },
    };
  });

  const totalRecommendedDaily = round2(
    recommendations.reduce((s, r) => s + r.recommendedDailyBudget, 0),
  );

  return { recommendations, totalRecommendedDaily, daysInMonth };
}

/**
 * Number of days in the calendar month immediately before `ref` (default now).
 * Used to size last-month-based daily figures correctly.
 */
export function daysInPreviousMonth(ref: Date = new Date()): number {
  // Day 0 of the current month === last day of the previous month.
  return new Date(ref.getFullYear(), ref.getMonth(), 0).getDate();
}
