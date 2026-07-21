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
import AccountGlanceChart, {
  type ConversionAction,
  type Row as AccountGlanceRow,
} from './AccountGlanceChart'
import PdfConversionAccounting from './PdfConversionAccounting'
import { getPayload } from 'payload'
import { createClient } from '@libsql/client'
import config from '@payload-config'
import { CATEGORY_WEIGHTS, GOOGLE_ADS_AUDIT_CATEGORY_IDS, GOOGLE_ADS_AUDIT_LEGACY_CATEGORY_IDS, GOOGLE_ADS_AUDIT_LEGACY_RUBRIC_VERSION, type AuditCategoryScorecard, type GoogleAdsAuditCategoryId } from '@/lib/google-ads-audit-snapshots/scoring'

export const dynamic = 'force-dynamic'

const ACCOUNT_GLANCE_ROWS: AccountGlanceRow[] = [
  { m: '2025-03', s: 1848.79, c: 581, v: 54, pdf: 22 },
  { m: '2025-04', s: 1301.97, c: 342, v: 60, pdf: 32 },
  { m: '2025-05', s: 1458.9, c: 319, v: 31, pdf: 16 },
  { m: '2025-06', s: 1684.37, c: 494, v: 60, pdf: 25 },
  { m: '2025-07', s: 1696.91, c: 518, v: 80.5, pdf: 30.5 },
  { m: '2025-08', s: 1664.25, c: 525, v: 88, pdf: 42 },
  { m: '2025-09', s: 1673.55, c: 543, v: 58, pdf: 27 },
  { m: '2025-10', s: 625.9, c: 184, v: 22.5, pdf: 11.5 },
  { m: '2025-12', s: 2468.48, c: 500, v: 58.5, pdf: 28.5 },
  { m: '2026-01', s: 2769.3, c: 524, v: 64.5, pdf: 44.5 },
  { m: '2026-02', s: 2626.83, c: 586, v: 84.5, pdf: 52.5 },
  { m: '2026-03', s: 2779.8, c: 671, v: 66.5, pdf: 35.5 },
  { m: '2026-04', s: 2790.54, c: 600, v: 53, pdf: 33 },
  { m: '2026-05', s: 2703.37, c: 639, v: 69, pdf: 33 },
  { m: '2026-06', s: 3212.77, c: 638, v: 67, pdf: 35 },
  { m: '2026-07', s: 1757.06, c: 394, v: 50, pdf: 24 },
]

const CONVERSION_ACTIONS: ConversionAction[] = [
  {
    id: 'pdf-download',
    label: 'PDF downloads',
    values: [22, 32, 16, 25, 30.5, 42, 27, 11.5, 28.5, 44.5, 52.5, 35.5, 33, 33, 35, 24],
  },
  {
    id: 'click-to-call',
    label: 'Click to call',
    values: [20, 21, 9, 22, 40, 26, 23, 6, 21, 8, 20, 18, 12, 19, 25, 12],
  },
  {
    id: 'calls-from-ads',
    label: 'Calls from ads',
    values: [7, 3, 4, 8, 4, 10, 4, 4, 3, 5, 10, 6, 4, 8, 3, 7],
  },
  {
    id: 'ga4-enquiry',
    label: 'GA4 enquiry',
    values: [5, 4, 2, 5, 6, 10, 4, 1, 6, 7, 2, 7, 4, 9, 4, 7],
  },
]

type AuditScoreBar = { step: number; label: string; score: number | null; maximum: number; scoreColor: string; barColor: string; scorecard: AuditCategoryScorecard }
const CATEGORY_STEPS = Object.fromEntries(GOOGLE_ADS_AUDIT_CATEGORY_IDS.map((id, index) => [id, index + 1])) as Record<string, number>
const LEGACY_CATEGORY_STEPS = Object.fromEntries(GOOGLE_ADS_AUDIT_LEGACY_CATEGORY_IDS.map((id, index) => [id, index + 1])) as Record<string, number>
function scoreClass(score: number | null, maximum: number) { const ratio = score === null ? 0 : score / maximum; return ratio >= .8 ? ['text-green-500', 'bg-green-500'] : ratio >= .5 ? ['text-amber-500', 'bg-amber-500'] : ['text-red-500', 'bg-red-500'] }
async function loadLegacyAuditDirect(): Promise<any | null> {
  const database = createClient({
    url: process.env.DATABASE_URL || 'file:./content.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
  try {
    const result = await database.execute({
      sql: 'SELECT business_name, scored_report FROM google_ads_audits WHERE business_name = ? ORDER BY updated_at DESC LIMIT 1',
      args: ['Custom Fluid Power'],
    })
    const row = result.rows[0]
    if (!row) return null
    const scoredReport = typeof row.scored_report === 'string' ? JSON.parse(row.scored_report) : row.scored_report
    return { businessName: row.business_name, scoredReport }
  } finally {
    database.close()
  }
}

async function loadScorecardPayload(): Promise<{ bars: AuditScoreBar[]; total: number | null; issue?: string }> {
  let audit: any
  try {
    const payload = await getPayload({ config: await config })
    const result = await payload.find({
      collection: 'google-ads-audits',
      where: { slug: { equals: 'custom-fluidpower' } },
      sort: '-updatedAt', limit: 1, depth: 1, overrideAccess: true,
      select: { businessName: true, slug: true, snapshot: true, scoredReport: true },
    })
    audit = result.docs[0]
  } catch {
    audit = null
  }
  if (!audit) audit = await loadLegacyAuditDirect()
  const scoring = audit?.snapshot?.analysis?.scoring
  const categories = Array.isArray(scoring?.categories) ? scoring.categories as AuditCategoryScorecard[] : []
  if (categories.length) {
    const isLegacy = scoring.rubricVersion === GOOGLE_ADS_AUDIT_LEGACY_RUBRIC_VERSION
    const categorySteps = isLegacy ? LEGACY_CATEGORY_STEPS : CATEGORY_STEPS
    const bars = categories.map((scorecard) => { const [scoreColor, barColor] = scoreClass(scorecard.score, scorecard.maximum || 1); return { step: categorySteps[scorecard.id] ?? 99, label: scorecard.label, score: scorecard.score, maximum: scorecard.maximum, scoreColor, barColor, scorecard } }).sort((a, b) => a.step - b.step)
    return { total: typeof scoring.total === 'number' ? scoring.total : null, bars, issue: isLegacy ? 'Legacy 13-category evidence (v2). Its Channel Performance category is preserved as captured; create a v3 snapshot for the current 12-category scorecard.' : undefined }
  }

  const legacy = audit?.scoredReport
  const legacySteps = Array.isArray(legacy?.steps) ? legacy.steps : []
  const categoryIds = GOOGLE_ADS_AUDIT_LEGACY_CATEGORY_IDS as readonly GoogleAdsAuditCategoryId[]
  const bars = legacySteps.slice(0, categoryIds.length).map((step: any, index: number): AuditScoreBar => {
    const id = categoryIds[index]
    const score = typeof step.score === 'number' ? step.score : null
    const findings = Array.isArray(step.findings) ? step.findings.map(String) : []
    const scorecard: AuditCategoryScorecard = {
      id, label: String(step.name ?? step.title ?? `Audit area ${index + 1}`), weight: CATEGORY_WEIGHTS[id], score, maximum: 10,
      status: score === null ? 'insufficient_evidence' : 'scored', evidenceSummary: findings.join(' '),
      checks: findings.map((finding: string, findingIndex: number) => ({ id: `legacy-${index + 1}-${findingIndex + 1}`, label: finding, state: 'unknown', score: 0, maximum: 1, rationale: finding, formula: 'Legacy stored audit result', threshold: 'Not available in the legacy report', applicability: 'unknown', evidence: [] })),
    }
    const [scoreColor, barColor] = scoreClass(score, 10)
    return { step: index + 1, label: scorecard.label, score, maximum: 10, scoreColor, barColor, scorecard }
  })
  return {
    total: typeof legacy?.overallScore === 'number' ? legacy.overallScore : null,
    bars,
    issue: bars.length ? 'Legacy 13-category evidence. Its original Channel Performance category is preserved; a new v3 snapshot is required for the current 12-category scorecard.' : audit ? 'The latest audit does not have a completed scorecard yet.' : 'No Custom Fluid Power audit record is available yet.',
  }
}

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

export default async function AwayDigitalAuditPage() {
  const scorecardPayload = await loadScorecardPayload().catch(() => ({ bars: [], total: null, issue: 'The stored audit scorecard could not be loaded.' }))
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
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-[-10px]">
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
            2 / 12
          </div>
        </section>
        <section
          id="account-glance"
          data-label="Account at a glance"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-5 pb-2 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[2px] max-w-4xl mx-auto text-slate-900">
              PDF downloads make reported CPA look better than it is
            </h2>
            <AccountGlanceChart
              rows={ACCOUNT_GLANCE_ROWS}
              conversionActions={CONVERSION_ACTIONS}
              clientName="Custom Fluid Power"
              periodLabel="Latest 16 reported months"
              geoAvailable={false}
            />
            <div className="max-w-4xl mx-auto w-full mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
              <span className="font-bold">
                51% of reported primary conversions are PDF downloads.
              </span>{' '}
              Move PDF downloads to a secondary conversion so bidding and CPA report qualified lead
              actions, not content engagement.
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            3 / 12
          </div>
        </section>
        <section
          id="pdf-download-accounting"
          data-label="PDF conversion accounting"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-5xl mx-auto w-full">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700 text-center mb-2">
              Conversion accounting
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[-2px] text-slate-900">
              PDF downloads materially lower reported CPA
            </h2>
            <p className="text-center text-sm pb-5 max-w-3xl mx-auto text-slate-500">
              Toggle PDF downloads to see the reported CPA. PDFs should be recorded as a secondary
              conversion, not used as a qualified-lead bidding signal.
            </p>
            <PdfConversionAccounting />
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            4 / 12
          </div>
        </section>
        <section
          id="audit-score"
          data-label="Audit score"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[-2px] text-slate-900">
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
                      strokeDashoffset={scorecardPayload.total === null ? "339.292" : String(339.292 * (1 - scorecardPayload.total / 100))}
                      className="stroke-lime-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-slate-900">{scorecardPayload.total ?? '—'}</span>
                    <span className="text-xs text-slate-500">/ 100</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-lime-600">Room for improvement</span>
              </div>
              {/* Hover or focus a methodology area to reveal what its score covers. */}
              <div className="flex-1 w-full space-y-1.5">
                {scorecardPayload.issue && (
                  <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-snug text-amber-900">
                    <span className="font-semibold">{scorecardPayload.bars.length ? 'Stored audit result.' : 'No scorecard yet.'}</span> {scorecardPayload.issue}
                  </div>
                )}
                {scorecardPayload.bars.map((bar) => {
                  const methodology = bar.scorecard
                  return (
                    <div
                      key={bar.step}
                      tabIndex={0}
                      role="group"
                      aria-label={`${bar.step}. ${bar.label}. ${bar.score === null ? 'Insufficient evidence' : `Score ${bar.score} out of ${bar.maximum}`}. ${methodology.evidenceSummary}`}
                      className="group relative rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500 w-5 text-right shrink-0">
                          {bar.step}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-slate-700 truncate">
                              {bar.label}
                            </span>
                            <span className={`text-xs font-semibold ml-2 shrink-0 ${bar.scoreColor}`}>
                              {bar.score === null ? 'Insufficient evidence' : `${bar.score}/${bar.maximum}`}
                            </span>
                          </div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${bar.barColor}`}
                              style={{ width: `${bar.score === null ? 0 : (bar.score / bar.maximum) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      {methodology && (
                        <>
                          <p className="mt-1.5 pl-8 text-[10px] leading-snug text-slate-600 md:hidden">
                            <span className="font-semibold text-slate-700">{bar.score === null ? 'Insufficient evidence' : `Score ${bar.score}/${bar.maximum}`} · Weight {methodology.weight}.</span>{' '}
                            {methodology.evidenceSummary}
                          </p>
                          <div
                            role="tooltip"
                            className="pointer-events-none absolute right-full top-1/2 z-20 mr-3 hidden w-80 -translate-y-1/2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-snug text-slate-600 shadow-lg md:group-hover:block md:group-focus:block"
                          >
                            <span className="font-semibold text-slate-800">{bar.score === null ? 'Insufficient evidence' : `Score ${bar.score}/${bar.maximum}`} · Weight {methodology.weight}</span>
                            <span className="block mt-1">{methodology.evidenceSummary}</span>
                            <ul className="mt-2 space-y-1">
                              {methodology.checks.map((check) => {
                                const outcome = check.state === 'pass' ? 'Full credit' : check.score > 0 ? 'Partial credit' : check.state === 'unknown' ? 'Insufficient evidence' : 'No credit'
                                return (
                                  <li key={check.id} className="flex gap-1.5">
                                    <span aria-hidden="true" className="text-slate-400">•</span>
                                    <span><span className="font-medium text-slate-700">{check.label}</span>: <span className="whitespace-nowrap">{check.score}/{check.maximum}</span> · {outcome}</span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-5 max-w-4xl mx-auto w-full md:pl-[184px]">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-slate-700">
                  <span className="font-bold text-amber-700">Evidence policy:</span> categories without captured evidence are marked insufficient and excluded from the weighted denominator. Open each category to review its stored checks and references.
                </p>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-slate-600">
              Hover, focus, or use touch to review the stored scoring checks and evidence.
            </p>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            5 / 12
          </div>
        </section>
        <section
          id="category-breakdown"
          data-label="Category breakdown"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-4 pt-5 pb-3 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[2px] max-w-4xl mx-auto text-slate-900">
              Brand conversions make blended CPA look better than it is
            </h2>
            <p className="text-center text-xs pb-4 max-w-3xl mx-auto text-slate-500">
              Brand consumes only 15% of search-term spend but generates 46% of primary conversions,
              making blended account CPA look materially stronger than incremental acquisition
              performance.
            </p>
            <div className="max-w-4xl mx-auto w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div
                  tabIndex={0}
                  role="group"
                  aria-label="Owned-brand search terms. Focus or hover to reveal the top terms by spend."
                  className="group relative rounded-lg border border-purple-200 bg-purple-50 p-4 outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-purple-700 mb-2">
                    Owned-brand search terms
                  </div>
                  <div className="text-3xl font-bold text-purple-700 mb-1">15% spend</div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    46% of primary conversions
                  </div>
                  <p className="text-sm text-slate-700">
                    Custom Fluid Power, Custom Fluidpower, Custom Safe Brakes and Custom Storm
                    Brakes are classified as owned brand. Their conversion share is
                    disproportionately high.
                  </p>
                  <div className="mt-3 rounded-md border border-purple-200 bg-white/90 p-2.5 text-xs shadow-sm md:absolute md:left-4 md:right-4 md:top-full md:z-20 md:mt-1 md:invisible md:opacity-0 md:pointer-events-none md:transition-[opacity,visibility] md:duration-150 md:group-hover:visible md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus:visible md:group-focus:opacity-100 md:group-focus:pointer-events-auto">
                    <p className="font-semibold text-purple-900 mb-1">
                      Top owned-brand terms by spend
                    </p>
                    <ul className="space-y-1 text-slate-700">
                      {SEARCH_TERM_TOP_ROWS.filter((row) => row.classification === 'Brand').map(
                        (row) => (
                          <li key={row.term} className="flex items-center justify-between gap-3">
                            <span className="font-mono text-[11px]">{row.term}</span>
                            <span className="font-semibold tabular-nums">{row.spend}</span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">
                    Generic / non-owned demand
                  </div>
                  <div className="text-3xl font-bold text-emerald-700 mb-1">85% spend</div>
                  <div className="text-sm font-semibold text-slate-800 mb-2">
                    54% of primary conversions
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
                  <span className="font-bold text-blue-800">Interpretation:</span> report brand
                  separately. The blended CPA is not a reliable measure of incremental acquisition
                  until brand demand and qualified-lead quality are separated.
                </p>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            6 / 12
          </div>
        </section>
        <section
          id="brand-incrementality"
          data-label="Brand incrementality"
          className="relative min-h-screen flex flex-col bg-slate-50"
        >
          <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-5xl mx-auto w-full">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700 text-center mb-2">
              Brand spend
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[6px] text-slate-900">
              Paying for brand clicks you already get organically
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto w-full mb-4">
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-center">
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-700 mb-1">
                  Organic position
                </div>
                <div className="text-3xl font-bold text-violet-800">#1</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-1">
                  Brand spend
                </div>
                <div className="text-2xl font-bold text-amber-900">15% of total spend</div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                <div className="text-xs font-semibold uppercase tracking-wider text-rose-700 mb-1">
                  Brand conversion share
                </div>
                <div className="text-3xl font-bold text-rose-900">46%</div>
              </div>
            </div>
            <figure className="max-w-4xl mx-auto w-full rounded-xl border border-slate-200 bg-white p-3">
              <img
                src="/partners/custom-fluid-power/organic-brand-search-result.png"
                alt="Google search result for Custom Fluid Power showing the company in the top organic position"
                className="w-full max-h-[430px] object-contain rounded-lg border border-slate-100 bg-white"
              />
            </figure>
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            7 / 12
          </div>
        </section>
        <section
          id="ad-group-breakdown"
          data-label="Ad group breakdown"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-12 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[-6px] max-w-6xl mx-auto text-slate-900 md:whitespace-nowrap">
              Campaigns can scale beyond the $3,500 budget
            </h2>
            <p className="text-center text-xs text-slate-500 mb-4">
              Efficient CPA and lost impression share reveal missed opportunities that need active
              identification and testing.
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
          </div>
          <div
            className="absolute bottom-3 right-[36px] text-xs font-mono tabular-nums text-slate-400 select-none pointer-events-none"
            aria-hidden="true"
          >
            8 / 12
          </div>
        </section>
        <section
          id="recommendations"
          data-label="Recommendations"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-10 pb-8 max-w-6xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[-6px] max-w-4xl mx-auto text-slate-900">
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
            9 / 12
          </div>
        </section>
        <section
          id="opportunity"
          data-label="Opportunity"
          className="relative min-h-screen flex flex-col bg-slate-900"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-6xl mx-auto w-full text-center">
            <p className="text-blue-400 text-xs font-semibold tracking-widest uppercase mb-4">
              The opportunity
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-[14px] md:whitespace-nowrap">
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
            10 / 12
          </div>
        </section>
        <section
          id="how-we-work"
          data-label="How we work"
          className="relative min-h-screen flex flex-col bg-white"
        >
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-4xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[-2px] text-slate-900">
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
            11 / 12
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
            <h2 className="closing-h1 text-4xl md:text-6xl max-w-3xl mb-[-10px]">
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
