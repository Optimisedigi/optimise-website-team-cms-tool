/**
 * Route: /partners/custom-fluid-power/google-ads-audit
 *
 * Custom Fluid Power Google Ads audit using the exact Away Digital deck structure.
 * Each <section> is a reverse-scroll slide; account evidence and framing come from
 * website-growth-tools/output/custom-fluid-power-google-ads-audit.json.
 */

import type { ReactNode } from 'react'
import './custom-fluid-power.css'
import AuditPasswordGate from '@/components/AuditPasswordGate'
import Starfield from './Starfield'
import DeckScrollEffects from './DeckScrollEffects'
import AccountGlanceChart, { type Row as AccountGlanceRow } from './AccountGlanceChart'

const ACCOUNT_GLANCE_ROWS: AccountGlanceRow[] = [
  { m: '2025-03', s: 1848.79, c: 581, v: 54 },
  { m: '2025-04', s: 1301.97, c: 342, v: 60 },
  { m: '2025-05', s: 1458.9, c: 319, v: 31 },
  { m: '2025-06', s: 1684.37, c: 494, v: 60 },
  { m: '2025-07', s: 1696.91, c: 518, v: 80.5 },
  { m: '2025-08', s: 1664.25, c: 525, v: 88 },
  { m: '2025-09', s: 1673.55, c: 543, v: 58 },
  { m: '2025-10', s: 625.9, c: 184, v: 22.5 },
  { m: '2025-12', s: 2468.48, c: 500, v: 58.5 },
  { m: '2026-01', s: 2769.3, c: 524, v: 64.5 },
  { m: '2026-02', s: 2626.83, c: 586, v: 84.5 },
  { m: '2026-03', s: 2779.8, c: 671, v: 66.5 },
  { m: '2026-04', s: 2790.54, c: 600, v: 53 },
  { m: '2026-05', s: 2703.37, c: 639, v: 69 },
  { m: '2026-06', s: 3212.77, c: 638, v: 67 },
  { m: '2026-07', s: 1757.06, c: 394, v: 50 },
]

type AuditScoreBar = {
  step: number
  label: string
  score: number
  scoreColor: string
  barColor: string
}

const AUDIT_SCORE_BARS: readonly AuditScoreBar[] = [
  {
    step: 4,
    label: 'Tracking & measurement setup',
    score: 3,
    scoreColor: 'text-red-500',
    barColor: 'bg-red-500',
  },
  {
    step: 1,
    label: 'Website & business analysis',
    score: 5,
    scoreColor: 'text-amber-500',
    barColor: 'bg-amber-500',
  },
  {
    step: 9,
    label: 'Ad copy & assets review',
    score: 5,
    scoreColor: 'text-amber-500',
    barColor: 'bg-amber-500',
  },
  {
    step: 10,
    label: 'Brand vs generic split',
    score: 5,
    scoreColor: 'text-amber-500',
    barColor: 'bg-amber-500',
  },
  {
    step: 12,
    label: 'Audience strategy',
    score: 5,
    scoreColor: 'text-amber-500',
    barColor: 'bg-amber-500',
  },
  {
    step: 13,
    label: 'Competitive landscape',
    score: 5,
    scoreColor: 'text-amber-500',
    barColor: 'bg-amber-500',
  },
  {
    step: 6,
    label: 'Channel performance',
    score: 6,
    scoreColor: 'text-lime-600',
    barColor: 'bg-lime-500',
  },
  {
    step: 8,
    label: 'Negative keyword management',
    score: 8,
    scoreColor: 'text-lime-600',
    barColor: 'bg-lime-500',
  },
  {
    step: 3,
    label: 'Keyword & search intent',
    score: 9,
    scoreColor: 'text-green-500',
    barColor: 'bg-green-500',
  },
  {
    step: 7,
    label: 'Search query analysis',
    score: 9,
    scoreColor: 'text-green-500',
    barColor: 'bg-green-500',
  },
  {
    step: 2,
    label: 'Account structure overview',
    score: 10,
    scoreColor: 'text-green-500',
    barColor: 'bg-green-500',
  },
  {
    step: 5,
    label: 'Campaign structure analysis',
    score: 10,
    scoreColor: 'text-green-500',
    barColor: 'bg-green-500',
  },
  {
    step: 11,
    label: 'Historical performance',
    score: 10,
    scoreColor: 'text-green-500',
    barColor: 'bg-green-500',
  },
]

type NbTrendMonth = {
  /** X position of the bar (rect x attribute) */
  x: number
  /** Centered X used for the rotated month label and total label */
  centerX: number
  /** Month label */
  label: string
  /** Y position of the total label above the stack */
  totalY: number
  /** Total dollars text shown above the stack */
  total: string
  /** Stacked segments in draw order: blue, violet, orange, teal */
  segments: readonly [
    { y: number; height: number },
    { y: number; height: number },
    { y: number; height: number },
    { y: number; height: number },
  ]
}

const NB_TREND_SEGMENT_COLORS = [
  'rgb(59,130,246)',
  'rgb(168,85,247)',
  'rgb(245,158,11)',
  'rgb(16,185,129)',
] as const

const NB_TREND_MONTHS: readonly NbTrendMonth[] = [
  {
    x: 48.0,
    centerX: 60.0,
    label: '2025-03',
    totalY: 102.4,
    total: '$1,849',
    segments: [
      { y: 106.4, height: 103.6 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 90.7,
    centerX: 102.7,
    label: '2025-04',
    totalY: 133.1,
    total: '$1,302',
    segments: [
      { y: 137.1, height: 72.9 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 133.3,
    centerX: 145.3,
    label: '2025-05',
    totalY: 124.3,
    total: '$1,459',
    segments: [
      { y: 128.3, height: 81.7 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 176.0,
    centerX: 188.0,
    label: '2025-06',
    totalY: 111.6,
    total: '$1,684',
    segments: [
      { y: 115.6, height: 94.4 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 218.7,
    centerX: 230.7,
    label: '2025-07',
    totalY: 110.9,
    total: '$1,697',
    segments: [
      { y: 114.9, height: 95.1 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 261.3,
    centerX: 273.3,
    label: '2025-08',
    totalY: 112.8,
    total: '$1,664',
    segments: [
      { y: 116.8, height: 93.2 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 304.0,
    centerX: 316.0,
    label: '2025-09',
    totalY: 112.2,
    total: '$1,674',
    segments: [
      { y: 116.2, height: 93.8 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 346.7,
    centerX: 358.7,
    label: '2025-10',
    totalY: 170.9,
    total: '$626',
    segments: [
      { y: 174.9, height: 35.1 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 389.3,
    centerX: 401.3,
    label: '2025-12',
    totalY: 67.7,
    total: '$2,468',
    segments: [
      { y: 71.7, height: 138.3 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 432.0,
    centerX: 444.0,
    label: '2026-01',
    totalY: 50.8,
    total: '$2,769',
    segments: [
      { y: 54.8, height: 155.2 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 474.7,
    centerX: 486.7,
    label: '2026-02',
    totalY: 58.8,
    total: '$2,627',
    segments: [
      { y: 62.8, height: 147.2 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 517.3,
    centerX: 529.3,
    label: '2026-03',
    totalY: 50.3,
    total: '$2,780',
    segments: [
      { y: 54.3, height: 155.7 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 560.0,
    centerX: 572.0,
    label: '2026-04',
    totalY: 49.7,
    total: '$2,791',
    segments: [
      { y: 53.7, height: 156.3 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 602.7,
    centerX: 614.7,
    label: '2026-05',
    totalY: 54.5,
    total: '$2,703',
    segments: [
      { y: 58.5, height: 151.5 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 645.3,
    centerX: 657.3,
    label: '2026-06',
    totalY: 26.0,
    total: '$3,213',
    segments: [
      { y: 30.0, height: 180.0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
  {
    x: 688.0,
    centerX: 700.0,
    label: '2026-07',
    totalY: 107.6,
    total: '$1,757',
    segments: [
      { y: 111.6, height: 98.4 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
      { y: 210, height: 0 },
    ],
  },
]

type NbTrendGridLine = { y: number; label: string }

const NB_TREND_GRID_LINES: readonly NbTrendGridLine[] = [
  { y: 20.0, label: '$3.2k' },
  { y: 67.5, label: '$2.4k' },
  { y: 115.0, label: '$1.6k' },
  { y: 162.5, label: '$0.8k' },
  { y: 210.0, label: '$0' },
]

type NbTrendLegendEntry = {
  /** Legend swatch X (text labels are offset by +17) */
  x: number
  color: string
  name: string
  cpl: string
}

const NB_TREND_LEGEND: readonly NbTrendLegendEntry[] = [
  { x: 0, color: 'rgb(59,130,246)', name: 'Account spend', cpl: '$56 primary-conversion CPA' },
]

type AdGroupRow = {
  name: string
  spend: string
  cpl: string
  is: string
  /** Visual treatment of the row */
  variant: 'default' | 'rose' | 'muted'
  /** Override colour for the CPL cell when row is `default` */
  cplColor?: 'emerald' | 'slate'
  /** Override colour for the IS cell when row is `default` */
  isColor?: 'amber' | 'slate' | 'muted'
}

type AdGroupCategory = {
  name: string
  spendTotal: string
  cpl: string
  rows: readonly AdGroupRow[]
  opportunity: ReactNode
}

const AD_GROUP_CATEGORIES: readonly AdGroupCategory[] = [
  {
    name: 'Custom Safe Brakes',
    spendTotal: '$25,028',
    cpl: '$36 CPA',
    rows: [
      {
        name: 'RB-Custom Fluidpower-Custom Safe Brakes',
        spend: '$25,028',
        cpl: '$36',
        is: '28% lost',
        variant: 'default',
        cplColor: 'emerald',
        isColor: 'amber',
      },
    ],
    opportunity: (
      <>
        <span className="font-semibold">Opportunity:</span> Highest conversion volume at the lowest
        major-campaign CPA. Test incremental budget only after qualified-lead validation.
      </>
    ),
  },
  {
    name: 'HYDAC',
    spendTotal: '$16,734',
    cpl: '$67 CPA',
    rows: [
      {
        name: 'RB-Custom Fluidpower-HYDAC',
        spend: '$16,734',
        cpl: '$67',
        is: '43% lost',
        variant: 'default',
        cplColor: 'slate',
        isColor: 'amber',
      },
    ],
    opportunity: (
      <>
        <span className="font-semibold">Investigation:</span> Historical performance is visible, but
        the operational reason for the pause must be confirmed before relaunching.
      </>
    ),
  },
  {
    name: 'Audience / mining coverage',
    spendTotal: '$16,156',
    cpl: '$341 CPA',
    rows: [
      {
        name: 'CSB, Mining/Industrial, NSW Mine Coverage',
        spend: '$16,156',
        cpl: '$341',
        is: '26% lost',
        variant: 'rose',
      },
    ],
    opportunity: (
      <>
        <span className="font-semibold">Opportunity:</span> Do not increase budget on blended
        conversions alone. Validate lead quality and the role of micro-conversions first.
      </>
    ),
  },
  {
    name: 'Generic hydraulic engineering',
    spendTotal: '$28,847',
    cpl: '$31 CPA',
    rows: [
      {
        name: 'Newcastle',
        spend: '$10,162',
        cpl: '$27',
        is: '44% lost',
        variant: 'default',
        cplColor: 'emerald',
        isColor: 'amber',
      },
      {
        name: 'Brisbane',
        spend: '$9,491',
        cpl: '$32',
        is: '45% lost',
        variant: 'default',
        cplColor: 'emerald',
        isColor: 'amber',
      },
      {
        name: 'Perth',
        spend: '$9,195',
        cpl: '$34',
        is: '43% lost',
        variant: 'default',
        cplColor: 'emerald',
        isColor: 'amber',
      },
    ],
    opportunity: (
      <>
        <span className="font-semibold">Opportunity:</span> These generic campaigns show efficient
        blended CPA and material budget loss. Run controlled increases after confirming qualified
        enquiries.
      </>
    ),
  },
]

type SearchTermRow = {
  term: string
  spend: string
  conv: string
  cpl: string
  classification: string
  /** When `false`, render the budget-limited cell in muted slate rather than amber. */
  classificationHighlight?: boolean
}

const SEARCH_TERM_TOP_ROWS: readonly SearchTermRow[] = [
  {
    term: 'custom fluid power',
    spend: '$2,890',
    conv: '189.33',
    cpl: '$15',
    classification: 'Brand',
    classificationHighlight: false,
  },
  {
    term: 'hydac',
    spend: '$2,692',
    conv: '35',
    cpl: '$77',
    classification: 'Review',
    classificationHighlight: false,
  },
  {
    term: 'custom fluid power mackay',
    spend: '$1,987',
    conv: '141.83',
    cpl: '$14',
    classification: 'Brand',
    classificationHighlight: false,
  },
  {
    term: 'hydac australia',
    spend: '$1,951',
    conv: '26.67',
    cpl: '$73',
    classification: 'Review',
    classificationHighlight: false,
  },
  {
    term: 'hydac melbourne',
    spend: '$647',
    conv: '12.5',
    cpl: '$52',
    classification: 'Review',
    classificationHighlight: false,
  },
  {
    term: 'custom fluid power perth',
    spend: '$645',
    conv: '51',
    cpl: '$13',
    classification: 'Brand',
    classificationHighlight: false,
  },
  {
    term: 'brake caliper',
    spend: '$541',
    conv: '1',
    cpl: '$541',
    classification: 'Intent review',
    classificationHighlight: false,
  },
  {
    term: 'custom fluid power brisbane',
    spend: '$537',
    conv: '31',
    cpl: '$17',
    classification: 'Brand',
    classificationHighlight: false,
  },
  {
    term: 'hydac perth',
    spend: '$529',
    conv: '7',
    cpl: '$76',
    classification: 'Review',
    classificationHighlight: false,
  },
  {
    term: 'hydac filters',
    spend: '$509',
    conv: '7.5',
    cpl: '$68',
    classification: 'Review',
    classificationHighlight: false,
  },
  {
    term: 'hydac brisbane',
    spend: '$497',
    conv: '15.5',
    cpl: '$32',
    classification: 'Review',
    classificationHighlight: false,
  },
  {
    term: 'sun hydraulics australia',
    spend: '$441',
    conv: '16',
    cpl: '$28',
    classification: 'Negative conflict',
    classificationHighlight: false,
  },
]

type NegativePatternRow = {
  label: string
  detail: string
  examples: string
  wasted: string
  terms: string
}

const NEGATIVE_PATTERN_ROWS: readonly NegativePatternRow[] = [
  {
    label: 'Heuristic likely-irrelevant terms',
    detail: ' (top-100 review queue)',
    examples:
      'Brembo, Wilwood, PBR, Girlock, trailer brakes, bike brakes, brake pads and brake parts near me',
    wasted: '$831',
    terms: '12',
  },
  {
    label: 'Shared negative coverage',
    detail: ' (coverage opportunity, not a target for its own sake)',
    examples:
      '237 shared negatives versus the supplied 340 comparator; also review campaign and ad-group coverage',
    wasted: '$0',
    terms: '237',
  },
  {
    label: 'Known conflict',
    detail: ' (manual review required)',
    examples:
      'sun hydraulics australia historically converted but appears as an exact shared negative on Manifolds',
    wasted: '$0',
    terms: '1',
  },
]

type LandingPageRow = {
  path: string
  href: string
  spend: string
  clicks: string
  conv: string
  cpl: string
  /** Colour treatment for the CPL cell */
  cplTone: 'rose' | 'amber' | 'emerald'
}

const LANDING_PAGE_ROWS: readonly LandingPageRow[] = []

type ScoringMethodologyCard = {
  /** Step number (1-13) */
  n: number
  /** Category name */
  name: string
  /** Weight (importance) */
  weight: number
  /** Score (0-10) */
  score: number
  /** Tailwind class for the score colour */
  scoreClass: string
  /** Short description of what this step covers */
  desc: string
}

const SCORING_METHODOLOGY_CARDS: readonly ScoringMethodologyCard[] = [
  {
    n: 1,
    name: 'Website & business analysis',
    weight: 5,
    score: 5,
    scoreClass: 'text-amber-500',
    desc: 'Site readiness to convert paid traffic: landing page quality, CTA clarity, conversion paths, and category-specific pages.',
  },
  {
    n: 2,
    name: 'Account structure overview',
    weight: 8,
    score: 10,
    scoreClass: 'text-green-500',
    desc: 'Campaign hierarchy, budget allocation logic, ad group organisation, and whether the structure supports effective bidding.',
  },
  {
    n: 3,
    name: 'Keyword & search intent',
    weight: 10,
    score: 9,
    scoreClass: 'text-green-500',
    desc: 'Match type distribution, search intent alignment, keyword relevance, and spend on irrelevant or non-converting terms.',
  },
  {
    n: 4,
    name: 'Tracking & measurement setup',
    weight: 12,
    score: 3,
    scoreClass: 'text-red-500',
    desc: 'Conversion action setup, GA4 integration, enhanced conversions, attribution, and conversion signal quality for bidding.',
  },
  {
    n: 5,
    name: 'Campaign structure analysis',
    weight: 8,
    score: 10,
    scoreClass: 'text-green-500',
    desc: 'Budget allocation vs performance, geo-targeting, device adjustments, ad scheduling, and bid strategy alignment.',
  },
  {
    n: 6,
    name: 'Channel performance',
    weight: 8,
    score: 6,
    scoreClass: 'text-lime-600',
    desc: 'ROAS & CPL across Search, Display, PMax, Shopping; cross-channel cannibalisation; budget flow to best performers.',
  },
  {
    n: 7,
    name: 'Search query analysis',
    weight: 10,
    score: 9,
    scoreClass: 'text-green-500',
    desc: 'Actual queries triggering ads: relevance %, wasted query spend, intent alignment, and YoY search term quality.',
  },
  {
    n: 8,
    name: 'Negative keyword management',
    weight: 7,
    score: 8,
    scoreClass: 'text-lime-600',
    desc: 'Negative keyword coverage, themed list organisation, regular addition history, and estimated preventable waste.',
  },
  {
    n: 9,
    name: 'Ad copy & assets review',
    weight: 8,
    score: 5,
    scoreClass: 'text-amber-500',
    desc: 'RSA quality, pin strategy, ad strength scores, extension coverage, and landing page relevance per ad group.',
  },
  {
    n: 10,
    name: 'Brand vs generic split',
    weight: 10,
    score: 5,
    scoreClass: 'text-amber-500',
    desc: 'Three-way segmentation (brand / brand+ / generic), per-tier bidding, incrementality, and competitor brand bidding.',
  },
  {
    n: 11,
    name: 'Historical performance',
    weight: 7,
    score: 10,
    scoreClass: 'text-green-500',
    desc: 'Monthly spend, conversions, CPL, ROAS trends since account start. Identifies trajectory, seasonality, inflection points.',
  },
  {
    n: 12,
    name: 'Audience strategy',
    weight: 5,
    score: 5,
    scoreClass: 'text-amber-500',
    desc: 'Remarketing coverage, customer match & first-party data, in-market audience targeting, and bid adjustments.',
  },
  {
    n: 13,
    name: 'Competitive landscape',
    weight: 5,
    score: 5,
    scoreClass: 'text-amber-500',
    desc: 'Auction insights per campaign (impression share, overlap rate, outranking share), competitor ad benchmarking, strategic positioning.',
  },
]

function landingPageCplClass(tone: LandingPageRow['cplTone']): string {
  if (tone === 'rose') return 'text-right py-2 pl-2 tabular-nums font-bold text-rose-700'
  if (tone === 'amber') return 'text-right py-2 pl-2 tabular-nums font-semibold text-amber-700'
  return 'text-right py-2 pl-2 tabular-nums font-semibold text-emerald-700'
}

function adGroupNameClass(variant: AdGroupRow['variant']): string {
  if (variant === 'rose') return 'py-1 px-2 font-semibold text-rose-700'
  if (variant === 'muted') return 'py-1 px-2 text-slate-500'
  return 'py-1 px-2 text-slate-700'
}

function adGroupSpendClass(variant: AdGroupRow['variant']): string {
  if (variant === 'rose') return 'text-right py-1 px-2 tabular-nums font-semibold text-rose-700'
  if (variant === 'muted') return 'text-right py-1 px-2 tabular-nums text-slate-500'
  return 'text-right py-1 px-2 tabular-nums text-slate-700'
}

function adGroupCplClass(row: AdGroupRow): string {
  if (row.variant === 'rose') return 'text-right py-1 px-2 tabular-nums font-semibold text-rose-700'
  if (row.variant === 'muted') return 'text-right py-1 px-2 tabular-nums text-slate-500'
  if (row.cplColor === 'emerald')
    return 'text-right py-1 px-2 tabular-nums font-semibold text-emerald-700'
  return 'text-right py-1 px-2 tabular-nums text-slate-700'
}

function adGroupIsClass(row: AdGroupRow): string {
  if (row.variant === 'rose') return 'text-right py-1 pl-2 pr-3 tabular-nums text-slate-500'
  if (row.variant === 'muted') return 'text-right py-1 pl-2 pr-3 tabular-nums text-slate-500'
  if (row.isColor === 'amber')
    return 'text-right py-1 pl-2 pr-3 tabular-nums font-semibold text-amber-700'
  if (row.isColor === 'muted') return 'text-right py-1 pl-2 pr-3 tabular-nums text-slate-500'
  return 'text-right py-1 pl-2 pr-3 tabular-nums text-slate-700'
}

export default function AwayDigitalAuditPage() {
  return (
    <AuditPasswordGate
      auditSlug="custom-fluid-power/google-ads-audit"
      businessName="Custom Fluid Power"
      featureLabel="Google Ads Audit"
    >
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200 z-50">
        <div
          id="progress-bar"
          className="h-full bg-blue-600 transition-all"
          style={{ width: '0%' }}
        />
      </div>

      <main className="flex flex-col-reverse">
        <section
          id="cover"
          data-label="Cover"
          className="cover-v2 relative min-h-screen flex flex-col"
        >
          <Starfield id="cover-starfield" />
          <div
            className="orbit-deco"
            style={{ width: '1100px', height: '1100px', right: '-380px', top: '-300px' }}
          />
          <div
            className="orbit-deco"
            style={{
              width: '720px',
              height: '720px',
              right: '-160px',
              top: '-80px',
              borderColor: 'rgba(77,148,255,0.1)',
            }}
          />
          <div className="relative z-10 px-8 md:px-12 pt-10 w-full">
            <div className="flex items-center gap-3">
              <span className="cover-dot" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/optimise-digital-logo-white.webp"
                alt="Optimise Digital"
                className="w-auto h-[22.8px] md:h-[30.4px]"
              />
            </div>
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-12 w-full -mt-[20px]">
            <div className="flex flex-col items-start gap-5 text-left max-w-3xl">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="cover-pill">Google Ads Account Audit</span>
                <span className="cover-meta">February 2021 &ndash; July 2026</span>
              </div>
              <h1 className="cover-h1 text-4xl md:text-6xl">Custom Fluid Power</h1>
              <p
                className="text-base md:text-lg text-white/70 max-w-2xl leading-snug"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                A positive optimisation review of account health, measurement quality, search intent
                and evidence-backed growth opportunities.
              </p>
            </div>
          </div>
          <a
            href="#tldr"
            className="absolute z-10 bottom-6 left-8 md:left-12 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 transition-colors cursor-pointer"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span
              className="text-[11px] font-medium tracking-widest uppercase"
              style={{ color: 'var(--purple-soft)' }}
            >
              TL;DR
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--purple-soft)' }}
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        </section>

        <section id="tldr" className="relative min-h-screen flex flex-col bg-white">
          <div className="flex-1 flex flex-col justify-center px-6 pt-10 pb-8 max-w-5xl mx-auto w-full">
            <div className="mb-4 max-w-5xl mx-auto w-full">
              <p className="text-blue-500 font-semibold text-sm uppercase tracking-widest mb-1">
                TL;DR
              </p>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900">
                The audit, in one slide
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  Account health
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Custom Fluid Power is healthier than the MTP and Berendsen accounts based on the
                  supplied comparative context. This is not a newly measured benchmark score.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  Brand vs generic
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Brand uses 14.63% of search-term spend but produces 45.57% of primary conversions,
                  so branded demand inflates apparent CPA efficiency.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  Measurement
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  The account records 2,292 primary conversions, but downloads, click-to-call and
                  other micro-actions mean the $55.55 CPA is not a qualified-lead CPA.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  Duplicate tracking
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Enquiry and phone/call actions may overlap. Historical configuration and
                  deduplication need validation before conversion goals change.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  Search terms
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  80,429 returned rows expose $831 in heuristic likely-irrelevant top-100 spend.
                  Treat this as a review queue, not automatic exclusions.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  Negative coverage
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  237 shared negatives versus the supplied 340 comparator indicates an opportunity,
                  while total campaign, ad-group and shared coverage must stay distinct.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  HYDAC
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Historical performance is visible, but the operational reason for pausing HYDAC
                  must be confirmed before any relaunch.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                  Recommendations
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Prioritise lead-quality validation, controlled budget tests, generic growth,
                  negative coverage and high-intent SEO landing pages.
                </p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 md:col-span-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-0.5">
                  The opportunity
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  The account is healthy enough to optimise from evidence. Protect brand coverage,
                  separate generic incrementality, and scale only campaigns with verified budget
                  loss and qualified leads.
                </p>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            2 / 15
          </div>
        </section>
        <section
          id="account-glance"
          data-label="Account at a glance"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-5 pb-2 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-3 max-w-4xl mx-auto text-slate-900">
              Let&rsquo;s get context around the rising cost per lead
            </h2>
            <AccountGlanceChart
              rows={ACCOUNT_GLANCE_ROWS}
              clientName="Custom Fluid Power"
              periodLabel="Latest 16 reported months"
              geoAvailable={false}
            />
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            3 / 15
          </div>
        </section>
        <section
          id="audit-score"
          data-label="Audit score"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 text-slate-900">
              Google Ads account audit score
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              Assessed across 13 areas. Well-managed accounts typically score 65&ndash;80.
            </p>
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 max-w-4xl mx-auto w-full">
              {/* Score ring */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="relative inline-flex items-center justify-center">
                  <svg width="140" height="140" className="-rotate-90">
                    <circle
                      cx="70"
                      cy="70"
                      r="54"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-slate-200"
                    />
                    <circle
                      cx="70"
                      cy="70"
                      r="54"
                      fill="none"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray="339.292"
                      strokeDashoffset="105.181"
                      className="stroke-lime-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-slate-900">69</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-lime-600">Room for improvement</span>
              </div>
              {/* Step bars, sorted worst -> best */}
              <div className="flex-1 w-full space-y-2">
                {AUDIT_SCORE_BARS.map((bar) => (
                  <div key={bar.step} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-5 text-right shrink-0">
                      {bar.step}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium text-slate-700 truncate">
                          {bar.label}
                        </span>
                        <span className={`text-xs font-semibold ml-2 shrink-0 ${bar.scoreColor}`}>
                          {bar.score}/10
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${bar.barColor}`}
                          style={{ width: `${bar.score * 10}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 max-w-4xl mx-auto w-full md:pl-[184px]">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-slate-700">
                  <span className="font-bold text-amber-700">Caveat:</span> the 13-step engine
                  grades structural items e.g. do negative keyword lists exist, etc. Some categories
                  look stronger than they really are. Negative-keyword management scores 8/10
                  because lists exist, while the current top-100 review queue still identifies $831
                  across 12 heuristic likely-irrelevant terms.
                </p>
              </div>
            </div>
            <div className="mt-3 text-center">
              <a
                href="#appendix"
                className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                How is each category scored?
              </a>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            4 / 15
          </div>
        </section>
        <section
          id="category-breakdown"
          data-label="Category breakdown"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-4 pt-5 pb-3 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-3 max-w-4xl mx-auto text-slate-900">
              Separate brand efficiency from generic growth
            </h2>
            <p className="text-center text-xs pb-4 max-w-3xl mx-auto text-slate-500">
              Brand demand makes blended CPA look stronger than incremental acquisition performance.
            </p>
            <div className="max-w-4xl mx-auto w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-purple-700 mb-2">
                    Owned-brand search terms
                  </div>
                  <div className="text-3xl font-bold text-purple-700 mb-1">14.63% spend</div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    45.57% of primary conversions
                  </div>
                  <p className="text-sm text-slate-700">
                    Custom Fluid Power, Custom Fluidpower, Custom Safe Brakes and Custom Storm
                    Brakes are classified as owned brand. Their conversion share is
                    disproportionately high.
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">
                    Generic / non-owned demand
                  </div>
                  <div className="text-3xl font-bold text-emerald-700 mb-1">85.37% spend</div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    54.43% of primary conversions
                  </div>
                  <p className="text-sm text-slate-700">
                    HYDAC, Parker and Sun Hydraulics remain generic/non-owned. Generic campaign
                    performance is the better incrementality signal, subject to qualified-lead
                    validation.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-slate-800">
                  <span className="font-bold text-blue-800">Recommendation:</span> keep defensive
                  brand coverage, report brand separately, and test additional generic budget only
                  where search budget loss, CPA and lead quality all support it.
                </p>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            5 / 15
          </div>
        </section>
        <section
          id="nb-trend"
          data-label="Non-brand trend"
          className="relative min-h-screen flex flex-col bg-slate-50"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-20 pb-12 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 mx-auto text-slate-900 md:whitespace-nowrap">
              Monthly account spend has stayed controlled while conversion volume remains active
            </h2>
            <p className="text-center text-sm text-slate-500 mb-4 max-w-3xl mx-auto">
              <span className="font-semibold text-slate-900">Latest 16 reported months:</span> spend
              peaked at $3,213 in June 2026. Use qualified enquiries, not blended micro-conversions,
              to decide where additional budget belongs.
            </p>
            <div className="max-w-4xl mx-auto w-full">
              <div className="bg-white rounded-lg p-4 border border-slate-200 mb-4">
                <svg
                  id="chart-svg-nb"
                  viewBox="0 0 760 280"
                  className="w-full h-auto"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g>
                    {NB_TREND_GRID_LINES.map((line) => (
                      <g key={line.label}>
                        <line
                          x1="60"
                          x2="700"
                          y1={line.y}
                          y2={line.y}
                          stroke="rgb(226,232,240)"
                          strokeDasharray="2,3"
                          strokeWidth="1"
                        />
                        <text
                          x="56"
                          y={line.y + 4}
                          textAnchor="end"
                          fontSize="10"
                          fill="rgb(100,116,139)"
                        >
                          {line.label}
                        </text>
                      </g>
                    ))}
                  </g>
                  <g>
                    {NB_TREND_MONTHS.map((month) =>
                      month.segments.map((seg, segIdx) => (
                        <rect
                          key={`${month.x}-${segIdx}`}
                          x={month.x}
                          y={seg.y}
                          width="24"
                          height={seg.height}
                          fill={NB_TREND_SEGMENT_COLORS[segIdx]}
                          opacity="0.85"
                          rx="1"
                        />
                      )),
                    )}
                  </g>
                  <g>
                    {NB_TREND_MONTHS.map((month, idx) => (
                      <text
                        key={`month-${idx}`}
                        x={month.centerX}
                        y="228"
                        textAnchor="middle"
                        fontSize="9"
                        fill="rgb(100,116,139)"
                        transform={`rotate(-45 ${month.centerX} 228)`}
                      >
                        {month.label}
                      </text>
                    ))}
                  </g>
                  <g>
                    {NB_TREND_MONTHS.map((month, idx) => (
                      <text
                        key={`total-${idx}`}
                        x={month.centerX}
                        y={month.totalY}
                        textAnchor="middle"
                        fontSize="8"
                        fill="rgb(100,116,139)"
                      >
                        {month.total}
                      </text>
                    ))}
                  </g>
                  <g transform="translate(80, 248)">
                    {NB_TREND_LEGEND.map((entry) => (
                      <g key={entry.name}>
                        <rect x={entry.x} y="0" width="12" height="12" fill={entry.color} rx="2" />
                        <text
                          x={entry.x + 17}
                          y="10"
                          fontSize="10"
                          fontWeight="600"
                          fill="rgb(51,65,85)"
                        >
                          {entry.name}
                        </text>
                        <text
                          x={entry.x + 17}
                          y="24"
                          fontSize="10"
                          fontWeight="700"
                          fill={entry.color}
                        >
                          {entry.cpl}
                        </text>
                      </g>
                    ))}
                  </g>
                </svg>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                    Generic hydraulic engineering
                  </div>
                  <div className="text-sm font-bold text-blue-600 mb-1">$27–$34 blended CPA</div>
                  <p className="text-sm text-slate-800">
                    Newcastle, Brisbane and Perth show efficient blended CPA with 43–45% search
                    budget loss. Validate qualified lead quality, then test incremental budget.
                  </p>
                </div>
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-violet-700">
                    Custom Safe Brakes
                  </div>
                  <div className="text-sm font-bold text-violet-700 mb-1">$36 blended CPA</div>
                  <p className="text-sm text-slate-800">
                    The largest conversion contributor, but its conversion mix still includes
                    account-wide primary micro-actions. Scale only after lead-quality validation.
                  </p>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-orange-700">
                    Audience / mining coverage
                  </div>
                  <div className="text-sm font-bold text-orange-700 mb-1">$341 blended CPA</div>
                  <p className="text-sm text-slate-800">
                    This is the weakest major campaign by blended CPA. Lead quality and targeting
                    should be reviewed before any budget increase.
                  </p>
                </div>
                <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                    HYDAC
                  </div>
                  <div className="text-sm font-bold text-teal-700 mb-1">
                    $67 blended CPA · paused
                  </div>
                  <p className="text-sm text-slate-800">
                    The account can show historical performance, but not the operational reason for
                    pausing. Confirm the business context before relaunching.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            6 / 15
          </div>
        </section>
        <section
          id="ad-group-breakdown"
          data-label="Ad group breakdown"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-12 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-1 max-w-4xl mx-auto text-slate-900">
              Campaign-level performance and budget-loss evidence
            </h2>
            <p className="text-center text-xs text-slate-500 mb-4">
              Spend, blended primary-conversion CPA and search budget loss by campaign theme.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AD_GROUP_CATEGORIES.map((category) => (
                <div
                  key={category.name}
                  className="rounded-lg border border-blue-200 bg-white overflow-hidden flex flex-col"
                >
                  <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-200 flex items-baseline justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                      {category.name}
                    </div>
                    <div className="text-xs text-slate-600">
                      {category.spendTotal} &middot;{' '}
                      <span className="font-bold text-blue-700">{category.cpl}</span>
                    </div>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left py-1 px-2 font-semibold">Ad group</th>
                        <th className="text-right py-1 px-2 font-semibold">Spend</th>
                        <th className="text-right py-1 px-2 font-semibold">CPL</th>
                        <th className="text-right py-1 pl-2 pr-3 font-semibold">IS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {category.rows.map((row) => (
                        <tr key={row.name}>
                          <td className={adGroupNameClass(row.variant)}>{row.name}</td>
                          <td className={adGroupSpendClass(row.variant)}>{row.spend}</td>
                          <td className={adGroupCplClass(row)}>{row.cpl}</td>
                          <td className={adGroupIsClass(row)}>{row.is}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-auto px-3 py-1.5 bg-blue-50/40 text-[10px] text-blue-800 border-t border-blue-200">
                    {category.opportunity}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-700">
                <span className="font-bold text-slate-900">Decision rule:</span> budget loss shows
                available impression share, not guaranteed incremental leads. Validate qualified
                enquiries and search intent before scaling.
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            7 / 15
          </div>
        </section>
        <section
          id="search-terms"
          data-label="Search terms"
          className="relative min-h-screen flex flex-col bg-slate-50"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-1 max-w-4xl mx-auto text-slate-900">
              Search-term evidence separates demand capture from waste
            </h2>
            <p className="text-center text-xs text-slate-500 mb-4">
              80,429 returned rows &middot; 46,702 distinct terms &middot; brand and generic shown
              separately
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Top 20 by conversion */}
              <div className="rounded-lg border border-emerald-200 bg-white overflow-hidden flex flex-col">
                <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-200 flex items-baseline justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Top search terms by spend
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Primary conversions &middot; micro-conversion caveat applies
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left py-1 px-2 font-semibold">Search term</th>
                      <th className="text-right py-1 px-2 font-semibold">Spend</th>
                      <th className="text-right py-1 px-2 font-semibold">Conv</th>
                      <th className="text-right py-1 px-2 font-semibold">CPL</th>
                      <th className="text-right py-1 pl-2 pr-3 font-semibold">Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {SEARCH_TERM_TOP_ROWS.map((row) => (
                      <tr key={row.term}>
                        <td className="py-1 px-2 text-[11px] text-slate-700 font-mono">
                          {row.term}
                        </td>
                        <td className="text-right py-1 px-2 text-[11px] tabular-nums text-slate-600">
                          {row.spend}
                        </td>
                        <td className="text-right py-1 px-2 text-[11px] tabular-nums text-slate-700 font-semibold">
                          {row.conv}
                        </td>
                        <td className="text-right py-1 px-2 text-[11px] tabular-nums font-semibold text-emerald-700">
                          {row.cpl}
                        </td>
                        <td className="text-right py-1 pl-2 pr-3 text-[11px]">
                          <span
                            className={
                              row.classificationHighlight === false
                                ? 'text-slate-500'
                                : 'text-amber-700 font-semibold'
                            }
                          >
                            {row.classification}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-auto px-3 py-1.5 bg-emerald-50/40 text-[10px] text-emerald-800 border-t border-emerald-200">
                  <span className="font-semibold">Classification</span> separates brand demand,
                  HYDAC review items, intent questions and known negative-keyword conflicts.
                </div>
              </div>
              {/* Negative-keyword candidates */}
              <div className="rounded-lg border border-rose-200 bg-white overflow-hidden flex flex-col">
                <div className="px-3 py-1.5 bg-rose-50 border-b border-rose-200 flex items-baseline justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                    Negative coverage &amp; intent review
                  </div>
                  <div className="text-[10px] text-slate-500">
                    $831 across 12 heuristic review terms
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left py-1 px-2 font-semibold">
                        Pattern {'\u2014'} example queries
                      </th>
                      <th className="text-right py-1 px-2 font-semibold">Review spend</th>
                      <th className="text-right py-1 pl-2 pr-3 font-semibold">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {NEGATIVE_PATTERN_ROWS.map((row) => (
                      <tr key={row.label}>
                        <td className="py-1 px-2 text-[11px]">
                          <span className="font-semibold text-slate-700">{row.label}</span>
                          {row.detail}
                          <br />
                          <span className="text-[10px] text-slate-500 font-mono">
                            {row.examples}
                          </span>
                        </td>
                        <td className="text-right py-1 px-2 text-[11px] tabular-nums font-semibold text-rose-700">
                          {row.wasted}
                        </td>
                        <td className="text-right py-1 pl-2 pr-3 text-[11px] tabular-nums text-slate-600">
                          {row.terms}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-auto px-3 py-1.5 bg-rose-50/40 text-[10px] text-rose-800 border-t border-rose-200">
                  <span className="font-semibold">
                    Treat this as a review queue, not automatic exclusions.
                  </span>{' '}
                  Validate intent and historical conversion quality before adding negatives; review
                  campaign, ad-group and shared-list coverage separately.
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500 italic text-center">
              Budget limitation is assessed at campaign level elsewhere in the audit; search-term
              classifications above are review signals only.
            </p>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            8 / 15
          </div>
        </section>
        <section
          id="landing-pages"
          data-label="Landing pages"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-20 pb-12 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-3 mx-auto text-slate-900">
              Landing-page performance is not available in this audit export
            </h2>
            <p className="text-center text-sm md:text-base pb-6 max-w-3xl mx-auto text-slate-500">
              No destination-page metrics were supplied, so this first deck does not invent
              landing-page CPA evidence.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl mx-auto w-full">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-2">
                  Paid search opportunity
                </div>
                <p className="text-sm text-slate-800">
                  Align generic hydraulic engineering campaigns with high-intent pages and clear
                  enquiry paths. Validate page-level conversion quality before budget increases.
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">
                  SEO opportunity
                </div>
                <p className="text-sm text-slate-800">
                  Strengthen pages for hydraulic repair, manifolds, valves, pumps, cylinders and
                  industrial braking using the language proven in search-term demand.
                </p>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 max-w-4xl mx-auto w-full">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Next measurement step:</span> add destination-page
                performance to the next export so spend, clicks, qualified enquiries and CPA can be
                assessed without assumptions.
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            9 / 15
          </div>
        </section>
        <section
          id="ai-erosion"
          data-label="Measurement"
          className="relative min-h-screen flex flex-col bg-slate-50"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 max-w-4xl mx-auto text-slate-900">
              The account is healthy, but measurement quality limits the headline CPA
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              Primary conversions mix qualified enquiries with downloads, click-to-call and other
              micro-actions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg border border-blue-200 bg-white p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-2">
                  Reported performance
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center">
                    <div className="text-[9px] uppercase text-slate-400">Spend</div>
                    <div className="text-lg font-bold text-slate-900">$127,314</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase text-slate-400">Primary conv.</div>
                    <div className="text-lg font-bold text-slate-900">2,292</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] uppercase text-slate-400">Blended CPA</div>
                    <div className="text-lg font-bold text-blue-700">$55.55</div>
                  </div>
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  <span className="font-semibold text-slate-900">Important:</span> this is not a
                  qualified-lead CPA because primary goals include micro-conversions.
                </p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 mb-2">
                  Duplicate-tracking review
                </div>
                <p className="text-[12px] text-slate-700 leading-snug mb-2">
                  Possible overlap exists across Custom Fluid / GA4 enquiry / enquiry submission
                  actions and across phone / call actions.
                </p>
                <p className="text-[12px] text-slate-700 leading-snug">
                  The aggregate API pull cannot prove historical configuration or deduplication.
                  Validate source events in Google Ads, GA4 and GTM.
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-slate-800">
                <strong className="text-blue-700">Bidding implication:</strong> keep the positive
                account framing, but optimise toward confirmed enquiries and calls before treating
                low blended CPA as acquisition efficiency.
              </p>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            10 / 15
          </div>
        </section>
        <section
          id="recommendations"
          data-label="Recommendations"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-10 pb-8 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-1 max-w-4xl mx-auto text-slate-900">
              Recommendations to strengthen performance
            </h2>
            <p className="text-center text-xs text-slate-500 mb-4">
              Eight evidence-led priorities for the first optimisation phase.
            </p>
            <div className="max-w-6xl mx-auto w-full">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 max-w-6xl mx-auto">
                {(
                  [
                    {
                      n: '01',
                      title: 'Validate conversion quality and deduplication',
                      desc: 'Confirm which enquiry, phone and micro-conversion actions represent qualified leads before changing bidding goals.',
                    },
                    {
                      n: '02',
                      title: 'Report brand and generic separately',
                      desc: 'Brand takes 14.63% of spend but contributes 45.57% of primary conversions, inflating blended CPA efficiency.',
                    },
                    {
                      n: '03',
                      title: 'Test budget on verified generic winners',
                      desc: 'Newcastle, Brisbane and Perth combine efficient blended CPA with 43–45% search budget loss.',
                    },
                    {
                      n: '04',
                      title: 'Investigate HYDAC before relaunching',
                      desc: 'Confirm whether the pause reflects lead quality, product fit, stock, search leakage or another business decision.',
                    },
                    {
                      n: '05',
                      title: 'Close validated negative-keyword gaps',
                      desc: 'Use the 80,429-row search-term set as a review queue and resolve the Sun Hydraulics negative conflict.',
                    },
                    {
                      n: '06',
                      title: 'Review high-spend ambiguous terms',
                      desc: 'Brake caliper and other broad industrial terms need product-fit and lead-quality checks before exclusion.',
                    },
                    {
                      n: '07',
                      title: 'Build high-intent landing pages',
                      desc: 'Strengthen hydraulic repair, manifolds, valves, pumps, cylinders and industrial braking pages for paid and SEO demand.',
                    },
                    {
                      n: '08',
                      title: 'Scale through controlled experiments',
                      desc: 'Increase budgets in stages, then measure qualified enquiries, impression-share response and incremental generic demand.',
                    },
                  ] as const
                ).map((r) => (
                  <div
                    key={r.n}
                    className="flex items-start gap-3 bg-white rounded-lg px-3.5 py-3 border border-slate-200"
                  >
                    <span className="text-blue-600 text-lg font-bold shrink-0 leading-none w-8 text-center">
                      {r.n}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 font-medium leading-relaxed">
                        {r.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            11 / 15
          </div>
        </section>
        <section
          id="opportunity"
          data-label="Opportunity"
          className="relative min-h-screen flex flex-col bg-slate-900"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-4xl mx-auto w-full text-center">
            <p className="text-blue-400 text-xs font-semibold tracking-widest uppercase mb-4">
              The opportunity
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
              Turn a healthy account into more incremental generic demand
            </h2>
            <p className="text-slate-300 text-sm md:text-base leading-relaxed mb-8 max-w-2xl mx-auto">
              The strongest opportunity is not a blanket budget increase. It is better conversion
              quality, separate brand reporting and controlled scaling of generic campaigns with
              verified budget loss.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl mx-auto text-left">
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="text-blue-400 text-xs font-semibold uppercase mb-2">Measure</div>
                <p className="text-sm text-slate-300">
                  Deduplicate enquiry and call actions and separate micro-conversions from qualified
                  leads.
                </p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="text-green-400 text-xs font-semibold uppercase mb-2">Optimise</div>
                <p className="text-sm text-slate-300">
                  Resolve search-term waste, negative coverage gaps and the Sun Hydraulics conflict.
                </p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="text-violet-400 text-xs font-semibold uppercase mb-2">Scale</div>
                <p className="text-sm text-slate-300">
                  Test additional generic budget against qualified enquiries and impression-share
                  response.
                </p>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-500 select-none pointer-events-none"
            aria-hidden="true"
          >
            12 / 15
          </div>
        </section>
        <section
          id="how-we-work"
          data-label="How we work"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-4xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 text-slate-900">
              How we work differently as an agency
            </h2>
            <div className="pb-4" />
            <div className="max-w-5xl mx-auto w-full mb-5">
              <div className="optimate-box rounded-2xl border border-blue-500/20 overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr]">
                  {/* Left: copy */}
                  <div className="p-6 md:p-8 flex flex-col justify-center">
                    <p className="text-blue-400 font-semibold text-[10px] uppercase tracking-widest mb-2">
                      Proprietary Technology
                    </p>
                    <h3
                      className="text-xl md:text-2xl font-bold text-white tracking-tight"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      Meet OptiMate
                    </h3>
                    <p className="mt-2 text-[12px] md:text-[13px] text-slate-400 leading-relaxed">
                      Your account doesn&rsquo;t sleep, and neither does OptiMate. Our AI engine
                      continuously analyses your campaigns, adjusting bids in real time, identifying
                      emerging trends before they become costly, and cross-referencing organic
                      rankings against paid spend to eliminate waste.
                    </p>
                    <p className="mt-2 text-[12px] md:text-[13px] text-slate-400 leading-relaxed">
                      While other agencies review accounts weekly or monthly with a junior, OptiMate
                      runs deep-dive analytics often, flagging anomalies and executing optimisations
                      proactively.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Budget Pacing &amp; Alerts
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Organic + Paid Monitoring
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Negative Keyword Sweeps
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Deep-Dive Analytics
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        24/7 Active
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Search Incrementality
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        SERP Displacement Monitor
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        AI Visibility Tracker
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
                        Conversion Rate Audit
                      </span>
                      <a
                        href="https://www.optimisedigital.online/ai-growth-tools"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500 border border-blue-400 text-[10px] font-semibold text-white hover:bg-blue-400 transition-colors"
                      >
                        All growth tools <span aria-hidden="true">→</span>
                      </a>
                    </div>
                  </div>
                  {/* Right: OptiMate radial visual */}
                  <div className="relative hidden md:flex items-center justify-center p-6">
                    <div className="relative w-full aspect-square max-w-[300px]">
                      {/* Animated rings */}
                      <div
                        className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping"
                        style={{ animationDuration: '3s' }}
                      />
                      <div
                        className="absolute inset-4 rounded-full border border-blue-500/15 animate-ping"
                        style={{ animationDuration: '3s', animationDelay: '0.5s' }}
                      />
                      <div
                        className="absolute inset-8 rounded-full border border-blue-500/10 animate-ping"
                        style={{ animationDuration: '3s', animationDelay: '1s' }}
                      />
                      {/* Connecting dashed lines (center 150,150 -> each node) */}
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 300 300"
                        fill="none"
                      >
                        <line
                          x1="150"
                          y1="150"
                          x2="26"
                          y2="46"
                          stroke="rgba(59,130,246,0.15)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <line
                          x1="150"
                          y1="150"
                          x2="206"
                          y2="25"
                          stroke="rgba(59,130,246,0.15)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <line
                          x1="150"
                          y1="150"
                          x2="-16"
                          y2="145"
                          stroke="rgba(59,130,246,0.15)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <line
                          x1="150"
                          y1="150"
                          x2="224"
                          y2="124"
                          stroke="rgba(59,130,246,0.15)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <line
                          x1="150"
                          y1="150"
                          x2="26"
                          y2="244"
                          stroke="rgba(59,130,246,0.15)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <line
                          x1="150"
                          y1="150"
                          x2="206"
                          y2="226"
                          stroke="rgba(59,130,246,0.15)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                        <line
                          x1="150"
                          y1="150"
                          x2="104"
                          y2="280"
                          stroke="rgba(59,130,246,0.15)"
                          strokeWidth="1"
                          strokeDasharray="4 4"
                        />
                      </svg>
                      {/* Core: OptiMate gradient tile */}
                      <div className="absolute inset-0 flex items-center justify-center z-10">
                        <div
                          className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center p-2.5"
                          style={{ boxShadow: '0 0 60px rgba(59,130,246,0.3)' }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="https://www.optimisedigital.online/images/optimate-ai-assistant-transparent.webp"
                            alt="OptiMate AI Engine"
                            className="optimate-icon w-16 h-auto"
                            style={{ filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.3))' }}
                          />
                        </div>
                      </div>
                      {/* 7 data nodes positioned around the ring */}
                      <div
                        className="absolute flex items-center gap-1.5 z-10"
                        style={{ left: '2%', top: '12%' }}
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-blue-400"
                          >
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Real-time bid adjustments
                        </span>
                      </div>
                      <div
                        className="absolute flex items-center gap-1.5 z-10"
                        style={{ left: '62%', top: '5%' }}
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-blue-400"
                          >
                            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
                            <path d="M7 14l4-4 4 4 6-6" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Budget pacing &amp; alerts
                        </span>
                      </div>
                      <div
                        className="absolute flex items-center gap-1.5 z-10"
                        style={{ left: '-12%', top: '45%' }}
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-blue-400"
                          >
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Deep-dive analytics
                        </span>
                      </div>
                      <div
                        className="absolute flex items-center gap-1.5 z-10"
                        style={{ left: '68%', top: '38%' }}
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-blue-400"
                          >
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Trend identification
                        </span>
                      </div>
                      <div
                        className="absolute flex items-center gap-1.5 z-10"
                        style={{ left: '2%', top: '78%' }}
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-blue-400"
                          >
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Organic + Paid monitoring
                        </span>
                      </div>
                      <div
                        className="absolute flex items-center gap-1.5 z-10"
                        style={{ left: '62%', top: '72%' }}
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-blue-400"
                          >
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <path d="M9 12l2 2 4-4" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          Negative keyword sweeps
                        </span>
                      </div>
                      <div
                        className="absolute flex items-center gap-1.5 z-10"
                        style={{ left: '28%', top: '90%' }}
                      >
                        <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-blue-400"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                          </svg>
                        </div>
                        <span className="text-[9px] font-medium text-slate-400 leading-tight whitespace-nowrap">
                          24/7 active optimisation
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-center text-xs md:text-sm text-slate-500 mt-4 mb-2">
              A five-step framework applied across every engagement.
            </p>
            <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-5 gap-2">
              {(
                [
                  {
                    n: '01',
                    title: 'Discovery',
                    desc: 'Understand the business commercially: goals, margins, constraints. Growth decisions grounded in commercial reality.',
                  },
                  {
                    n: '02',
                    title: 'Foundations',
                    desc: 'Audit and strengthen digital foundations before scaling: account audit, tracking, conversion readiness, channel health.',
                  },
                  {
                    n: '03',
                    title: 'Prioritisation',
                    desc: 'Identify the highest-impact opportunities and sequence by effort, risk, and expected return.',
                  },
                  {
                    n: '04',
                    title: 'Rollout',
                    desc: 'Structured phases, not a big-bang launch. Measure, test, and refine continuously against real outcomes.',
                  },
                  {
                    n: '05',
                    title: 'Scale & learn',
                    desc: 'Scale what is working and identify the next stage of growth based on performance data and commercial impact.',
                  },
                ] as const
              ).map((step) => (
                <div
                  key={step.n}
                  className="step-card rounded-lg px-2.5 py-2 border bg-white border-slate-200 flex flex-col items-start gap-0.5 cursor-default"
                >
                  <span className="text-base font-bold leading-none text-blue-600">{step.n}</span>
                  <p className="text-[12px] font-semibold leading-snug text-slate-900">
                    {step.title}
                  </p>
                  <p className="text-[10px] leading-snug text-slate-500">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            13 / 15
          </div>
        </section>
        <section
          id="working-together"
          data-label="Working together"
          className="relative flex flex-col bg-white"
          style={{ minHeight: 'calc(100vh - 100px)' }}
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-2 pb-8 max-w-3xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-2 text-slate-900">
              Working together
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-2xl mx-auto text-slate-500">
              Month-to-month because we earn the business through results.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-900 mb-2">Google Ads management</h3>
                <ul className="space-y-1 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>No lock-in contracts
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Expert team and strategy, not
                    juniors
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>AI-powered monitoring and
                    recommendations
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Clear bespoke dashboards
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Transparent reporting against
                    commercial goals
                  </li>
                </ul>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="text-xs font-semibold text-slate-900 mb-2">What’s included</h3>
                <ul className="space-y-1 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Week 1: Quick wins (negatives,
                    routing and defensive brand coverage)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Weeks 2–6: Restructure
                    (broad-match → phrase/exact, ad-group refinement)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Month 2+: Scale (form-on-LP
                    rollout, QS lift, ongoing review)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 shrink-0">✓</span>Ongoing: Fortnightly
                    optimisation + monthly optimisation plans
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900">
                    <th className="text-left text-white font-semibold px-4 py-2"></th>
                    <th className="text-right text-white font-semibold px-4 py-2">Approach</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="px-4 py-2 font-medium text-slate-900">Management scope</td>
                    <td className="px-4 py-2 text-right text-slate-700 font-semibold">
                      Agree after measurement validation
                    </td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900">Media budget</td>
                    <td className="px-4 py-2 text-right text-slate-700 font-semibold">
                      Controlled tests from current baseline
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            14 / 15
          </div>
        </section>
        <div id="space-transition" className="v2-space-transition" aria-hidden="true" />
        <section
          id="closing"
          data-label="Closing"
          className="closing-v2 relative flex flex-col"
          style={{ minHeight: 'calc(100vh - 100px)' }}
        >
          <Starfield id="closing-starfield" />
          <div
            className="orbit-deco"
            style={{ width: '1100px', height: '1100px', right: '-440px', bottom: '-380px' }}
          />
          <div
            className="orbit-deco"
            style={{
              width: '760px',
              height: '760px',
              right: '-260px',
              bottom: '-200px',
              borderColor: 'rgba(77,148,255,0.1)',
            }}
          />
          <div className="closing-station" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/slides/Space-station-optimise-digital.png" alt="" />
          </div>
          <div className="relative z-10 px-8 md:px-12 pt-10 w-full">
            <a
              href="https://optimisedigital.online?utm_source=audit&utm_medium=closing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3"
              aria-label="Visit Optimise Digital"
            >
              <span className="cover-dot" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/optimise-digital-logo-white.webp"
                alt="Optimise Digital"
                className="w-auto h-[22.8px] md:h-[30.4px]"
              />
            </a>
          </div>
          <div className="relative z-10 flex-1 flex flex-col justify-center px-8 md:px-12 pb-0 w-full gap-10">
            <h2 className="closing-h1 text-4xl md:text-6xl max-w-3xl">
              Ready to <em>discuss</em>?
            </h2>
            <div className="closing-who max-w-4xl">
              <div>
                <div className="lbl">For</div>
                <div className="val">
                  <span>Custom Fluid Power</span>
                </div>
              </div>
              <div>
                <div className="lbl">Peter Tu</div>
                <div className="val">
                  <a href="mailto:peter@optimisedigital.online">peter@optimisedigital.online</a>
                </div>
                <div className="val" style={{ marginTop: '4px' }}>
                  <a href="tel:0493053188">0493 053 188</a>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          id="appendix-cover"
          className="relative min-h-screen flex flex-col items-center justify-center bg-slate-900 text-center px-6"
        >
          <h2 className="text-5xl md:text-6xl font-bold text-white">Appendix</h2>
        </section>
        <section id="appendix" className="relative min-h-screen flex flex-col bg-white px-6 py-8">
          <div className="max-w-6xl mx-auto w-full">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                  Appendix
                </p>
                <h2 className="text-lg md:text-xl font-bold text-slate-900">Scoring methodology</h2>
              </div>
              <a
                href="#audit-score"
                className="text-[11px] text-blue-600 hover:text-blue-700 underline underline-offset-2 shrink-0"
              >
                Back to score overview
              </a>
            </div>
            <p className="text-[11px] text-slate-600 mb-3">
              Each step is scored 0&ndash;10 and weighted by importance. The overall score is the
              weighted average across all 13 steps, normalised to 0&ndash;100. Higher-weight areas
              have a larger impact on the total.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SCORING_METHODOLOGY_CARDS.map((card) => (
                <div
                  key={card.n}
                  className={
                    card.n === 13
                      ? 'bg-slate-50 rounded-lg p-2.5 border border-slate-200 md:col-span-2'
                      : 'bg-slate-50 rounded-lg p-2.5 border border-slate-200'
                  }
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-[12px] font-semibold text-slate-900">
                      <span className="text-blue-500 mr-1.5">{card.n}.</span>
                      {card.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] shrink-0">
                      <span className="text-slate-500">W: {card.weight}</span>
                      <span className={`font-semibold ${card.scoreClass}`}>{card.score}/10</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div
        id="rocket-fixed"
        className="rocket-fixed"
        role="button"
        tabIndex={0}
        aria-label="Go to next slide"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/optimise-digital-rocket.png"
          alt=""
          width={48}
          height={82}
          className="rocket-img"
        />
        <div className="rocket-flame" aria-hidden="true" />
      </div>
      <div className="flame-trail" aria-hidden="true" />
      <button
        type="button"
        id="flame-trail-hit"
        className="flame-trail-hit"
        aria-label="Go to next slide"
      />
      <button type="button" id="rocket-hint" className="rocket-hint" aria-hidden="true">
        <span className="rocket-hint-text">Click here to take off</span>
        <span className="rocket-hint-arrow">→</span>
      </button>

      <DeckScrollEffects />
    </AuditPasswordGate>
  )
}
