/**
 * Payload schema + sample for the `google-ads-audit-15-slide` template.
 *
 * The schema captures the data that varies between Google Ads audit
 * decks (account totals, audit scores, ad-group tables, search-term
 * rows, recommendations, etc.). All structural/prose copy that is
 * essentially the same audit shape across clients is kept inline in
 * the React component — moving it into JSON would make per-client
 * deck production strictly worse, not better.
 *
 * `samplePayload` below is the verbatim Away Digital Teams audit
 * (Jan 2025 – Apr 2026) so the template's preview route and the
 * production catch-all route render the existing deck unchanged.
 */
import type { PayloadSchema } from "../../types";

/* ────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ────────────────────────────────────────────────────────────────── */

export interface AuditScoreBar {
  step: number;
  label: string;
  score: number;
  /** Tailwind text colour class, e.g. "text-red-500". */
  scoreColor: string;
  /** Tailwind bg colour class, e.g. "bg-red-500". */
  barColor: string;
  /** When `false`, the category had insufficient evidence: render "N/A" /
   *  "Not assessed" instead of a fabricated numeric score. Defaults to true. */
  assessed?: boolean;
}

export interface NbTrendSegment {
  y: number;
  height: number;
}

export interface NbTrendMonth {
  /** X position of the bar (rect x attribute). */
  x: number;
  /** Centred X used for the rotated month label and total label. */
  centerX: number;
  label: string;
  /** Y position of the total label above the stack. */
  totalY: number;
  /** Total dollars text shown above the stack. */
  total: string;
  /** Stacked segments in draw order: 4 segments, colours from
   *  `nbTrendSegmentColors`. */
  segments: [NbTrendSegment, NbTrendSegment, NbTrendSegment, NbTrendSegment];
}

export interface NbTrendGridLine {
  y: number;
  label: string;
}

export interface NbTrendLegendEntry {
  /** Legend swatch X (text labels are offset by +17). */
  x: number;
  color: string;
  name: string;
  cpl: string;
}

export type AdGroupRowVariant = "default" | "rose" | "muted";
export type AdGroupCplColor = "emerald" | "slate";
export type AdGroupIsColor = "amber" | "slate" | "muted";

export interface AdGroupRow {
  name: string;
  spend: string;
  cpl: string;
  is: string;
  variant: AdGroupRowVariant;
  cplColor?: AdGroupCplColor;
  isColor?: AdGroupIsColor;
}

export interface AdGroupCategory {
  name: string;
  spendTotal: string;
  cpl: string;
  rows: AdGroupRow[];
  /** Markdown-lite opportunity copy. `**bold**` spans render as
   *  <span className="font-semibold">. Plain text otherwise. The full
   *  string must include the leading "Opportunity:" prefix if the
   *  template should display one. */
  opportunity: string;
}

export interface SearchTermRow {
  term: string;
  spend: string;
  conv: string;
  cpl: string;
  budgetLimited: string;
  /** When `false`, render the budget-limited cell in muted slate
   *  rather than amber. Defaults to `true` when omitted. */
  budgetLimitedHighlight?: boolean;
}

export interface NegativePatternRow {
  label: string;
  detail: string;
  examples: string;
  wasted: string;
  terms: string;
}

export type LandingPageCplTone = "rose" | "amber" | "emerald";

export interface LandingPageRow {
  path: string;
  href: string;
  spend: string;
  clicks: string;
  conv: string;
  cpl: string;
  cplTone: LandingPageCplTone;
}

export interface ScoringMethodologyCard {
  /** Step number (1-13). */
  n: number;
  name: string;
  /** Weight (importance). */
  weight: number;
  /** Score (0-10). */
  score: number;
  /** Tailwind class for the score colour, e.g. "text-amber-500". */
  scoreClass: string;
  desc: string;
  /** When `false`, render "Not assessed" instead of a numeric score. */
  assessed?: boolean;
}

export interface RecommendationItem {
  /** Two-digit display index, e.g. "01". */
  n: string;
  title: string;
  desc: string;
}

export interface FrameworkStep {
  n: string;
  title: string;
  desc: string;
}

export interface SemanticAuditSlide {
  id: string;
  title: string;
  required: boolean;
  evidence: unknown;
  assessment: "opportunity" | "mixed" | "strength" | "not_applicable";
  completeness: "complete" | "partial" | "unavailable";
  hidden: boolean;
}

export interface SemanticGoogleAdsAuditPayload {
  version: 2;
  templateSlug: "google-ads-audit-15-slide";
  auditId: string;
  snapshotId: string;
  clientName: string;
  provenance: {
    requestedAt: string;
    capturedAt: string;
    periodStart: string;
    periodEnd: string;
    accountTimeZone: string;
    currencyCode: string;
    earliestAvailableActivityDate: string;
    retentionCaveat?: string;
    sourceRowCounts?: Record<string, number>;
    rubricVersion?: string;
    unknownDataPolicy?: "exclude_from_weighted_denominator";
  };
  analysis: Record<string, any>;
  scorecards?: Array<{ id: string; label: string; weight: number; score: number | null; maximum: 10; status: "scored" | "insufficient_evidence"; evidenceSummary?: string }>;
  slides: SemanticAuditSlide[];
}

export interface GoogleAdsAudit15SlidePayload {
  /** Client display name, e.g. "Away Digital Teams". */
  clientName: string;
  /** External-facing website for the closing CTA link, no trailing slash. */
  clientWebsite: string;
  /** Gate for the "Account at a glance" slide. `AccountGlanceChart` currently
   *  hardcodes Away Digital's monthly series, so the evidence adapter only sets
   *  this true for that client; other clients hide the slide rather than show
   *  another client's data. Undefined (legacy hand-authored decks) = show. */
  showAccountGlance?: boolean;
  /** Cover-card period label, e.g. "January 2025 – April 2026". */
  auditPeriodLabel: string;
  /** Subtitle paragraph on the cover slide. */
  coverTagline: string;
  /** Closing slide: Optimise Digital contact name. */
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** Display phone (with spaces), e.g. "0493 053 188". */
  contactPhoneDisplay: string;

  /** Overall audit score (0-100). */
  overallScore: number;
  /** Score-ring colour band caption, e.g. "Room for improvement". */
  overallScoreLabel: string;
  /** Tailwind text colour for the score-band caption. */
  overallScoreLabelClass: string;
  /** stroke-dashoffset for the score ring (out of 339.292). Lower =
   *  fuller ring. Derive from score: (1 - score/100) * 339.292. */
  scoreRingDashoffset: number;
  /** Tailwind stroke class for the filled portion of the score ring. */
  scoreRingStrokeClass: string;

  auditScoreBars: AuditScoreBar[];
  nbTrendMonths: NbTrendMonth[];
  nbTrendGridLines: NbTrendGridLine[];
  /** Segment colours, in draw order — must match
   *  `nbTrendMonths[].segments` order. */
  nbTrendSegmentColors: [string, string, string, string];
  nbTrendLegend: NbTrendLegendEntry[];
  adGroupCategories: AdGroupCategory[];
  searchTermTopRows: SearchTermRow[];
  negativePatternRows: NegativePatternRow[];
  landingPageRows: LandingPageRow[];
  scoringMethodologyCards: ScoringMethodologyCard[];
  recommendations: RecommendationItem[];
  frameworkSteps: FrameworkStep[];
}

/* ────────────────────────────────────────────────────────────────── */
/*  Validator                                                          */
/* ────────────────────────────────────────────────────────────────── */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}
function isArr<T>(v: unknown, item: (x: unknown) => x is T): v is T[] {
  return Array.isArray(v) && v.every(item);
}

function isAuditScoreBar(v: unknown): v is AuditScoreBar {
  return (
    isObj(v) &&
    isNum(v.step) &&
    isStr(v.label) &&
    isNum(v.score) &&
    isStr(v.scoreColor) &&
    isStr(v.barColor) &&
    (v.assessed === undefined || isBool(v.assessed))
  );
}

function isNbTrendSegment(v: unknown): v is NbTrendSegment {
  return isObj(v) && isNum(v.y) && isNum(v.height);
}

function isNbTrendMonth(v: unknown): v is NbTrendMonth {
  if (!isObj(v)) return false;
  if (!isNum(v.x) || !isNum(v.centerX) || !isStr(v.label)) return false;
  if (!isNum(v.totalY) || !isStr(v.total)) return false;
  if (!Array.isArray(v.segments) || v.segments.length !== 4) return false;
  return v.segments.every(isNbTrendSegment);
}

function isNbTrendGridLine(v: unknown): v is NbTrendGridLine {
  return isObj(v) && isNum(v.y) && isStr(v.label);
}

function isNbTrendLegendEntry(v: unknown): v is NbTrendLegendEntry {
  return (
    isObj(v) &&
    isNum(v.x) &&
    isStr(v.color) &&
    isStr(v.name) &&
    isStr(v.cpl)
  );
}

function isAdGroupRow(v: unknown): v is AdGroupRow {
  if (!isObj(v)) return false;
  if (!isStr(v.name) || !isStr(v.spend) || !isStr(v.cpl) || !isStr(v.is)) return false;
  if (v.variant !== "default" && v.variant !== "rose" && v.variant !== "muted") return false;
  if (v.cplColor !== undefined && v.cplColor !== "emerald" && v.cplColor !== "slate") return false;
  if (
    v.isColor !== undefined &&
    v.isColor !== "amber" &&
    v.isColor !== "slate" &&
    v.isColor !== "muted"
  )
    return false;
  return true;
}

function isAdGroupCategory(v: unknown): v is AdGroupCategory {
  return (
    isObj(v) &&
    isStr(v.name) &&
    isStr(v.spendTotal) &&
    isStr(v.cpl) &&
    isArr(v.rows, isAdGroupRow) &&
    isStr(v.opportunity)
  );
}

function isSearchTermRow(v: unknown): v is SearchTermRow {
  if (!isObj(v)) return false;
  if (!isStr(v.term) || !isStr(v.spend) || !isStr(v.conv)) return false;
  if (!isStr(v.cpl) || !isStr(v.budgetLimited)) return false;
  if (v.budgetLimitedHighlight !== undefined && !isBool(v.budgetLimitedHighlight)) return false;
  return true;
}

function isNegativePatternRow(v: unknown): v is NegativePatternRow {
  return (
    isObj(v) &&
    isStr(v.label) &&
    isStr(v.detail) &&
    isStr(v.examples) &&
    isStr(v.wasted) &&
    isStr(v.terms)
  );
}

function isLandingPageRow(v: unknown): v is LandingPageRow {
  if (!isObj(v)) return false;
  if (!isStr(v.path) || !isStr(v.href)) return false;
  if (!isStr(v.spend) || !isStr(v.clicks) || !isStr(v.conv) || !isStr(v.cpl)) return false;
  if (v.cplTone !== "rose" && v.cplTone !== "amber" && v.cplTone !== "emerald") return false;
  return true;
}

function isScoringMethodologyCard(v: unknown): v is ScoringMethodologyCard {
  return (
    isObj(v) &&
    isNum(v.n) &&
    isStr(v.name) &&
    isNum(v.weight) &&
    isNum(v.score) &&
    isStr(v.scoreClass) &&
    isStr(v.desc) &&
    (v.assessed === undefined || isBool(v.assessed))
  );
}

function isRecommendationItem(v: unknown): v is RecommendationItem {
  return isObj(v) && isStr(v.n) && isStr(v.title) && isStr(v.desc);
}

function isFrameworkStep(v: unknown): v is FrameworkStep {
  return isObj(v) && isStr(v.n) && isStr(v.title) && isStr(v.desc);
}

function isNbTrendSegmentColors(
  v: unknown,
): v is [string, string, string, string] {
  return Array.isArray(v) && v.length === 4 && v.every(isStr);
}

function parsePayload(input: unknown): GoogleAdsAudit15SlidePayload {
  if (!isObj(input)) {
    throw new TypeError("google-ads-audit-15-slide payload: expected an object");
  }

  const requireStr = (k: keyof GoogleAdsAudit15SlidePayload): string => {
    const v = input[k as string];
    if (!isStr(v)) {
      throw new TypeError(
        `google-ads-audit-15-slide payload: field "${String(k)}" must be a string`,
      );
    }
    return v;
  };
  const requireNum = (k: keyof GoogleAdsAudit15SlidePayload): number => {
    const v = input[k as string];
    if (!isNum(v)) {
      throw new TypeError(
        `google-ads-audit-15-slide payload: field "${String(k)}" must be a number`,
      );
    }
    return v;
  };
  const requireArr = <T>(
    k: keyof GoogleAdsAudit15SlidePayload,
    item: (x: unknown) => x is T,
  ): T[] => {
    const v = input[k as string];
    if (!isArr(v, item)) {
      throw new TypeError(
        `google-ads-audit-15-slide payload: field "${String(k)}" must be an array of valid items`,
      );
    }
    return v;
  };

  const colors = input.nbTrendSegmentColors;
  if (!isNbTrendSegmentColors(colors)) {
    throw new TypeError(
      'google-ads-audit-15-slide payload: field "nbTrendSegmentColors" must be a 4-tuple of strings',
    );
  }

  if (input.showAccountGlance !== undefined && !isBool(input.showAccountGlance)) {
    throw new TypeError('google-ads-audit-15-slide payload: field "showAccountGlance" must be a boolean');
  }

  return {
    clientName: requireStr("clientName"),
    clientWebsite: requireStr("clientWebsite"),
    ...(input.showAccountGlance !== undefined ? { showAccountGlance: input.showAccountGlance as boolean } : {}),
    auditPeriodLabel: requireStr("auditPeriodLabel"),
    coverTagline: requireStr("coverTagline"),
    contactName: requireStr("contactName"),
    contactEmail: requireStr("contactEmail"),
    contactPhone: requireStr("contactPhone"),
    contactPhoneDisplay: requireStr("contactPhoneDisplay"),
    overallScore: requireNum("overallScore"),
    overallScoreLabel: requireStr("overallScoreLabel"),
    overallScoreLabelClass: requireStr("overallScoreLabelClass"),
    scoreRingDashoffset: requireNum("scoreRingDashoffset"),
    scoreRingStrokeClass: requireStr("scoreRingStrokeClass"),
    auditScoreBars: requireArr("auditScoreBars", isAuditScoreBar),
    nbTrendMonths: requireArr("nbTrendMonths", isNbTrendMonth),
    nbTrendGridLines: requireArr("nbTrendGridLines", isNbTrendGridLine),
    nbTrendSegmentColors: colors,
    nbTrendLegend: requireArr("nbTrendLegend", isNbTrendLegendEntry),
    adGroupCategories: requireArr("adGroupCategories", isAdGroupCategory),
    searchTermTopRows: requireArr("searchTermTopRows", isSearchTermRow),
    negativePatternRows: requireArr("negativePatternRows", isNegativePatternRow),
    landingPageRows: requireArr("landingPageRows", isLandingPageRow),
    scoringMethodologyCards: requireArr("scoringMethodologyCards", isScoringMethodologyCard),
    recommendations: requireArr("recommendations", isRecommendationItem),
    frameworkSteps: requireArr("frameworkSteps", isFrameworkStep),
  };
}

function parseSemanticPayload(input: unknown): SemanticGoogleAdsAuditPayload {
  if (!isObj(input) || input.version !== 2 || input.templateSlug !== "google-ads-audit-15-slide") throw new TypeError("Invalid semantic Google Ads audit payload");
  if (!isStr(input.auditId) || !isStr(input.snapshotId) || !isStr(input.clientName) || !isObj(input.provenance) || !isObj(input.analysis) || !Array.isArray(input.slides)) throw new TypeError("Semantic Google Ads audit payload is incomplete");
  const provenance = input.provenance;
  for (const field of ["requestedAt", "capturedAt", "periodStart", "periodEnd", "accountTimeZone", "currencyCode", "earliestAvailableActivityDate"] as const) {
    if (!isStr(provenance[field]) || !provenance[field]) throw new TypeError(`Semantic Google Ads audit provenance field is invalid: ${field}`);
  }
  if (provenance.retentionCaveat !== undefined && !isStr(provenance.retentionCaveat)) throw new TypeError("Semantic Google Ads audit retention caveat must be a string");
  if (provenance.sourceRowCounts !== undefined && (!isObj(provenance.sourceRowCounts) || Object.values(provenance.sourceRowCounts).some((count) => !isNum(count) || count < 0))) throw new TypeError("Semantic Google Ads audit source row counts are invalid");
  const ids = new Set<string>();
  for (const slide of input.slides) {
    if (!isObj(slide) || !isStr(slide.id) || !isStr(slide.title) || !isBool(slide.required) || !isBool(slide.hidden) || !["opportunity", "mixed", "strength", "not_applicable"].includes(String(slide.assessment)) || !["complete", "partial", "unavailable"].includes(String(slide.completeness))) throw new TypeError("Invalid semantic Google Ads audit slide");
    if (ids.has(slide.id)) throw new TypeError(`Duplicate semantic slide ID: ${slide.id}`);
    if (slide.required && slide.hidden) throw new TypeError(`Required semantic slide cannot be hidden: ${slide.id}`);
    ids.add(slide.id);
  }
  for (const required of ["cover", "executive-summary", "recommendations", "closing"]) {
    const slide = input.slides.find((candidate) => isObj(candidate) && candidate.id === required);
    if (!slide || slide.required !== true) throw new TypeError(`Missing required semantic slide: ${required}`);
  }
  return input as unknown as SemanticGoogleAdsAuditPayload;
}

export type GoogleAdsAuditTemplatePayload = GoogleAdsAudit15SlidePayload | SemanticGoogleAdsAuditPayload;

function parseVersionedPayload(input: unknown): GoogleAdsAuditTemplatePayload {
  return isObj(input) && input.version === 2 ? parseSemanticPayload(input) : parsePayload(input);
}

export const googleAdsAudit15SlideSchema: PayloadSchema<GoogleAdsAuditTemplatePayload> = {
  name: "google-ads-audit-15-slide payload",
  parse: parseVersionedPayload,
  safeParse(input) {
    try {
      return { ok: true, value: parseVersionedPayload(input) };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/* ────────────────────────────────────────────────────────────────── */
/*  Sample payload — verbatim Away Digital Teams audit                 */
/* ────────────────────────────────────────────────────────────────── */

export const googleAdsAudit15SlideSamplePayload: GoogleAdsAudit15SlidePayload = {
  clientName: "Away Digital Teams",
  clientWebsite: "https://awaydigital.com",
  auditPeriodLabel: "January 2025 \u2013 April 2026",
  coverTagline:
    "A deep-dive Google Ads audit and optimisation plan to reverse rising CPL and improve lead volume.",
  contactName: "Peter Tu",
  contactEmail: "peter@optimisedigital.online",
  contactPhone: "0493053188",
  contactPhoneDisplay: "0493 053 188",
  overallScore: 71,
  overallScoreLabel: "Room for improvement",
  overallScoreLabelClass: "text-lime-600",
  scoreRingDashoffset: 98.395,
  scoreRingStrokeClass: "stroke-lime-500",
  auditScoreBars: [
    { step: 3, label: "Keyword & search intent", score: 3, scoreColor: "text-red-500", barColor: "bg-red-500" },
    { step: 13, label: "Competitive landscape", score: 3, scoreColor: "text-red-500", barColor: "bg-red-500" },
    { step: 1, label: "Website & business analysis", score: 5, scoreColor: "text-amber-500", barColor: "bg-amber-500" },
    { step: 11, label: "Historical performance", score: 5, scoreColor: "text-amber-500", barColor: "bg-amber-500" },
    { step: 6, label: "Channel performance", score: 7, scoreColor: "text-lime-600", barColor: "bg-lime-500" },
    { step: 7, label: "Search query analysis", score: 7, scoreColor: "text-lime-600", barColor: "bg-lime-500" },
    { step: 2, label: "Account structure overview", score: 8, scoreColor: "text-lime-600", barColor: "bg-lime-500" },
    { step: 4, label: "Tracking & measurement setup", score: 8, scoreColor: "text-lime-600", barColor: "bg-lime-500" },
    { step: 5, label: "Campaign structure analysis", score: 8, scoreColor: "text-lime-600", barColor: "bg-lime-500" },
    { step: 10, label: "Brand vs generic split", score: 8, scoreColor: "text-lime-600", barColor: "bg-lime-500" },
    { step: 8, label: "Negative keyword management", score: 10, scoreColor: "text-green-500", barColor: "bg-green-500" },
    { step: 9, label: "Ad copy & assets review", score: 10, scoreColor: "text-green-500", barColor: "bg-green-500" },
    { step: 12, label: "Audience strategy", score: 10, scoreColor: "text-green-500", barColor: "bg-green-500" },
  ],
  nbTrendSegmentColors: [
    "rgb(59,130,246)",
    "rgb(168,85,247)",
    "rgb(245,158,11)",
    "rgb(16,185,129)",
  ],
  nbTrendMonths: [
    { x: 48.0, centerX: 60.0, label: "Jan", totalY: 174.4, total: "$8.6k", segments: [{ y: 206.4, height: 3.6 }, { y: 202.1, height: 4.3 }, { y: 193.0, height: 9.2 }, { y: 178.4, height: 14.6 }] },
    { x: 90.7, centerX: 102.7, label: "Feb", totalY: 143.2, total: "$17.1k", segments: [{ y: 202.8, height: 7.2 }, { y: 194.3, height: 8.5 }, { y: 175.9, height: 18.3 }, { y: 147.2, height: 28.7 }] },
    { x: 133.3, centerX: 145.3, label: "Mar", totalY: 114.1, total: "$25.0k", segments: [{ y: 199.2, height: 10.8 }, { y: 188.4, height: 10.8 }, { y: 175.8, height: 12.6 }, { y: 118.1, height: 57.7 }] },
    { x: 176.0, centerX: 188.0, label: "Apr", totalY: 128.6, total: "$21.1k", segments: [{ y: 200.4, height: 9.6 }, { y: 190.7, height: 9.7 }, { y: 180.0, height: 10.7 }, { y: 132.6, height: 47.4 }] },
    { x: 218.7, centerX: 230.7, label: "May", totalY: 120.2, total: "$23.4k", segments: [{ y: 186.7, height: 23.3 }, { y: 160.1, height: 26.6 }, { y: 136.4, height: 23.7 }, { y: 124.2, height: 12.1 }] },
    { x: 261.3, centerX: 273.3, label: "Jun", totalY: 126.5, total: "$21.7k", segments: [{ y: 193.0, height: 17.0 }, { y: 172.0, height: 21.1 }, { y: 153.7, height: 18.2 }, { y: 130.5, height: 23.2 }] },
    { x: 304.0, centerX: 316.0, label: "Jul", totalY: 104.1, total: "$27.8k", segments: [{ y: 186.6, height: 23.4 }, { y: 157.0, height: 29.6 }, { y: 130.9, height: 26.1 }, { y: 108.1, height: 22.9 }] },
    { x: 346.7, centerX: 358.7, label: "Aug", totalY: 90.8, total: "$31.4k", segments: [{ y: 180.8, height: 29.2 }, { y: 154.7, height: 26.1 }, { y: 124.1, height: 30.6 }, { y: 94.8, height: 29.2 }] },
    { x: 389.3, centerX: 401.3, label: "Sep", totalY: 77.2, total: "$35.1k", segments: [{ y: 184.7, height: 25.3 }, { y: 137.4, height: 47.3 }, { y: 114.0, height: 23.4 }, { y: 81.2, height: 32.8 }] },
    { x: 432.0, centerX: 444.0, label: "Oct", totalY: 41.2, total: "$44.9k", segments: [{ y: 175.7, height: 34.3 }, { y: 116.6, height: 59.1 }, { y: 87.2, height: 29.4 }, { y: 45.2, height: 42.0 }] },
    { x: 474.7, centerX: 486.7, label: "Nov", totalY: 53.3, total: "$41.6k", segments: [{ y: 190.7, height: 19.3 }, { y: 137.3, height: 53.4 }, { y: 106.6, height: 30.7 }, { y: 57.3, height: 49.3 }] },
    { x: 517.3, centerX: 529.3, label: "Dec", totalY: 142.2, total: "$17.4k", segments: [{ y: 192.3, height: 17.7 }, { y: 181.4, height: 10.9 }, { y: 166.0, height: 15.4 }, { y: 146.2, height: 19.8 }] },
    { x: 560.0, centerX: 572.0, label: "Jan", totalY: 93.5, total: "$30.7k", segments: [{ y: 170.9, height: 39.1 }, { y: 138.3, height: 32.6 }, { y: 112.1, height: 26.2 }, { y: 97.5, height: 14.6 }] },
    { x: 602.7, centerX: 614.7, label: "Feb", totalY: 16.0, total: "$51.8k", segments: [{ y: 145.0, height: 65.0 }, { y: 82.2, height: 62.8 }, { y: 47.2, height: 35.0 }, { y: 20.0, height: 27.2 }] },
    { x: 645.3, centerX: 657.3, label: "Mar", totalY: 47.4, total: "$43.2k", segments: [{ y: 139.8, height: 70.2 }, { y: 97.1, height: 42.6 }, { y: 78.8, height: 18.3 }, { y: 51.4, height: 27.5 }] },
    { x: 688.0, centerX: 700.0, label: "Apr", totalY: 58.7, total: "$40.2k", segments: [{ y: 132.3, height: 77.7 }, { y: 101.5, height: 30.8 }, { y: 94.7, height: 6.9 }, { y: 62.7, height: 32.0 }] },
  ],
  nbTrendGridLines: [
    { y: 20.0, label: "$52k" },
    { y: 67.5, label: "$39k" },
    { y: 115.0, label: "$26k" },
    { y: 162.5, label: "$13k" },
    { y: 210.0, label: "$0k" },
  ],
  nbTrendLegend: [
    { x: 0, color: "rgb(59,130,246)", name: "Marketing/Graphics", cpl: "$1,413 CPL" },
    { x: 160, color: "rgb(168,85,247)", name: "Developer/IT", cpl: "$1,636 CPL" },
    { x: 320, color: "rgb(245,158,11)", name: "Finance", cpl: "$2,676 CPL" },
    { x: 480, color: "rgb(16,185,129)", name: "Outsourcing", cpl: "$1,275 CPL" },
  ],
  adGroupCategories: [
    {
      name: "Marketing/Graphics",
      spendTotal: "$114K",
      cpl: "$1,413 CPL",
      rows: [
        { name: "Digital Marketing Specialist", spend: "$25,555", cpl: "$1,127", is: "<10%", variant: "default", cplColor: "emerald", isColor: "amber" },
        { name: "Social Media Specialist", spend: "$18,564", cpl: "$4,641", is: "<10%", variant: "rose" },
        { name: "3D Animator", spend: "$16,563", cpl: "$1,035", is: "<10%", variant: "default", cplColor: "emerald", isColor: "amber" },
        { name: "Game Designer", spend: "$12,693", cpl: "$2,539", is: "<10%", variant: "rose" },
        { name: "Graphic Designer", spend: "$6,950", cpl: "$1,158", is: "11.7%", variant: "default", cplColor: "emerald", isColor: "slate" },
        { name: "Content Writer", spend: "$6,394", cpl: "$913", is: "<10%", variant: "default", cplColor: "emerald", isColor: "amber" },
        { name: "PPC/SEM Specialist", spend: "$4,965", cpl: "$1,655", is: "<10%", variant: "default", cplColor: "slate", isColor: "muted" },
        { name: "SEO Specialist", spend: "$4,450", cpl: "$1,112", is: "<10%", variant: "default", cplColor: "emerald", isColor: "amber" },
        { name: "UX/UI Designer", spend: "$3,983", cpl: "$3,983", is: "<10%", variant: "rose" },
        { name: "Video Editor", spend: "$2,158", cpl: "$360", is: "24.3%", variant: "default", cplColor: "emerald", isColor: "slate" },
        { name: "Other (Generic, Media, Graphic Designers, Generic Marketing)", spend: "$11,729", cpl: "$2,346", is: "<10%", variant: "rose" },
      ],
      opportunity:
        "**Opportunity:** Digital Marketing Specialist, 3D Animator, Content Writer & SEO Specialist all convert below average with <10% impression share - clear headroom to scale.",
    },
    {
      name: "Developer/IT",
      spendTotal: "$113K",
      cpl: "$1,636 CPL",
      rows: [
        { name: "IT Services", spend: "$34,698", cpl: "$1,157", is: "<10%", variant: "default", cplColor: "emerald", isColor: "amber" },
        { name: "App Developer", spend: "$21,195", cpl: "$2,355", is: "<10%", variant: "rose" },
        { name: "Software developers", spend: "$14,306", cpl: "$1,192", is: "<10%", variant: "default", cplColor: "emerald", isColor: "amber" },
        { name: "Full Stack Developer", spend: "$12,946", cpl: "$2,158", is: "10.5%", variant: "rose" },
        { name: "eCom Developer", spend: "$7,521", cpl: "$2,507", is: "<10%", variant: "rose" },
        { name: "Front end Developer", spend: "$5,186", cpl: "$1,729", is: "<10%", variant: "default", cplColor: "slate", isColor: "muted" },
        { name: "Data Engineer", spend: "$4,216", cpl: "$4,216", is: "<10%", variant: "rose" },
        { name: "Back end Developer", spend: "$3,961", cpl: "$1,981", is: "<10%", variant: "default", cplColor: "slate", isColor: "muted" },
        { name: "Data Analyst", spend: "$3,241", cpl: "$1,389", is: "<10%", variant: "default", cplColor: "slate", isColor: "muted" },
        { name: "DevOps Engineer", spend: "$2,334", cpl: "$2,334", is: "<10%", variant: "rose" },
        { name: "Other (QA/QC, Cloud Engineer, Sys Admin, Prompt Engineers)", spend: "$3,818", cpl: "0 conv", is: "<10%", variant: "rose" },
      ],
      opportunity:
        "**Opportunity:** IT Services ($1,157 CPL, <10% IS) & Software developers ($1,192 CPL) are the clear winners - scale these and pause the high-CPL outliers (App Dev, eCom Dev, Data Engineer, DevOps).",
    },
    {
      name: "Finance",
      spendTotal: "$71K",
      cpl: "$2,676 CPL",
      rows: [
        { name: "Payroll Specialists", spend: "$18,145", cpl: "$3,629", is: "<10%", variant: "rose" },
        { name: "Generic - Financial", spend: "$14,144", cpl: "$2,829", is: "<10%", variant: "rose" },
        { name: "Bookkeeper", spend: "$12,558", cpl: "$3,140", is: "<10%", variant: "rose" },
        { name: "Accounts Payable", spend: "$10,780", cpl: "$4,312", is: "<10%", variant: "rose" },
        { name: "Accounts Receivable", spend: "$8,887", cpl: "$1,270", is: "<10%", variant: "default", cplColor: "emerald", isColor: "amber" },
        { name: "Accountant", spend: "$5,614", cpl: "$1,871", is: "<10%", variant: "default", cplColor: "slate", isColor: "muted" },
        { name: "Finance - Industry", spend: "$795", cpl: "0 conv", is: "<10%", variant: "rose" },
      ],
      opportunity:
        "**Opportunity:** Only Accounts Receivable ($1,270 CPL, <10% IS) is performing - scale this aggressively and consider pausing the rest while the category is restructured.",
    },
    {
      name: "Outsourcing",
      spendTotal: "$87K",
      cpl: "$1,275 CPL",
      rows: [
        { name: "outsourcing", spend: "$76,864", cpl: "$1,240", is: "10.8%", variant: "default", cplColor: "emerald", isColor: "slate" },
        { name: "back office outsourcing", spend: "$5,994", cpl: "$1,090", is: "<10%", variant: "default", cplColor: "emerald", isColor: "amber" },
        { name: "bpo", spend: "$2,912", cpl: "$2,912", is: "<10%", variant: "rose" },
        { name: "rpo", spend: "$1,099", cpl: "0 conv", is: "<10%", variant: "rose" },
        { name: "philippines", spend: "$380", cpl: "0 conv", is: "10.7%", variant: "muted" },
      ],
      opportunity:
        "**Opportunity:** 2 winners (outsourcing, back office outsourcing) both below average CPL with only ~10% IS - significant room to scale once Quality Score is improved.",
    },
  ],
  searchTermTopRows: [
    { term: "offshore staff", spend: "$491", conv: "1", cpl: "$491", budgetLimited: "Yes (29%)" },
    { term: "offshore admin", spend: "$345", conv: "1", cpl: "$345", budgetLimited: "Yes (29%)" },
    { term: "offshore accounting", spend: "$264", conv: "1", cpl: "$264", budgetLimited: "Yes (31%)" },
    { term: "outsourcing admin work", spend: "$239", conv: "1", cpl: "$239", budgetLimited: "Yes (47%)" },
    { term: "outsourcing graphic design", spend: "$151", conv: "1", cpl: "$151", budgetLimited: "Yes (29%)" },
    { term: "hire commission sales people", spend: "$150", conv: "1", cpl: "$150", budgetLimited: "Yes (29%)" },
    { term: "offshore staffing", spend: "$127", conv: "1", cpl: "$127", budgetLimited: "Yes (47%)" },
    { term: "digital marketing agency brisbane", spend: "$94", conv: "1", cpl: "$94", budgetLimited: "Yes (32%)" },
    { term: "website developers adelaide", spend: "$91", conv: "1", cpl: "$91", budgetLimited: "Yes (32%)" },
    { term: "hire marketing expert", spend: "$84", conv: "1", cpl: "$84", budgetLimited: "Yes (29%)" },
    { term: "overseas software development", spend: "$80", conv: "1", cpl: "$80", budgetLimited: "Yes (29%)" },
    { term: "outsource payroll australia", spend: "$79", conv: "1", cpl: "$79", budgetLimited: "Yes (31%)" },
    { term: "3d animator hire", spend: "$69", conv: "1", cpl: "$69", budgetLimited: "Yes (30%)" },
    { term: "offshore mvp reviews", spend: "$69", conv: "1", cpl: "$69", budgetLimited: "Yes (29%)" },
    { term: "blog writer", spend: "$74", conv: "1", cpl: "$74", budgetLimited: "Yes (30%)" },
    { term: "offshore development", spend: "$42", conv: "1", cpl: "$42", budgetLimited: "Yes (23%)" },
    { term: "hire online graphic designer", spend: "$32", conv: "1", cpl: "$32", budgetLimited: "Yes (32%)" },
    { term: "indian web developer", spend: "$28", conv: "1", cpl: "$28", budgetLimited: "Yes (29%)" },
    { term: "graphic design brisbane", spend: "$25", conv: "1", cpl: "$25", budgetLimited: "Yes (32%)" },
    { term: "offshore digital marketing services", spend: "$25", conv: "1", cpl: "$25", budgetLimited: "No (1%)", budgetLimitedHighlight: false },
  ],
  negativePatternRows: [
    {
      label: "Unrelated brands",
      detail: " (Shopify, Gusto, eBay, Quickbooks)",
      examples: "shopify $405 / 26cl  ·  gusto payroll provider $384  ·  help shopify com $204  ·  shopify website builder $159",
      wasted: "$4,297",
      terms: "60",
    },
    {
      label: "Non-target geos",
      detail: " (US states, NZ, UK cities)",
      examples: "payroll companies in texas $916  ·  payroll companies in arizona $202  ·  payroll companies in florida $140  ·  seo company nz $125",
      wasted: "$2,689",
      terms: "27",
    },
    {
      label: '"near me"',
      detail: " (matches Australian US shoppers + irrelevant geos)",
      examples: "bookkeeper near me $197  ·  it experts near me $144  ·  graphic designer near me $122",
      wasted: "$2,324",
      terms: "38",
    },
    {
      label: "Jobs / careers / salary",
      detail: "",
      examples: "remote jobs $355 / 10cl  ·  online jobs $81  ·  remote jobs australia $75  ·  remote work $62",
      wasted: "$1,267",
      terms: "19",
    },
    {
      label: "Reviews",
      detail: " (research intent, low buyer signal)",
      examples: "supportninja reviews $136  ·  stealth agents reviews $123  ·  virtual receptionist australia reviews $122",
      wasted: "$984",
      terms: "14",
    },
    {
      label: "Informational / how-to",
      detail: "",
      examples: "how do i make an app for free $40  ·  how do you make a game $34",
      wasted: "$75",
      terms: "2",
    },
  ],
  landingPageRows: [
    { path: "/how-it-works/", href: "https://awaydigitalteams.com/how-it-works/", spend: "$23,826", clicks: "1,047", conv: "4", cpl: "$5,956", cplTone: "rose" },
    { path: "/our-services/outsource-app-development/", href: "https://awaydigitalteams.com/our-services/outsource-app-development/", spend: "$10,075", clicks: "240", conv: "1", cpl: "$10,075", cplTone: "rose" },
    { path: "/our-services/outsource-admin-assistants/", href: "https://awaydigitalteams.com/our-services/outsource-admin-assistants/", spend: "$11,671", clicks: "395", conv: "4", cpl: "$2,918", cplTone: "rose" },
    { path: "/our-services/hiring-full-stack-developers/", href: "https://awaydigitalteams.com/our-services/hiring-full-stack-developers/", spend: "$10,390", clicks: "544", conv: "6", cpl: "$1,732", cplTone: "amber" },
    { path: "/our-services/information-technology-functions/", href: "https://awaydigitalteams.com/our-services/information-technology-functions/", spend: "$36,488", clicks: "3,434", conv: "28", cpl: "$1,303", cplTone: "amber" },
    { path: "/contact/", href: "https://awaydigitalteams.com/contact/", spend: "$22,536", clicks: "769", conv: "40", cpl: "$563", cplTone: "emerald" },
    { path: "/ (homepage)", href: "https://awaydigitalteams.com/", spend: "~$36,700", clicks: "1,869", conv: "37", cpl: "$992", cplTone: "emerald" },
  ],
  scoringMethodologyCards: [
    { n: 1, name: "Website & business analysis", weight: 5, score: 5, scoreClass: "text-amber-500", desc: "Site readiness to convert paid traffic: landing page quality, CTA clarity, conversion paths, and category-specific pages." },
    { n: 2, name: "Account structure overview", weight: 8, score: 8, scoreClass: "text-lime-600", desc: "Campaign hierarchy, budget allocation logic, ad group organisation, and whether the structure supports effective bidding." },
    { n: 3, name: "Keyword & search intent", weight: 10, score: 3, scoreClass: "text-red-500", desc: "Match type distribution, search intent alignment, keyword relevance, and spend on irrelevant or non-converting terms." },
    { n: 4, name: "Tracking & measurement setup", weight: 12, score: 8, scoreClass: "text-lime-600", desc: "Conversion action setup, GA4 integration, enhanced conversions, attribution, and conversion signal quality for bidding." },
    { n: 5, name: "Campaign structure analysis", weight: 8, score: 8, scoreClass: "text-lime-600", desc: "Budget allocation vs performance, geo-targeting, device adjustments, ad scheduling, and bid strategy alignment." },
    { n: 6, name: "Channel performance", weight: 8, score: 7, scoreClass: "text-lime-600", desc: "ROAS & CPL across Search, Display, PMax, Shopping; cross-channel cannibalisation; budget flow to best performers." },
    { n: 7, name: "Search query analysis", weight: 10, score: 7, scoreClass: "text-lime-600", desc: "Actual queries triggering ads: relevance %, wasted query spend, intent alignment, and YoY search term quality." },
    { n: 8, name: "Negative keyword management", weight: 7, score: 10, scoreClass: "text-green-500", desc: "Negative keyword coverage, themed list organisation, regular addition history, and estimated preventable waste." },
    { n: 9, name: "Ad copy & assets review", weight: 8, score: 10, scoreClass: "text-green-500", desc: "RSA quality, pin strategy, ad strength scores, extension coverage, and landing page relevance per ad group." },
    { n: 10, name: "Brand vs generic split", weight: 10, score: 8, scoreClass: "text-lime-600", desc: "Three-way segmentation (brand / brand+ / generic), per-tier bidding, incrementality, and competitor brand bidding." },
    { n: 11, name: "Historical performance", weight: 7, score: 5, scoreClass: "text-amber-500", desc: "Monthly spend, conversions, CPL, ROAS trends since account start. Identifies trajectory, seasonality, inflection points." },
    { n: 12, name: "Audience strategy", weight: 5, score: 10, scoreClass: "text-green-500", desc: "Remarketing coverage, customer match & first-party data, in-market audience targeting, and bid adjustments." },
    { n: 13, name: "Competitive landscape", weight: 5, score: 3, scoreClass: "text-red-500", desc: "Auction insights per campaign (impression share, overlap rate, outranking share), competitor ad benchmarking, strategic positioning." },
  ],
  recommendations: [
    { n: "01", title: "Pick the right campaigns & reallocate budget", desc: "Spend is misallocated against performance. A clear re-weighting opportunity." },
    { n: "02", title: "Refine each remaining campaign and ad group", desc: "Structural cleanup across ad groups, copy, bidding and budgets." },
    { n: "03", title: "Route traffic to the right landing pages", desc: "Intent-to-page mismatch is dragging down conversion rate." },
    { n: "04", title: "Migrate broad match to phrase & exact match", desc: "Match-type strategy is leaking spend on irrelevant queries." },
    { n: "05", title: "Improve the negative-keyword list", desc: "Significant patterns of wasted spend identified and ready to block." },
    { n: "06", title: "Reallocate budget away from overly broad role keywords", desc: "High-spend keywords lack the intent signal needed to convert efficiently." },
    { n: "07", title: "Add lead-qualifying form on every landing page", desc: "Lead-capture flow is funnelling unqualified traffic into the pipeline." },
    { n: "08", title: "Improve Quality Score to bring down CPCs", desc: "QS gains will compound into lower CPC and CPL across the account." },
    { n: "09", title: "Audit every campaign\u2019s negative-keyword list - top to bottom", desc: "Misconfigured negatives discovered; broader cleanup needed." },
    { n: "10", title: "Exclude brand traffic from PMAX, Demand Gen & Video", desc: "PMAX, Demand Gen and Video are cannibalising organic brand traffic." },
    { n: "11", title: "Stop bidding on pure brand terms", desc: "Reclaimable spend on queries already won by organic rankings." },
  ],
  frameworkSteps: [
    { n: "01", title: "Discovery", desc: "Understand the business commercially: goals, margins, constraints. Growth decisions grounded in commercial reality." },
    { n: "02", title: "Foundations", desc: "Audit and strengthen digital foundations before scaling: account audit, tracking, conversion readiness, channel health." },
    { n: "03", title: "Prioritisation", desc: "Identify the highest-impact opportunities and sequence by effort, risk, and expected return." },
    { n: "04", title: "Rollout", desc: "Structured phases, not a big-bang launch. Measure, test, and refine continuously against real outcomes." },
    { n: "05", title: "Scale & learn", desc: "Scale what is working and identify the next stage of growth based on performance data and commercial impact." },
  ],
};
