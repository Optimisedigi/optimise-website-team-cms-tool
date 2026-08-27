/**
 * Route: /partners/autotrader/google-ads-audit
 *
 * AutoTrader NZ Google Ads audit, using the Custom Fluid Power deck structure.
 * Each <section> is a reverse-scroll slide (see `flex flex-col-reverse` on
 * <main>): the cover sits at the BOTTOM of the document and the user scrolls
 * UP through the deck.
 *
 * SOURCE OF TRUTH for every figure:
 *   website-optimise-digital/website-growth-tools/.data/autotrader-audit/output/
 *     01-findings-tracking-and-spend.md      (Part 1)
 *     02-findings-search-term-relevance.md   (Part 2)
 *     03-findings-landing-pages.md           (Part 3)
 *     04-findings-device-geo-structure.md    (Part 4)
 * All 35 headline figures were verified against the source CSV exports.
 *
 * NO RUBRIC SCORE: this audit was built from manually exported UI CSVs, not the
 * API snapshot the 13-category scoring engine consumes. Categories render as
 * "not assessed". Do not backfill these with estimates — an unscored category
 * is an honest output; a guessed one is not.
 */

import './autotrader.css'
import AuditPasswordGate from '@/components/AuditPasswordGate'
import Starfield from './Starfield'
import DeckScrollEffects from './DeckScrollEffects'
import AccountGlanceChart from './AccountGlanceChart'
import { GOOGLE_ADS_AUDIT_LEGACY_CATEGORY_IDS, CATEGORY_WEIGHTS } from '@/lib/google-ads-audit-snapshots/scoring'

export const dynamic = 'force-dynamic'

/* ── Category labels for the 13-area rubric (all unscored here) ───────────── */
const CATEGORY_LABELS: Record<string, string> = {
  website: 'Website & landing experience',
  accountStructure: 'Account structure',
  keywordIntent: 'Keyword & intent coverage',
  tracking: 'Conversion tracking',
  campaignStructure: 'Campaign structure',
  channelPerformance: 'Channel performance',
  searchQueries: 'Search query quality',
  negativeKeywords: 'Negative keyword coverage',
  adsAssets: 'Ads & assets',
  brandGeneric: 'Brand vs generic',
  historicalPerformance: 'Historical performance',
  audienceStrategy: 'Audience strategy',
  competition: 'Competitive position',
}

/**
 * What this audit established per rubric area, and the residual gap.
 *
 * Every entry cites the file it came from, in
 * website-growth-tools/.data/autotrader-audit/. An earlier version of this
 * table claimed several areas were "not pulled yet" or had "unknown"
 * coverage. That was wrong — the exports and screenshots were supplied and
 * do carry the data. Each row below was re-checked against the actual file
 * contents before being tagged.
 *
 *   'evidenced' — answered from the supplied files.
 *   'partial'   — substantially answered, with a specific named residual.
 *   'platform'  — the residual is a hard limit of Google's own reporting;
 *                 no additional export removes it.
 *
 * Score stays N/A throughout: the 13-category engine consumes an API-shaped
 * snapshot this audit never produced, so scoring these would be invention.
 */
type CoverageStatus = 'evidenced' | 'partial' | 'platform'
const CATEGORY_COVERAGE: Record<
  string,
  { covered: string; gap: string; status: CoverageStatus }
> = {
  website: {
    covered:
      'Landing pages.csv — 21,794 destination URLs at 99.1% spend coverage; homepage, dealer-directory and editorial destinations quantified (Part 3)',
    gap: 'Page-speed, mobile-usability and on-page signals are not Google Ads data at all',
    status: 'platform',
  },
  accountStructure: {
    covered:
      'Campaign by month.csv (14 campaigns, states, 2024 restructure) + Ad group.csv (14 ad groups) + Change history report.csv, which names 63 PMax asset groups and 470 search themes',
    gap: 'Asset-group performance is not broken out per group, so structure is mapped but not ranked',
    status: 'evidenced',
  },
  keywordIntent: {
    covered:
      'Keyword.csv — all 31 keywords with match type (287 exact, 317 broad, 87 phrase rows); broad costs 2.7x exact (Part 4)',
    gap: 'Quality Score column was not included in the export',
    status: 'partial',
  },
  tracking: {
    covered:
      'Conversion actions.csv (22 actions x 31 months, 9 dormant) + conversion Summary screenshots showing Primary/Secondary and source, plus 5 per-action configuration screenshots (Part 1)',
    gap: 'Count setting, attribution model and conversion windows are visible per action but were captured for 5 of 22',
    status: 'partial',
  },
  campaignStructure: {
    covered:
      'Change history report.csv — 135 budget changes across 13 campaigns (NZ$15 to NZ$3,000) and 81 Target CPA events (NZ$8 to NZ$38), plus spend, CPA and lifespan per campaign from Campaign by month.csv',
    gap: 'Current live budget and tCPA are inferred from the last logged change, not a settings snapshot',
    status: 'evidenced',
  },
  channelPerformance: {
    covered:
      'Campaign by device.csv at 100% spend coverage, including 2,981,422 CTV impressions, plus Campaign by network.csv splitting Search, Search partners and Display (Part 4)',
    gap: 'Google reports all PMax spend as a single "Cross-network" row, so the Search/Display/YouTube split inside PMax is not exposed',
    status: 'partial',
  },
  searchQueries: {
    covered:
      'Search terms.csv — 397,043 rows, 228,504 distinct terms with match type, classified and spend-weighted; 0.1% irrelevant (Part 2)',
    gap: '39.5% of spend has no query-level reporting — volume thresholding plus non-search PMax inventory',
    status: 'platform',
  },
  negativeKeywords: {
    covered:
      'Negative Keyword list.png — 20 shared negative lists with keyword and campaign counts, from 3 keywords to 1,379, applied across up to 58 campaigns; competitor and irrelevant spend quantified from Search terms.csv (Part 2)',
    gap: 'List sizes and campaign attachment are visible in aggregate; the individual terms inside each list sit one screen deeper',
    status: 'evidenced',
  },
  adsAssets: {
    covered:
      'Change history report.csv — 1,680 headline and 588 description events, including live ad copy and asset creation per asset group',
    gap: 'No ad-level performance export, so ad strength and per-ad results are not measurable',
    status: 'partial',
  },
  brandGeneric: {
    covered:
      'Search terms.csv — brand and non-brand separated at term level, correcting a campaign-level error; PMax carries only 0.3% brand spend (Part 2)',
    gap: 'No material gap — the best-evidenced area of the audit',
    status: 'evidenced',
  },
  historicalPerformance: {
    covered:
      'Account by Month.csv — 31 complete months, Jan 2024 to Jul 2026, with spend, conversions, value and all-conversions; restructure dated (Part 1)',
    gap: 'Change history report.csv reaches back only to 25 Aug 2024 — Google retains roughly two years',
    status: 'platform',
  },
  audienceStrategy: {
    covered:
      'Change history report.csv — 140 audience-related change events and 470 PMax search themes recorded',
    gap: 'No audience performance export, so remarketing and in-market results are not measurable',
    status: 'partial',
  },
  competition: {
    covered:
      'Search terms.csv — NZD 119,194 of competitor-term spend located by campaign, 96.2% of it outside the dedicated campaign (Part 2)',
    gap: 'No auction-insights export, so impression share against named competitors is unknown',
    status: 'partial',
  },
}

const COVERAGE_STATUS_LABEL: Record<CoverageStatus, string> = {
  evidenced: 'Evidenced',
  partial: 'Partial',
  platform: 'Platform limit',
}
const COVERAGE_STATUS_CLASS: Record<CoverageStatus, string> = {
  evidenced: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-blue-50 text-blue-700 border-blue-200',
  platform: 'bg-slate-100 text-slate-600 border-slate-200',
}

const TLDR = [
  {
    label: 'The headline',
    body: 'The account is not badly operated — it is badly measured. Query relevance is unusually strong (0.1% irrelevant spend), while the conversion signal driving every automated decision is partly broken, partly duplicated, and dominated by an engagement action.',
  },
  {
    label: 'Tracking',
    body: 'Two conversion actions stopped recording in May 2025 and were never fixed — 55,774 lifetime conversions, 14 months blind. There were zero Google Ads changes that month, so the cause sits in the website, GTM or GA4.',
  },
  {
    label: 'What bidding sees',
    body: '80% of reported conversions are secondary and never touch bidding. The largest single action account-wide is "Add to Watchlist" (217,519) — engagement, not a lead.',
  },
  {
    label: 'Channel efficiency',
    body: 'Measured at term level with brand stripped out, PMax runs at CPA 19.40 against non-brand Search at 29.03. PMax carrying 73.6% of budget looks rational, not misallocated.',
  },
  {
    label: 'Search terms',
    body: 'Only NZD 712 of visible spend — 0.1% — went to genuinely irrelevant queries across 31 months. The waste is not in what the account matches.',
  },
  {
    label: 'Where it is',
    body: 'Destination quality. Nearly a quarter of spend lands on the homepage, and DSA sends NZD 56,007 there despite existing to find specific pages.',
  },
  {
    label: 'Competitor spend',
    body: 'NZD 119,194 goes to competitor brand queries, but 96% of it happens outside the campaign built for it — and the dedicated campaign pays roughly double.',
  },
  {
    label: 'Clear cuts',
    body: 'Display has returned 16 conversions from NZD 7,847 across 21 months (CPA 502). Three keywords and a growing CTV placement are the other candidates.',
  },
]

/**
 * Total slides in the deck. The cover is slide 1 but is deliberately left
 * unnumbered — a title card with "1 / 10" on it reads like a document, not
 * an opening.
 */
const TOTAL_SLIDES = 10

/**
 * Slide number, pinned bottom-CENTRE. Both corners are already occupied:
 * bottom-right by the rocket follower (`right: 3px`) and its flame trail
 * (a fixed column at `right: 25px` rising from `bottom: 0`), and bottom-left
 * by the Next.js dev indicator during local review. Centre is the only
 * consistently clear position. Decorative only — hidden from assistive tech
 * and click-through, so it can never intercept the rocket control.
 */
function SlideNumber({ n, dark = false }: { n: number; dark?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 select-none text-[11px] tabular-nums tracking-wide ${
        dark ? 'text-white/35' : 'text-slate-400'
      }`}
    >
      {n} <span className={dark ? 'text-white/20' : 'text-slate-200'}>/ {TOTAL_SLIDES}</span>
    </div>
  )
}

export default function AutoTraderAuditPage() {
  // The 13-area list (legacy rubric) — the current 12-area list drops
  // channelPerformance, and this audit has real device/channel coverage to
  // report there. Both render as "not assessed"; only the row set differs.
  const categories = GOOGLE_ADS_AUDIT_LEGACY_CATEGORY_IDS.map((id, index) => ({
    id,
    step: index + 1,
    label: CATEGORY_LABELS[id] ?? id,
    weight: CATEGORY_WEIGHTS[id],
    coverage: CATEGORY_COVERAGE[id],
  }))

  return (
    <AuditPasswordGate
      auditSlug="autotrader/google-ads-audit"
      businessName="AutoTrader"
      featureLabel="Google Ads Audit"
    >
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-200 z-50">
        <div id="progress-bar" className="h-full bg-blue-600 transition-all" style={{ width: '0%' }} />
      </div>

      <main className="flex flex-col-reverse">
        {/* ── 1. Cover ─────────────────────────────────────────────────── */}
        <section id="cover" data-label="Cover" className="cover-v2 relative min-h-screen flex flex-col">
          <Starfield id="cover-starfield" />
          <div className="orbit-deco" style={{ width: '1100px', height: '1100px', right: '-380px', top: '-300px' }} />
          <div
            className="orbit-deco"
            style={{ width: '720px', height: '720px', right: '-160px', top: '-80px', borderColor: 'rgba(77,148,255,0.1)' }}
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
                <span className="cover-meta">January 2024 &ndash; July 2026</span>
              </div>
              <h1 className="cover-h1 text-4xl md:text-6xl">AutoTrader</h1>
              <p className="text-sm md:text-base text-slate-300 max-w-xl">
                NZD 2.01m of media reviewed across 31 months, 14 campaigns and 228,504 distinct
                search terms.
              </p>
            </div>
          </div>
          <a
            href="#tldr"
            className="absolute z-10 bottom-6 left-8 md:left-12 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 transition-colors cursor-pointer"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span className="text-[11px] font-medium tracking-widest uppercase" style={{ color: 'var(--purple-soft)' }}>
              TL;DR
            </span>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--purple-soft)' }}
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        </section>

        {/* ── 2. TL;DR ─────────────────────────────────────────────────── */}
        <section id="tldr" data-label="TL;DR" className="relative min-h-screen flex flex-col bg-white">
          <SlideNumber n={2} />
          <div className="flex-1 flex flex-col justify-center px-6 pt-10 pb-8 max-w-5xl mx-auto w-full">
            <div className="mb-4 max-w-5xl mx-auto w-full">
              <p className="text-blue-500 font-semibold text-sm uppercase tracking-widest mb-1">TL;DR</p>
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-[5px]">
                The audit, in one slide
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {TLDR.map((card) => (
                <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">
                    {card.label}
                  </div>
                  <p className="text-[12px] text-slate-700 leading-snug">{card.body}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 leading-snug">
              Every figure in this deck is reproducible from the client&rsquo;s own Google Ads
              exports. 35 of 35 headline figures were verified against source.
            </p>
          </div>
        </section>

        {/* ── 3. Audit score — NOT ASSESSED ────────────────────────────── */}
        <section id="audit-score" data-label="Audit score" className="relative min-h-screen flex flex-col bg-white">
          <SlideNumber n={3} />
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[5px] text-slate-900">
              Google Ads account audit score
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              Assessed across 13 areas. Well-managed accounts typically score 65&ndash;80.
            </p>
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 max-w-4xl mx-auto w-full">
              {/* Empty score ring — deliberately unscored */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="relative inline-flex items-center justify-center">
                  <svg width="140" height="140" className="-rotate-90">
                    <circle cx="70" cy="70" r="54" fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-200" />
                    <circle
                      cx="70" cy="70" r="54" fill="none" strokeWidth="10" strokeLinecap="round"
                      strokeDasharray="6 10" className="stroke-slate-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-slate-400">N/A</span>
                    <span className="text-xs text-slate-400">/ 100</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-500">Not assessed</span>
              </div>

              <div className="flex-1 w-full space-y-3">
                <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-snug text-amber-900">
                  <span className="font-semibold">No rubric score for this audit.</span>{' '}
                  The
                  13-category engine scores an API-shaped account snapshot. AutoTrader supplied
                  login access only, so this audit was built from manual Google Ads UI exports —
                  which do not carry the settings-level evidence several categories require.
                  Scoring them anyway would mean inventing numbers, so every category below is
                  marked not assessed.
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-snug text-slate-700">
                  <span className="font-semibold text-slate-900">What replaces it.</span>{' '}
                  Parts 1&ndash;4
                  of the written findings carry 21 specific, dated and individually verified
                  findings. That is a stronger basis for action than a single composite number —
                  and unlike a score, each one names the money attached to it.
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-snug text-blue-900">
                  <span className="font-semibold">To produce a score,</span>{' '}
                  the account would need
                  to be connected by API. The scoring engine reads a structured snapshot of account
                  settings; it cannot consume CSV exports and screenshots, however complete they are.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 4. Category breakdown — coverage, not scores ─────────────── */}
        <section id="category-breakdown" data-label="Category breakdown" className="relative min-h-screen flex flex-col bg-slate-50">
          <SlideNumber n={4} />
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[5px] text-slate-900">
              What the CSV exports could and could not answer
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              The 13 rubric areas, each showing the file it was established from and the residual
              gap. Ten of the thirteen are evidenced or substantially evidenced from the supplied
              exports and screenshots.
            </p>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="py-2 pl-3 pr-2 font-semibold w-6">#</th>
                    <th className="py-2 px-2 font-semibold">Area</th>
                    <th className="py-2 px-2 font-semibold w-16 text-center">Score</th>
                    <th className="py-2 px-2 font-semibold">Established by this audit</th>
                    <th className="py-2 px-2 font-semibold w-24">Gap type</th>
                    <th className="py-2 px-2 font-semibold">What is still outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map((c) => (
                    <tr key={c.id} className="align-top hover:bg-slate-50">
                      <td className="py-1.5 pl-3 pr-2 text-[11px] text-slate-400 tabular-nums">{c.step}</td>
                      <td className="py-1.5 px-2">
                        <div className="text-[11.5px] font-medium text-slate-800">{c.label}</div>
                        <div className="text-[10px] text-slate-400">weight {c.weight}</div>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">
                          N/A
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-[11px] text-slate-600 leading-snug">
                        {c.coverage?.covered ?? 'Not assessed'}
                      </td>
                      <td className="py-1.5 px-2">
                        {c.coverage ? (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded border text-[9.5px] font-semibold whitespace-nowrap ${COVERAGE_STATUS_CLASS[c.coverage.status]}`}
                          >
                            {COVERAGE_STATUS_LABEL[c.coverage.status]}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`py-1.5 px-2 text-[11px] leading-snug ${
                          c.coverage?.status === 'evidenced' ? 'text-slate-600' : 'text-slate-500'
                        }`}
                      >
                        {c.coverage?.gap ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                How to read this table
              </div>
              <p className="text-[11px] text-slate-700 leading-snug">
                Every row cites the file it was established from. <strong>Evidenced</strong>{' '}
                areas
                were answered from the supplied exports and screenshots.{' '}
                <strong>Partial</strong>{' '}
                areas are substantially answered with a specific named
                residual. <strong>Platform limit</strong>{' '}
                means the residual is a hard constraint of
                Google&rsquo;s own reporting &mdash; page-speed is not Ads data, 39.5% of spend has
                no query-level reporting, and change history retains about two years. Score stays
                N/A across all thirteen because the rubric engine needs an API snapshot, not because
                the evidence is thin.
              </p>
            </div>
          </div>
        </section>

        {/* ── 5. Account at a glance ───────────────────────────────────── */}
        <section id="account-glance" data-label="Account at a glance" className="relative min-h-screen flex flex-col bg-white">
          <SlideNumber n={5} />
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[5px] text-slate-900">
              The account at a glance
            </h2>
            <p className="text-center text-sm md:text-base pb-4 max-w-3xl mx-auto text-slate-500">
              Spend grew roughly eightfold between January 2024 and its 2026 peak. Cost per
              conversion has been climbing since mid-2025.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              {[
                { k: 'Total spend', v: '$2.01m', s: 'NZD, 31 months' },
                { k: 'Primary conversions', v: '112,166', s: 'the ones bidding sees' },
                { k: 'Blended CPA', v: '$17.95', s: 'account lifetime' },
                { k: 'Campaigns', v: '14', s: '11 enabled, 3 paused' },
              ].map((m) => (
                <div key={m.k} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">{m.k}</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums leading-tight">{m.v}</div>
                  <div className="text-[10px] text-slate-400">{m.s}</div>
                </div>
              ))}
            </div>

            <AccountGlanceChart />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Where the money goes
                </div>
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-slate-200">
                    {[
                      ['Performance Max', '$1,480,494', '73.6%', '19.41'],
                      ['DSA', '$434,744', '21.6%', '22.64'],
                      ['Search', '$89,794', '4.5%', '5.38'],
                      ['Display', '$7,847', '0.4%', '502.07'],
                    ].map((r) => (
                      <tr key={r[0]}>
                        <td className="py-1 pr-2 text-slate-700">{r[0]}</td>
                        <td className="py-1 px-1 text-right tabular-nums text-slate-700">{r[1]}</td>
                        <td className="py-1 px-1 text-right tabular-nums text-slate-500">{r[2]}</td>
                        <td className={`py-1 pl-1 text-right tabular-nums font-semibold ${r[0] === 'Display' ? 'text-rose-600' : 'text-slate-700'}`}>
                          ${r[3]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-[9.5px] text-slate-400 mt-1">Last column is CPA. DSA is split out by campaign name — it reports as campaign type &ldquo;Search&rdquo;.</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
                  Read this chart carefully
                </div>
                <p className="text-[11.5px] text-slate-800 leading-snug">
                  Conversions here are <strong>primary</strong>{' '}
                  only. The account reports 571,683 all-conversions, but 80% of those are secondary
                  and never reach bidding &mdash; and the biggest single one is &ldquo;Add to
                  Watchlist&rdquo;, which is engagement rather than a lead. Any CPA quoted on the all-conversions basis will look roughly
                  five times better than reality.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. Search terms — Part 2 ─────────────────────────────────── */}
        <section id="search-terms" data-label="Search terms" className="relative min-h-screen flex flex-col bg-slate-50">
          <SlideNumber n={6} />
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[5px] text-slate-900">
              The waste is not in what the account matches
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              228,504 distinct search terms classified and weighted by spend. Only 0.1% went to
              genuinely irrelevant queries.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-2">
                  Where the visible spend went
                </div>
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ['In-market buyer', '$990,686', '81.3%', '20.23', false],
                      ['Competitor brands', '$119,194', '9.8%', '19.59', false],
                      ['Own brand', '$52,683', '4.3%', '3.34', false],
                      ['Unclassified', '$33,840', '2.8%', '22.96', false],
                      ['Seller intent', '$21,136', '1.7%', '23.10', false],
                      ['Research', '$391', '0.0%', '20.28', false],
                      ['Irrelevant', '$712', '0.1%', '24.83', true],
                    ].map((r) => (
                      <tr key={String(r[0])}>
                        <td className={`py-1 pr-2 ${r[4] ? 'font-semibold text-emerald-700' : 'text-slate-700'}`}>{r[0]}</td>
                        <td className="py-1 px-1 text-right tabular-nums text-slate-700">{r[1]}</td>
                        <td className="py-1 px-1 text-right tabular-nums text-slate-500">{r[2]}</td>
                        <td className="py-1 pl-1 text-right tabular-nums text-slate-700">${r[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-[9.5px] text-slate-400 mt-1.5">
                  Last column is CPA. Visible spend is $1,218,641 &mdash; 60.5% of the account.
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 mb-1">
                    Query relevance is strong
                  </div>
                  <p className="text-[12px] text-slate-700 leading-snug">
                    $712 of irrelevant spend across 31 months. DSA is the cleanest channel at 91.9%
                    in-market, PMax 84.0% &mdash; notable because neither has keyword control. Search
                    reads 10.0% only because it is deliberately a brand and seller channel.
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
                    Competitor spend is incidental, not strategic
                  </div>
                  <p className="text-[12px] text-slate-700 leading-snug">
                    $119,194 goes to competitor brand queries, but only 3.8% of it sits in the
                    campaign built for it. The dedicated campaign pays $38.40 per conversion; PMax
                    picks up the same category at $20.03 &mdash; roughly half.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    Brand protection is working
                  </div>
                  <p className="text-[12px] text-slate-700 leading-snug">
                    Only 0.3% of PMax spend touches own-brand queries. The brand exclusion lists are
                    doing their job &mdash; brand demand is being captured by Search at $3.34, not
                    cannibalised by PMax.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 max-w-4xl mx-auto w-full">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 mb-1">
                The correction that matters
              </div>
              <p className="text-[12px] text-slate-700 leading-snug">
                Measured at <strong>term</strong>{' '}
                level with own-brand stripped out, PMax runs at
                $19.40 per conversion, DSA at $22.60 and Search at $29.03. An earlier campaign-level
                cut suggested the opposite, because one &ldquo;non-brand&rdquo; Search campaign turned
                out to be 35.3% brand traffic at $3.34. PMax holding 73.6% of budget looks rational,
                not misallocated.
              </p>
            </div>
          </div>
        </section>

        {/* ── 7. Landing pages — Part 3 ────────────────────────────────── */}
        <section id="landing-pages" data-label="Landing pages" className="relative min-h-screen flex flex-col bg-white">
          <SlideNumber n={7} />
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[5px] text-slate-900">
              Destination quality is where the money leaks
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              21,794 destination URLs at 99.1% spend coverage &mdash; the most complete view in the
              export set.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl mx-auto w-full mb-4">
              {[
                { k: 'Homepage spend', v: '$467,287', s: '23.4% of all landing-page spend' },
                { k: 'Homepage CPA, brand stripped', v: '$20.14', s: 'vs $17.88 account average' },
                { k: 'DSA sent to the homepage', v: '$56,007', s: 'across all four DSA campaigns' },
              ].map((c) => (
                <div key={c.k} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-0.5">{c.k}</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums">{c.v}</div>
                  <div className="text-[10px] text-slate-500">{c.s}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1">
                  The homepage number is a brand illusion
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  At face value the homepage looks like the best destination in the account at $13.91
                  per conversion. That is entirely brand traffic: brand campaigns landing there
                  convert at $3.62. Strip them out and the remaining $421,350 runs at
                  <strong> $20.14</strong>{' '}
                  &mdash; 13% worse than account average. For a brand search
                  the homepage is right; for the other 90% of that spend it asks the user to start
                  their search again.
                </p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 mb-1">
                  DSA is undermining its own purpose
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  DSA exists to match a query to a specific page, yet 12.9% of its spend lands on the
                  homepage &mdash; consistent across all four regional campaigns, so this is systemic.
                  Homepage DSA traffic converts at $23.48 against $22.34 on its own deep pages. A URL
                  exclusion is a low-risk fix on the account&rsquo;s cleanest channel.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Dealer directory absorbs 11.2% of PMax
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  $164,924 of PMax spend lands on dealer directory pages at $21.73 per conversion.
                  Those pages serve dealers &mdash; the advertisers &mdash; rather than car buyers.
                  Whether that is a goal or a diversion is a commercial question for the client.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Editorial converts at a third of the rate
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  $17,380 on reviews, advice and news pages converting at 0.74% against an account
                  rate of 2.15%. Small money, but a certain saving: exclude editorial paths from DSA
                  page feeds and PMax URL expansion.
                </p>
              </div>
            </div>

            <p className="text-[9.5px] text-slate-400 mt-3 max-w-4xl mx-auto w-full text-center">
              Caveat: PMax destination CPAs span only $18.61&ndash;$20.72, and the watchlist-heavy
              conversion signal likely compresses the real gaps. Re-test once tracking is repaired.
            </p>
          </div>
        </section>

        {/* ── 8. Structure: device, geography, keywords — Part 4 ───────── */}
        <section id="structure" data-label="Structure" className="relative min-h-screen flex flex-col bg-slate-50">
          <SlideNumber n={8} />
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[5px] text-slate-900">
              Device, geography and what is left of the structure
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              Device data covers 100% of spend &mdash; and it answers what the invisible 39.5% is
              doing.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl mx-auto w-full">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-2">
                  Spend by device
                </div>
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ['Mobile phones', '$1,662,574', '82.6%', '18.32'],
                      ['Computers', '$280,217', '13.9%', '16.10'],
                      ['Tablets', '$47,911', '2.4%', '16.87'],
                      ['TV screens', '$21,047', '1.0%', '19.69'],
                    ].map((r) => (
                      <tr key={String(r[0])}>
                        <td className="py-1 pr-2 text-slate-700">{r[0]}</td>
                        <td className="py-1 px-1 text-right tabular-nums text-slate-700">{r[1]}</td>
                        <td className="py-1 px-1 text-right tabular-nums text-slate-500">{r[2]}</td>
                        <td className="py-1 pl-1 text-right tabular-nums text-slate-700">${r[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-[9.5px] text-slate-400 mt-1.5">Last column is CPA.</div>
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 mb-1">
                  Performance Max is buying television
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  TV screens produced <strong>2,981,422 impressions and 1,439 clicks</strong>{' '}
                  &mdash; a click-through rate of 0.048%. That is connected-TV and YouTube inventory running
                  inside Performance Max, and it is growing: $10,960 in 2026 year to date.
                </p>
                <p className="text-[12px] text-slate-700 leading-snug mt-2">
                  The brief asks for demand <em>interception</em>. CTV is a broadcast medium &mdash;
                  the opposite of intent capture. Small money at 1.0% of spend, but strategically
                  misaligned and trending up.
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3 max-w-4xl mx-auto w-full">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Geography is flat
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Every region falls between <strong>$17.17 and $18.75</strong>{' '}
                  per conversion &mdash; a spread under 10% across 16 regions. Spend tracks population closely. There is no
                  regional lever here, and saying so is more useful than inventing one.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  31 keywords in the whole account
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Keyword control covers 4.4% of spend. Broad match costs $10.66 against exact at
                  $3.93. Three terms carry the waste: <em>car trade</em> at $101.21 and
                  <em> only cars</em> at $46.61 per conversion.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-1">
                  Legacy never cleaned up
                </div>
                <p className="text-[12px] text-slate-700 leading-snug">
                  Five campaigns still carry location targeting despite zero spend since January 2024,
                  and four paused ad groups remain in the DSA structure. Housekeeping, not
                  performance &mdash; but it makes the account harder to read.
                </p>
              </div>
            </div>

            <p className="text-[9.5px] text-slate-400 mt-3 max-w-4xl mx-auto w-full text-center">
              Two honest caveats: the raw export shows TV screens converting at 74% &mdash; an
              artefact of a 1,439-click denominator on view-through conversions, not real performance.
              And desktop&rsquo;s 12% CPA advantage is a mix effect, not a device effect: within PMax
              the devices are identical and within DSA desktop is worse.
            </p>
          </div>
        </section>

        {/* ── 9. Recommendations ──────────────────────────────────────── */}
        <section id="recommendations" data-label="Recommendations" className="relative min-h-screen flex flex-col bg-white">
          <SlideNumber n={9} />
          <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-8 max-w-5xl mx-auto w-full">
            <h2 className="text-xl md:text-2xl font-bold text-center mb-[5px] text-slate-900">
              What to do, in order
            </h2>
            <p className="text-center text-sm md:text-base pb-5 max-w-3xl mx-auto text-slate-500">
              Measurement first. Every automated decision in this account depends on a conversion
              signal that is currently unreliable.
            </p>

            <div className="max-w-4xl mx-auto w-full space-y-2">
              {[
                {
                  n: 1,
                  t: 'Diagnose the May 2025 tracking break',
                  w: 'Two actions worth 55,774 lifetime conversions stopped that month and never resumed. There were zero Google Ads changes in May 2025, so the cause is a website, GTM or GA4 release. This blocks everything else.',
                  tag: 'Critical',
                  tone: 'rose',
                },
                {
                  n: 2,
                  t: 'Audit Primary vs Secondary on all 22 conversion actions',
                  w: 'Determines what bidding actually optimises toward. Confirm the call-dealer duplicate — Google Ads and GA4 track the same event with r = 0.97 across 31 months.',
                  tag: 'Critical',
                  tone: 'rose',
                },
                {
                  n: 3,
                  t: 'Pause the Display campaign',
                  w: '$7,847 over 21 months for 16 conversions at $502 each. Immediate, no downside, frees budget.',
                  tag: 'Quick win',
                  tone: 'emerald',
                },
                {
                  n: 4,
                  t: 'Stop DSA serving the homepage',
                  w: '$56,007 of DSA spend lands on a page with no answer on it. A URL exclusion or page-feed rule forces DSA back to the specific pages it exists to find.',
                  tag: 'Quick win',
                  tone: 'emerald',
                },
                {
                  n: 5,
                  t: 'Archive the 9 dormant conversion actions and 5 legacy campaigns',
                  w: 'Removes noise so the Goals screen and campaign list can actually be read.',
                  tag: 'Housekeeping',
                  tone: 'slate',
                },
                {
                  n: 6,
                  t: 'Decide whether competitor conquesting is intentional',
                  w: '$119,194 is going to competitor brand terms with 96% of it outside the campaign built for it. If wanted, the dedicated campaign is redundant at double the cost. If not, account-level negatives recover it. This needs a client decision, not an analyst assumption.',
                  tag: 'Client decision',
                  tone: 'amber',
                },
                {
                  n: 7,
                  t: 'Pull impression share, then re-test the destination findings',
                  w: 'Impression share shows whether brand Search — the cheapest traffic in the account at $3.19 — is leaving volume on the table. Re-run the landing-page comparison once the conversion signal is trustworthy, since the watchlist-heavy signal currently compresses those gaps.',
                  tag: 'Next',
                  tone: 'slate',
                },
              ].map((r) => {
                const tone =
                  r.tone === 'rose'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : r.tone === 'emerald'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : r.tone === 'amber'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                return (
                  <div key={r.n} className="rounded-lg border border-slate-200 bg-white p-3 flex gap-3">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">
                      {r.n}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[12.5px] font-semibold text-slate-900">{r.t}</span>
                        <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone}`}>
                          {r.tag}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-slate-600 leading-snug">{r.w}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 max-w-4xl mx-auto w-full">
              <p className="text-[12px] text-slate-700 leading-snug">
                <strong>What this audit deliberately does not recommend:</strong>{' '}
                moving budget out of
                Performance Max. Measured correctly, PMax is the most efficient non-brand channel in
                the account. An earlier campaign-level reading suggested otherwise and was withdrawn
                &mdash; the term-level evidence does not support it.
              </p>
            </div>
          </div>
        </section>

        <div id="space-transition" className="v2-space-transition" aria-hidden="true" />

        {/* ── 10. Closing ─────────────────────────────────────────────── */}
        <section
          id="closing"
          data-label="Closing"
          className="closing-v2 relative flex flex-col"
          style={{ minHeight: 'calc(100vh - 100px)' }}
        >
          <SlideNumber n={10} dark />
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
                  <span>AutoTrader</span>
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
        <span className="rocket-hint-arrow">&rarr;</span>
      </button>

      <DeckScrollEffects />
    </AuditPasswordGate>
  )
}
