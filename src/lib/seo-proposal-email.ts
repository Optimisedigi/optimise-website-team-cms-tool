/**
 * SEO Audit Proposal — detailed outreach email generator.
 *
 * Pure: turns a stored Growth Tools SeoProposalReport into a narrative,
 * tabular email in the style of the original Swanson audit email. Returns a
 * plain-text variant and an HTML variant (with real <table>s) so the copy
 * button can offer both. No I/O, no React — unit-testable in isolation.
 */

// Loose report shape (mirrors the deck's; a partial report still produces a
// sensible email — missing sections are simply skipped).
export type EmailQueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number }

export interface SeoProposalEmailReport {
  meta?: { websiteUrl?: string }
  searchPerformance?: {
    brandClicks: number; nonBrandClicks: number; brandDependencyPct: number
    brandImpressions: number; nonBrandImpressions: number; nonBrandImpressionSharePct: number
    strikingDistanceQueries: EmailQueryRow[]
    buriedQueries: EmailQueryRow[]
  } | null
  liveRankings?: {
    rankings: { keyword: string; position: number | null; searchVolume: number; opportunity: string }[]
  } | null
  demandLandscape?: { categories: { name: string; totalVolume: number }[] } | null
  seoAudit?: { overallScore: number; categoryScores: Record<string, number> } | null
  croAudit?: { overallScore: number; categoryScores: Record<string, number> } | null
  topicAuthority?: {
    strongClusters: { name: string; reason: string }[]
    clusters: { name: string; isBlogCluster: boolean; memberCount: number }[]
  } | null
  synthesis?: { verdict: string } | null
}

export interface SeoProposalEmailInput {
  businessName: string
  contactName?: string | null
  websiteUrl?: string | null
  /** Optional override of the brand label used in copy (defaults to businessName). */
  brandLabel?: string | null
}

export interface SeoProposalEmail {
  subject: string
  plainBody: string
  htmlBody: string
}

// ── Formatters ───────────────────────────────────────────────────────────────
const n = (x: number | null | undefined): string =>
  x == null ? '—' : new Intl.NumberFormat('en-AU').format(Math.round(x))
const pct = (x: number | null | undefined): string => (x == null ? '—' : `${Math.round(x)}%`)
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Weakest N categories from a 0–10 score map, as readable labels. */
function weakestCategories(scores: Record<string, number> | undefined, count: number): string[] {
  if (!scores) return []
  return Object.entries(scores)
    .filter(([, v]) => typeof v === 'number')
    .sort(([, a], [, b]) => a - b)
    .slice(0, count)
    .map(([k]) => humanizeKey(k))
}

// Hand-tuned labels for category keys so we don't get "Faq Implementation",
// "Cta" or "Trust Social Proof" from a naive camelCase split.
const CATEGORY_LABELS: Record<string, string> = {
  faqImplementation: 'FAQ implementation',
  structuredData: 'structured data',
  serviceCoverage: 'service-page coverage',
  coreWebVitals: 'Core Web Vitals',
  securityPerformance: 'security & performance',
  metaData: 'meta data',
  headingStructure: 'heading structure',
  internalLinking: 'internal linking',
  imageOptimization: 'image optimisation',
  urlStructure: 'URL structure',
  navigationUx: 'navigation & UX',
  contentStructure: 'content structure',
  eeat: 'E-E-A-T (trust signals)',
  siteHealth: 'site health',
  indexability: 'indexability',
  sitemapRobots: 'sitemap & robots',
  // CRO
  firstImpression: 'first impression',
  trustSocialProof: 'trust & social proof',
  cta: 'CTAs',
  leadCapture: 'lead capture',
  contentReadability: 'content & readability',
  navigation: 'navigation',
}

function humanizeKey(k: string): string {
  if (CATEGORY_LABELS[k]) return CATEGORY_LABELS[k]
  // Fallback: split camelCase and lowercase (acronyms stay readable enough).
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

/**
 * Build the detailed proposal email. Mirrors the original Swanson email's
 * 6-point structure, driven entirely by the report data.
 */
export function buildSeoProposalEmail(
  report: SeoProposalEmailReport,
  input: SeoProposalEmailInput,
): SeoProposalEmail {
  const brand = (input.brandLabel || input.businessName || 'your business').trim()
  const greetingName = input.contactName?.trim() || 'there'
  const sp = report.searchPerformance
  const live = report.liveRankings
  const seo = report.seoAudit
  const cro = report.croAudit
  const topic = report.topicAuthority

  const subject = `What we found in ${brand}'s search data (before we reached out)`

  // ── Plain-text body ──────────────────────────────────────────────────────
  const P: string[] = []
  P.push(`Hi ${greetingName},`, '')
  P.push(
    `We used ${brand}'s Search Console data and ran our SEO and conversion website audits before reaching out. Here's what we actually found.`,
    '',
  )

  let section = 1

  // 1. Brand vs non-brand
  if (sp) {
    P.push(`${section}. You're winning on brand, leaving non-brand on the table.`)
    P.push(
      `${pct(sp.nonBrandImpressionSharePct)} of your search impressions are non-brand (people searching for services, not "${brand}"), but those convert to only ${pct(100 - sp.brandDependencyPct)} of your clicks. The demand is already there; you're being shown and not getting the click.`,
    )
    P.push('')
    P.push(`             Clicks      Impressions`)
    P.push(`Brand        ${n(sp.brandClicks).padStart(6)}      ${n(sp.brandImpressions)}`)
    P.push(`Non-brand    ${n(sp.nonBrandClicks).padStart(6)}      ${n(sp.nonBrandImpressions)}`)
    P.push('')
    section++
  }

  // 2. Rank is decent, not capturing clicks (striking distance / live rank)
  const rankRows = buildRankTable(report)
  if (rankRows.length > 0) {
    P.push(`${section}. Your rank is decent, you're just not capturing the clicks.`)
    P.push(
      `For these terms you're often on or near page one but with low click-through. Sharper titles, FAQs and schema fix this fast, with no rebuild needed.`,
    )
    P.push('')
    P.push(`Keyword                             Rank      Impressions   Vol/mo`)
    for (const r of rankRows.slice(0, 12)) {
      P.push(
        `${r.keyword.slice(0, 34).padEnd(35)} ${String(r.rank).padStart(4)}   ${n(r.impressions).padStart(11)}   ${r.volume != null ? n(r.volume).padStart(6) : '   —'}`,
      )
    }
    P.push('')
    section++
  }

  // 3. High-volume terms wide open (buried)
  if (sp && sp.buriedQueries.length > 0) {
    const top = sp.buriedQueries.slice(0, 5).map((q) => q.query).join(', ')
    P.push(`${section}. The high-volume terms are wide open.`)
    P.push(
      `You don't yet rank for some of the biggest demand: ${top}. These are winnable and would bring qualified, ready-to-buy traffic.`,
    )
    P.push('')
    section++
  }

  // 4. Ownership opportunity (a topic you already lead, or a pos 4–5 term)
  const ownership = ownershipOpportunity(report)
  if (ownership) {
    P.push(`${section}. ${ownership.title}`)
    P.push(ownership.body)
    P.push('')
    section++
  }

  // 5. Strong foundations, clear gaps (SEO)
  if (seo) {
    const gaps = weakestCategories(seo.categoryScores, 3)
    P.push(`${section}. Strong foundations, clear gaps.`)
    P.push(
      `Your SEO fundamentals score ${seo.overallScore}/10. The clearest gaps: ${gaps.join(', ')}. These are consistent and fixable.`,
    )
    P.push('')
    section++
  }

  // 6. Conversion has room (CRO)
  if (cro) {
    const gaps = weakestCategories(cro.categoryScores, 2)
    P.push(`${section}. Conversion has room too.`)
    P.push(
      `Your site scored ${cro.overallScore}/10 on conversion. ${gaps.length ? `${capitalize(gaps.join(' and '))} scored lowest. ` : ''}Adding proof, case studies and FAQs lifts both rankings and the rate at which visitors enquire.`,
    )
    P.push('')
    section++
  }

  // Bottom line
  P.push('Bottom line: the demand exists, you\'re already relevant, and you\'re leaving it on the table. This is optimisation and ongoing content improvement, not a rebuild.')
  P.push('')
  P.push(
    `Before we propose a monthly figure, it would help to know roughly the average value of a qualified lead to ${brand}, so we can frame the investment around the return it's likely to generate.`,
  )

  const plainBody = P.join('\n')

  // ── HTML body — a complete, polished styled email document so it pastes
  // formatted (with tables) straight into Gmail via a text/html clipboard copy.
  const H: string[] = []
  let s2 = 1
  const heading = (t: string) =>
    `<p style="margin:24px 0 8px;font-size:16px;font-weight:700;color:#0f172a">${s2}. ${esc(t)}</p>`
  const para = (t: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55;color:#334155">${t}</p>`

  H.push(para(`Hi ${esc(greetingName)},`))
  H.push(
    para(
      `We used <strong>${esc(brand)}</strong>'s Search Console data and ran our SEO and conversion website audits before reaching out. Here's what we actually found.`,
    ),
  )

  if (sp) {
    H.push(heading("You're winning on brand, leaving non-brand on the table."))
    H.push(
      para(
        `<strong>${esc(pct(sp.nonBrandImpressionSharePct))}</strong> of your search impressions are non-brand (people searching for services, not "${esc(brand)}"), but those convert to only <strong>${esc(pct(100 - sp.brandDependencyPct))}</strong> of your clicks. The demand is already there; you're being shown and not getting the click.`,
      ),
    )
    H.push(
      htmlTable(
        ['', 'Clicks', 'Impressions', 'Share of clicks'],
        [
          ['Brand', n(sp.brandClicks), n(sp.brandImpressions), pct(sp.brandDependencyPct)],
          ['Non-brand', n(sp.nonBrandClicks), n(sp.nonBrandImpressions), pct(100 - sp.brandDependencyPct)],
        ],
      ),
    )
    s2++
  }
  if (rankRows.length > 0) {
    H.push(heading("Your rank is decent, you're just not capturing the clicks."))
    H.push(
      para(
        `For these terms you're often on or near page one but with low click-through. Sharper titles, FAQs and schema fix this fast, with no rebuild needed.`,
      ),
    )
    H.push(
      htmlTable(
        ['Keyword', 'Live rank', 'GSC impressions', 'Searches/mo'],
        rankRows.slice(0, 12).map((r) => [r.keyword, String(r.rank), n(r.impressions), r.volume != null ? n(r.volume) : '—']),
      ),
    )
    s2++
  }
  if (sp && sp.buriedQueries.length > 0) {
    const top = sp.buriedQueries.slice(0, 5).map((q) => esc(q.query)).join(', ')
    H.push(heading('The high-volume terms are wide open.'))
    H.push(
      para(`You don't yet rank for some of the biggest demand: <strong>${top}</strong>. These are winnable and would bring qualified, ready-to-buy traffic.`),
    )
    s2++
  }
  if (ownership) {
    H.push(heading(ownership.title))
    H.push(para(esc(ownership.body)))
    s2++
  }
  if (seo) {
    H.push(heading('Strong foundations, clear gaps.'))
    H.push(
      para(
        `Your SEO fundamentals score <strong>${seo.overallScore}/10</strong>. The clearest gaps: ${esc(weakestCategories(seo.categoryScores, 3).join(', '))}. Consistent and fixable.`,
      ),
    )
    s2++
  }
  if (cro) {
    const gaps = weakestCategories(cro.categoryScores, 2)
    H.push(heading('Conversion has room too.'))
    H.push(
      para(
        `Your site scored <strong>${cro.overallScore}/10</strong> on conversion. ${gaps.length ? `${esc(capitalize(gaps.join(' and ')))} scored lowest. ` : ''}Adding proof, case studies and FAQs lifts both rankings and the rate at which visitors enquire.`,
      ),
    )
    s2++
  }
  H.push(
    para(
      `<strong>Bottom line:</strong> the demand exists, you're already relevant, and you're leaving it on the table. This is optimisation and ongoing content improvement, not a rebuild.`,
    ),
  )
  H.push(
    para(
      `Before we propose a monthly figure, it would help to know roughly the average value of a qualified lead to ${esc(brand)}, so we can frame the investment around the return it's likely to generate.`,
    ),
  )

  const htmlBody = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;color:#1e293b">${H.join('')}</div>`

  return { subject, plainBody, htmlBody }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type RankRow = { keyword: string; rank: string; impressions: number; volume: number | null }

/**
 * Blend live SERP rank + GSC impressions + search volume into one table, like
 * the old email's table 2.
 *  - Live rank is authoritative for position (incl. "Not ranking").
 *  - GSC striking-distance supplies real impressions per query.
 *  - Volume is ONLY taken from the live-rankings `searchVolume` (a real
 *    keyword-planner figure). We deliberately do NOT guess volume from demand
 *    category totals — that produced misleading numbers — so GSC-only rows show
 *    "—" rather than a wrong value.
 */
function buildRankTable(report: SeoProposalEmailReport): RankRow[] {
  const sp = report.searchPerformance
  const live = report.liveRankings
  const rows: RankRow[] = []
  const seen = new Set<string>()

  // Real per-keyword volume, keyed by keyword (from the live SERP/volume check).
  const volByKeyword = new Map<string, number>()
  for (const r of live?.rankings ?? []) {
    if (typeof r.searchVolume === 'number' && r.searchVolume > 0) {
      volByKeyword.set(r.keyword.toLowerCase(), r.searchVolume)
    }
  }

  // Prefer live rankings (explicit position + volume).
  for (const r of live?.rankings ?? []) {
    const key = r.keyword.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const gsc = sp?.strikingDistanceQueries.find((q) => q.query.toLowerCase() === key)
    rows.push({
      keyword: r.keyword,
      rank: r.position != null ? String(r.position) : 'Not ranking',
      impressions: gsc?.impressions ?? 0,
      volume: typeof r.searchVolume === 'number' && r.searchVolume > 0 ? r.searchVolume : null,
    })
  }
  // Fill with striking-distance GSC terms not already covered (volume only if
  // we have a real figure for that exact keyword).
  for (const q of sp?.strikingDistanceQueries ?? []) {
    const key = q.query.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      keyword: q.query,
      rank: String(Math.round(q.position)),
      impressions: q.impressions,
      volume: volByKeyword.get(key) ?? null,
    })
  }
  // Sort by impressions desc (the clearest, fastest wins first).
  return rows.sort((a, b) => b.impressions - a.impressions)
}

function ownershipOpportunity(
  report: SeoProposalEmailReport,
): { title: string; body: string } | null {
  // Prefer a topic the site already leads.
  const strong = report.topicAuthority?.strongClusters?.[0]
  if (strong) {
    return {
      title: `${strong.name} is a real ownership opportunity.`,
      body: `You already have authority here (${strong.reason}). Becoming the clear #1 nationally positions you as the go-to name: high-value, and exactly the kind of authority that drives premium leads.`,
    }
  }
  // Otherwise a near-top striking-distance term (pos 4–5).
  const nearTop = report.searchPerformance?.strikingDistanceQueries?.find((q) => q.position <= 5)
  if (nearTop) {
    return {
      title: `${nearTop.query} is a real ownership opportunity.`,
      body: `You already rank near the top for "${nearTop.query}". Pushing to #1 makes you the default choice for a high-intent term.`,
    }
  }
  return null
}

function htmlTable(headers: string[], rows: string[][]): string {
  const th = headers
    .map(
      (h, i) =>
        `<th style="text-align:${i === 0 ? 'left' : 'right'};padding:8px 14px;border-bottom:2px solid #cbd5e1;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:#64748b">${esc(h)}</th>`,
    )
    .join('')
  const body = rows
    .map(
      (r, ri) =>
        `<tr style="background:${ri % 2 ? '#f8fafc' : '#ffffff'}">${r
          .map(
            (c, i) =>
              `<td style="text-align:${i === 0 ? 'left' : 'right'};padding:8px 14px;border-bottom:1px solid #eef2f7;font-size:14px;color:#1e293b${i === 0 ? ';font-weight:500' : ''}">${esc(c)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')
  return `<table style="width:100%;border-collapse:collapse;margin:6px 0 16px"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`
}
