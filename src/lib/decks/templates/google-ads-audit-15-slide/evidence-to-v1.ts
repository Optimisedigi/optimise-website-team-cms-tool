/**
 * Adapter: evidence-backed semantic (version-2) audit payload → the rich v1
 * `GoogleAdsAudit15SlidePayload` consumed by `Component.tsx`.
 *
 * This lets the evidence snapshot render through the established Google Ads
 * audit design (Starfield cover, score ring, AccountGlanceChart, category
 * bars) instead of the minimal semantic renderer.
 *
 * Honesty rule: categories with insufficient evidence are surfaced as
 * "Not assessed" (via `assessed: false`) rather than fabricating a number,
 * and sections the evidence pipeline does not capture are emitted as empty
 * arrays instead of borrowed sample data.
 */
import type {
  AdGroupCategory,
  AuditScoreBar,
  GoogleAdsAudit15SlidePayload,
  LandingPageRow,
  NbTrendGridLine,
  NbTrendMonth,
  RecommendationItem,
  ScoringMethodologyCard,
  SearchTermRow,
  SemanticGoogleAdsAuditPayload,
} from "./payload";

/** Static Optimise Digital contact block — identical across audits. */
const CONTACT = {
  contactName: "Peter Tu",
  contactEmail: "peter@optimisedigital.online",
  contactPhone: "0493053188",
  contactPhoneDisplay: "0493 053 188",
} as const;

const FRAMEWORK_STEPS = [
  { n: "01", title: "Discovery", desc: "Understand the business commercially: goals, margins, constraints. Growth decisions grounded in commercial reality." },
  { n: "02", title: "Foundations", desc: "Audit and strengthen digital foundations before scaling: account audit, tracking, conversion readiness, channel health." },
  { n: "03", title: "Prioritisation", desc: "Identify the highest-impact opportunities and sequence by effort, risk, and expected return." },
  { n: "04", title: "Rollout", desc: "Structured phases, not a big-bang launch. Measure, test, and refine continuously against real outcomes." },
  { n: "05", title: "Scale & learn", desc: "Scale what is working and identify the next stage of growth based on performance data and commercial impact." },
] as const;

/** Category id → v1 step number, display label and methodology description. */
const CATEGORY_META: Record<string, { step: number; label: string; desc: string }> = {
  website: { step: 1, label: "Website & business analysis", desc: "Site readiness to convert paid traffic: landing page quality, CTA clarity, conversion paths, and category-specific pages." },
  accountStructure: { step: 2, label: "Account structure overview", desc: "Campaign hierarchy, budget allocation logic, ad group organisation, and whether the structure supports effective bidding." },
  keywordIntent: { step: 3, label: "Keyword & search intent", desc: "Match type distribution, search intent alignment, keyword relevance, and spend on irrelevant or non-converting terms." },
  tracking: { step: 4, label: "Tracking & measurement setup", desc: "Conversion action setup, GA4 integration, enhanced conversions, attribution, and conversion signal quality for bidding." },
  campaignStructure: { step: 5, label: "Campaign structure analysis", desc: "Budget allocation vs performance, geo-targeting, device adjustments, ad scheduling, and bid strategy alignment." },
  channelPerformance: { step: 6, label: "Channel performance", desc: "ROAS & CPL across Search, Display, PMax, Shopping; cross-channel cannibalisation; budget flow to best performers." },
  searchQueries: { step: 7, label: "Search query analysis", desc: "Actual queries triggering ads: relevance %, wasted query spend, intent alignment, and search term quality." },
  negativeKeywords: { step: 8, label: "Negative keyword management", desc: "Negative keyword coverage, themed list organisation, regular addition history, and estimated preventable waste." },
  adsAssets: { step: 9, label: "Ad copy & assets review", desc: "RSA quality, pin strategy, ad strength scores, extension coverage, and landing page relevance per ad group." },
  brandGeneric: { step: 10, label: "Brand vs generic split", desc: "Three-way segmentation (brand / brand+ / generic), per-tier bidding, incrementality, and competitor brand bidding." },
  historicalPerformance: { step: 11, label: "Historical performance", desc: "Monthly spend, conversions, CPL, ROAS trends since account start. Identifies trajectory, seasonality, inflection points." },
  audienceStrategy: { step: 12, label: "Audience strategy", desc: "Remarketing coverage, customer match & first-party data, in-market audience targeting, and bid adjustments." },
  competition: { step: 13, label: "Competitive landscape", desc: "Own auction visibility: search impression share held, and share lost to budget vs Ad Rank against competitors." },
};

type Scorecard = NonNullable<SemanticGoogleAdsAuditPayload["scorecards"]>[number];

// `AccountGlanceChart` hardcodes Away Digital Teams' monthly series, so the
// evidence adapter may only show that slide for that client. Any other client
// hides it rather than display another client's spend/clicks/conversions.
function isAwayDigitalClient(semantic: SemanticGoogleAdsAuditPayload): boolean {
  const name = String(semantic.clientName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const website = String((semantic.analysis as any)?.websiteAssessment?.websiteUrl ?? "").toLowerCase();
  return name === "away digital teams" || website.includes("awaydigitalteams.com");
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown): string {
  const n = num(value);
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function moneyExact(value: unknown): string {
  return `$${Math.round(num(value)).toLocaleString("en-US")}`;
}

function intStr(value: unknown): string {
  return Math.round(num(value)).toLocaleString("en-US");
}

/** Score → colour band, matching the established deck's thresholds. */
function scoreColors(score: number): { scoreColor: string; barColor: string; scoreClass: string } {
  if (score >= 9) return { scoreColor: "text-green-500", barColor: "bg-green-500", scoreClass: "text-green-500" };
  if (score >= 7) return { scoreColor: "text-lime-600", barColor: "bg-lime-500", scoreClass: "text-lime-600" };
  if (score >= 5) return { scoreColor: "text-amber-500", barColor: "bg-amber-500", scoreClass: "text-amber-500" };
  return { scoreColor: "text-red-500", barColor: "bg-red-500", scoreClass: "text-red-500" };
}

const NOT_ASSESSED_COLORS = { scoreColor: "text-slate-400", barColor: "bg-slate-300", scoreClass: "text-slate-400" };

function overallBand(total: number | null): { label: string; labelClass: string; strokeClass: string } {
  if (total == null) return { label: "Not assessed", labelClass: "text-slate-400", strokeClass: "stroke-slate-400" };
  if (total >= 80) return { label: "Strong", labelClass: "text-green-500", strokeClass: "stroke-green-500" };
  if (total >= 60) return { label: "Room for improvement", labelClass: "text-lime-600", strokeClass: "stroke-lime-500" };
  if (total >= 40) return { label: "Needs work", labelClass: "text-amber-500", strokeClass: "stroke-amber-500" };
  return { label: "Critical", labelClass: "text-red-500", strokeClass: "stroke-red-500" };
}

function scorecardToBar(card: Scorecard): AuditScoreBar {
  const meta = CATEGORY_META[card.id] ?? { step: 99, label: card.label, desc: card.evidenceSummary ?? "" };
  const assessed = card.status === "scored" && card.score != null;
  const rounded = assessed ? Math.round(card.score as number) : 0;
  const colors = assessed ? scoreColors(rounded) : NOT_ASSESSED_COLORS;
  return { step: meta.step, label: meta.label, score: rounded, scoreColor: colors.scoreColor, barColor: colors.barColor, assessed };
}

function scorecardToMethodologyCard(card: Scorecard): ScoringMethodologyCard {
  const meta = CATEGORY_META[card.id] ?? { step: 99, label: card.label, desc: card.evidenceSummary ?? "" };
  const assessed = card.status === "scored" && card.score != null;
  const rounded = assessed ? Math.round(card.score as number) : 0;
  const colors = assessed ? scoreColors(rounded) : NOT_ASSESSED_COLORS;
  return { n: meta.step, name: meta.label, weight: num(card.weight), score: rounded, scoreClass: colors.scoreClass, desc: meta.desc, assessed };
}

function landingTone(cpa: number | null): LandingPageRow["cplTone"] {
  if (cpa == null) return "amber";
  if (cpa >= 3000) return "rose";
  if (cpa >= 1000) return "amber";
  return "emerald";
}

/** Monthly total-spend trend → single-series stacked-bar geometry. */
function buildNbTrend(monthlyTrend: Array<{ month?: string; cost?: number }>): {
  months: NbTrendMonth[];
  gridLines: NbTrendGridLine[];
} {
  const rows = (monthlyTrend ?? []).filter((row) => row && row.month);
  if (!rows.length) return { months: [], gridLines: [] };
  const chartTop = 20;
  const chartBottom = 210;
  const innerH = chartBottom - chartTop;
  const maxCost = Math.max(...rows.map((row) => num(row.cost)), 1);
  const xStart = 48;
  const xEnd = 688;
  const step = rows.length > 1 ? (xEnd - xStart) / (rows.length - 1) : 0;
  const months: NbTrendMonth[] = rows.map((row, index) => {
    const cost = num(row.cost);
    const height = (cost / maxCost) * innerH;
    const barTopY = chartBottom - height;
    const x = xStart + index * step;
    return {
      x,
      centerX: x + 12,
      label: monthLabel(String(row.month)),
      totalY: Math.max(chartTop - 6, barTopY - 6),
      total: money(cost),
      segments: [
        { y: chartBottom, height: 0 },
        { y: chartBottom, height: 0 },
        { y: chartBottom, height: 0 },
        { y: barTopY, height },
      ],
    };
  });
  const gridLines: NbTrendGridLine[] = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    y: chartBottom - frac * innerH,
    label: money(maxCost * frac),
  }));
  return { months, gridLines };
}

function monthLabel(ym: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(ym);
  if (!match) return ym;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return names[Math.max(0, Math.min(11, Number(match[2]) - 1))] ?? ym;
}

export function buildV1PayloadFromEvidence(semantic: SemanticGoogleAdsAuditPayload): GoogleAdsAudit15SlidePayload {
  const analysis = (semantic.analysis ?? {}) as Record<string, any>;
  const scorecards = semantic.scorecards ?? analysis.scoring?.categories ?? [];
  const total: number | null = analysis.scoring?.total ?? null;
  const band = overallBand(total);
  const period = `${String(semantic.provenance.periodStart).slice(0, 10)} – ${String(semantic.provenance.periodEnd).slice(0, 10)}`;
  const websiteUrl: string = analysis.websiteAssessment?.websiteUrl || "";

  const auditScoreBars = (scorecards as Scorecard[]).map(scorecardToBar).sort((a, b) => a.step - b.step);
  const scoringMethodologyCards = (scorecards as Scorecard[]).map(scorecardToMethodologyCard).sort((a, b) => a.n - b.n);

  const adGroupCategories: AdGroupCategory[] = (analysis.channelPerformance ?? []).map((row: any) => {
    const cpa = row.cpa == null ? null : num(row.cpa);
    return {
      name: String(row.name ?? "Unknown channel"),
      spendTotal: money(row.cost),
      cpl: cpa == null ? "0 conv" : `${moneyExact(cpa)} CPL`,
      rows: [
        {
          name: "All campaigns in channel",
          spend: moneyExact(row.cost),
          cpl: cpa == null ? "0 conv" : moneyExact(cpa),
          is: "—",
          variant: "default" as const,
          cplColor: "slate" as const,
          isColor: "muted" as const,
        },
      ],
      opportunity: "",
    };
  });

  const searchTermTopRows: SearchTermRow[] = (analysis.searchTerms?.classified ?? [])
    .filter((row: any) => row && row.category !== "relevant")
    .sort((a: any, b: any) => num(b.spend) - num(a.spend))
    .slice(0, 20)
    .map((row: any) => ({
      term: String(row.term ?? ""),
      spend: moneyExact(row.spend),
      conv: "—",
      cpl: "—",
      budgetLimited: String(row.category ?? "review"),
      budgetLimitedHighlight: row.category === "irrelevant",
    }));

  const landingPageRows: LandingPageRow[] = (analysis.landingPages?.pages ?? [])
    .slice(0, 12)
    .map((row: any) => {
      const cpa = row.cpa == null ? null : num(row.cpa);
      const url = String(row.name ?? "");
      return {
        path: url.replace(/^https?:\/\/[^/]+/, "") || url || "/",
        href: url,
        spend: moneyExact(row.cost),
        clicks: intStr(row.clicks),
        conv: intStr(row.conversions),
        cpl: cpa == null ? "0 conv" : moneyExact(cpa),
        cplTone: landingTone(cpa),
      };
    });

  const recommendations: RecommendationItem[] = (analysis.recommendations ?? [])
    .slice()
    .sort((a: any, b: any) => num(a.priority) - num(b.priority))
    .map((row: any, index: number) => ({
      n: String(index + 1).padStart(2, "0"),
      title: String(row.title ?? "Recommendation"),
      desc: String(row.area ?? "").replace(/_/g, " "),
    }));

  const { months, gridLines } = buildNbTrend(analysis.monthlyTrend ?? []);

  return {
    clientName: semantic.clientName,
    clientWebsite: websiteUrl.replace(/\/$/, ""),
    showAccountGlance: isAwayDigitalClient(semantic),
    auditPeriodLabel: period,
    coverTagline: "A traceable, account-specific review of performance and improvement priorities.",
    ...CONTACT,
    overallScore: total == null ? 0 : Math.round(total),
    overallScoreLabel: band.label,
    overallScoreLabelClass: band.labelClass,
    scoreRingDashoffset: (1 - (total == null ? 0 : total) / 100) * (2 * Math.PI * 54),
    scoreRingStrokeClass: band.strokeClass,
    auditScoreBars,
    nbTrendMonths: months,
    nbTrendGridLines: gridLines,
    nbTrendSegmentColors: ["rgb(59,130,246)", "rgb(168,85,247)", "rgb(245,158,11)", "rgb(16,185,129)"],
    nbTrendLegend: months.length ? [{ x: 0, color: "rgb(16,185,129)", name: "Total monthly spend", cpl: "" }] : [],
    adGroupCategories,
    searchTermTopRows,
    negativePatternRows: [],
    landingPageRows,
    scoringMethodologyCards,
    recommendations,
    frameworkSteps: FRAMEWORK_STEPS.map((step) => ({ ...step })),
  };
}
