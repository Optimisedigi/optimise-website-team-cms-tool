'use client'

/**
 * SEO Audit Proposal — full 1920×1080 deck.
 *
 * Byte-faithful to the client-proposal v2 deck: same `.proposal-v2` scope,
 * `report-v2.css`, DeckStage (1920×1080 scaled canvas), RocketScroll (animated
 * rocket between slides), StarfieldRunner (random stars on dark slides), and
 * the shared SeoHealthSlide / CroHealthSlide / ClosingSlide components.
 *
 * Data comes from a stored Growth Tools SeoProposalReport (record.report).
 */
import Image from 'next/image'
import { useState, type ReactElement, type ReactNode } from 'react'

import RocketScroll from '@/components/RocketScroll'
import { DeckStage } from '@/components/v2/DeckStage'
import { StarfieldRunner } from '@/components/v2/StarfieldRunner'
import { DownloadPdfButton } from '@/components/v2/DownloadPdfButton'
import { DeckPrintStyles } from '@/components/v2/DeckPrintStyles'
import { SeoHealthSlide } from '@/components/v2/SeoHealthSlide'
import { CroHealthSlide } from '@/components/v2/CroHealthSlide'
import { ClosingSlide } from '@/components/v2/ClosingSlide'

// ── Report types (loose — a degraded report still renders) ─────────────────
type QueryRow = { query: string; clicks: number; impressions: number; ctr: number; position: number }

export type SeoProposalReport = {
  meta?: { websiteUrl?: string; businessType?: string; location?: string; generatedAt?: string }
  searchPerformance?: {
    totalClicks: number; totalImpressions: number; averageCtr: number; averagePosition: number
    brandClicks: number; nonBrandClicks: number; brandDependencyPct: number
    brandImpressions: number; nonBrandImpressions: number; nonBrandImpressionSharePct: number
    topNonBrandQueries: QueryRow[]; strikingDistanceQueries: QueryRow[]; buriedQueries: QueryRow[]
    topPages: { url: string; clicks: number; impressions: number; ctr: number; position: number }[]
    trend: { firstHalfClicks: number; secondHalfClicks: number; clicksChangePct: number; direction: string }
  } | null
  gscTechnical?: {
    indexRate: number; indexed: number; notIndexed: number; errors: number
    sitemapHealth: number; crawlHealth: number; canonicalHealth: number; overallScore: number
    topExclusionReasons: { reason: string; count: number }[]
  } | null
  demandLandscape?: {
    totalKeywords: number; totalMonthlyVolume: number
    categories: { name: string; keywordCount: number; totalVolume: number }[]
  } | null
  liveRankings?: {
    keywordsChecked: number; page1Count: number
    rankings: { keyword: string; position: number | null; searchVolume: number; opportunity: string }[]
  } | null
  seoAudit?: { overallScore: number; categoryScores: Record<string, number>; topRecommendations: { title: string; impact: string }[] } | null
  croAudit?: { overallScore: number; categoryScores: Record<string, number> } | null
  serviceCoverage?: {
    offeredServices: string[]; coveredServices: string[]
    missingServicePages: { service: string; evidence: string }[]
    multiServicePagesToSplit: { url: string; services: string[] }[]
  } | null
  locationTargeting?: {
    isMultiLocation: boolean; confidence: string; detectedLocations: string[]; hasLocationPages: boolean
    locationOpportunities: { location: string; service: string; gscImpressions: number }[]
  } | null
  topicAuthority?: {
    runId: number | null
    clusters: { name: string; pages: string[]; isBlogCluster: boolean; memberCount: number }[]
    strongClusters: { name: string; memberCount: number; avgPageRankBps: number; reason: string }[]
    underlinkedClusters: { name: string; memberCount: number; reason: string }[]
    linkSuggestions: { sourceUrl: string; targetUrl: string; anchorText: string; confidenceScore: number; clusterName: string | null }[]
  } | null
  synthesis?: {
    verdict: string
    narrative?: string
    opportunityTiers: { quickWins: QueryRow[]; growth: QueryRow[]; foundational: QueryRow[] }
    trafficUpside: {
      conservativeAdditionalClicks: number; optimisticAdditionalClicks: number
      queries: { query: string; currentPosition: number; targetPosition: number; additionalMonthlyClicks: number }[]
    }
    roi: {
      assumptions: { conversionRate: number; averageOrderValue: number | null; costPerLead: number | null }
      conservative: RoiBand
      optimistic: RoiBand
      note: string
    } | null
  }
  sectionStatus?: Record<string, string>
}

type RoiBand = {
  additionalMonthlyClicks: number; additionalMonthlyLeads: number
  additionalMonthlyRevenue: number | null; equivalentPaidLeadCost: number | null; additionalAnnualRevenue: number | null
}

// ── Formatters ─────────────────────────────────────────────────────────────
const fmtNum = (x: number | null | undefined): string =>
  x == null ? '—' : new Intl.NumberFormat('en-AU').format(Math.round(x))
const fmtMoney = (x: number | null | undefined): string =>
  x == null ? '—' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(x)
const fmtPct = (x: number | null | undefined, d = 1): string =>
  x == null ? '—' : `${(x * 100).toFixed(d)}%`

// ── Section divider (dark, starfield) ──────────────────────────────────────
function SectionDivider({ num, chapter, name, sub, sfId }: { num: string; chapter: string; name: string; sub: string; sfId: string }): ReactElement {
  return (
    <section className="slide section-divider" data-label={`${num} ${name}`}>
      <div className="starfield" id={sfId} />
      <div className="num">{num}</div>
      <div className="meta">
        <div className="label">{chapter}</div>
        <div className="name">{name}</div>
        <div className="sub">{sub}</div>
      </div>
    </section>
  )
}

// ── Content slide shell (white) ────────────────────────────────────────────
function ContentSlide({ label, eyebrow, title, meta, children }: { label: string; eyebrow: string; title: string; meta?: string; children: ReactNode }): ReactElement {
  return (
    <section className="slide" data-label={label}>
      <div className="brand-tag"><span className="dot" /> {eyebrow}</div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">{eyebrow}</div>
          <h1 className="h-title">{title}</h1>
        </div>
        {meta ? <div className="h-meta">{meta}</div> : null}
      </div>
      {children}
      <div className="slide-foot" />
    </section>
  )
}

function StatTile({ label, value, desc, tone }: { label: string; value: string; desc?: string; tone?: 'green' | 'purple' }): ReactElement {
  return (
    <div className="stat-tile">
      <div className="lbl">{label}</div>
      <div className={`val${tone ? ' ' + tone : ''}`}>{value}</div>
      {desc ? <div className="desc">{desc}</div> : null}
    </div>
  )
}

const DEFAULT_CONV = 0.02

/**
 * The opportunity / ROI "money" slide. AOV and conversion rate are inline-
 * editable (session-only, like the proposal deck's ReturnModelling slide): the
 * revenue band recalculates live from the editable values and does not persist.
 */
function OpportunitySlide({
  conservativeClicks,
  optimisticClicks,
  initialAov,
  initialConversionRate,
}: {
  conservativeClicks: number
  optimisticClicks: number
  initialAov: number | null
  initialConversionRate: number
}): ReactElement {
  // AOV stored as a plain number ($), conversion rate stored as a fraction (0–1).
  const [aov, setAov] = useState<number | null>(initialAov)
  const [convPct, setConvPct] = useState<number>(
    Math.round((initialConversionRate || DEFAULT_CONV) * 1000) / 10,
  )
  const rate = convPct > 0 ? convPct / 100 : DEFAULT_CONV

  const band = (clicks: number) => {
    const leads = clicks * rate
    const revenue = aov != null && aov > 0 ? leads * aov : null
    return { leads, revenue, annual: revenue != null ? revenue * 12 : null }
  }
  const cons = band(conservativeClicks)
  const opt = band(optimisticClicks)

  return (
    <section className="slide dark" data-label="13 The Opportunity">
      <div className="starfield" id="sf-opportunity" />
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow" style={{ color: 'rgba(255,255,255,0.5)' }}>07 · Mission Control</div>
          <h1 className="h-title" style={{ color: '#fff' }}>The opportunity</h1>
        </div>
        <div className="h-meta" style={{ color: 'rgba(255,255,255,0.45)' }}>Striking-distance upside</div>
      </div>

      {/* Editable assumptions */}
      <div className="opp-inputs">
        <label>
          Average order value
          <span className="opp-input-wrap">$
            <input
              type="number" min={0} step={50}
              value={aov ?? ''}
              placeholder="—"
              onChange={(e) => setAov(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
            />
          </span>
        </label>
        <label>
          Conversion rate
          <span className="opp-input-wrap">
            <input
              type="number" min={0} max={100} step={0.1}
              value={convPct}
              onChange={(e) => setConvPct(Math.max(0, Math.min(100, Number(e.target.value))))}
            />%
          </span>
        </label>
      </div>

      <div className="opp-band">
        <div className="opp-col">
          <div className="opp-label">Conservative</div>
          <div className="opp-clicks">+{fmtNum(conservativeClicks)} clicks/mo</div>
          <div className="opp-line">{fmtNum(cons.leads)} leads/mo</div>
          <div className="opp-rev">{cons.revenue != null ? `${fmtMoney(cons.revenue)}/mo` : 'Set AOV'}</div>
          <div className="opp-line">{cons.annual != null ? `${fmtMoney(cons.annual)}/yr` : ''}</div>
        </div>
        <div className="opp-col opp-col-opt">
          <div className="opp-label">Optimistic</div>
          <div className="opp-clicks">+{fmtNum(optimisticClicks)} clicks/mo</div>
          <div className="opp-line">{fmtNum(opt.leads)} leads/mo</div>
          <div className="opp-rev">{opt.revenue != null ? `${fmtMoney(opt.revenue)}/mo` : 'Set AOV'}</div>
          <div className="opp-line">{opt.annual != null ? `${fmtMoney(opt.annual)}/yr` : ''}</div>
        </div>
      </div>
      <p className="opp-note">
        Edit AOV and conversion rate above to model the band live. Conservative targets position 3, optimistic position 2, and both apply a 50% capture rate (we won&rsquo;t win every term at once). Based on your current Search Console impressions and a standard organic CTR curve. Directional, not a guarantee.
      </p>
      <div className="slide-foot" />
    </section>
  )
}

// ── Deck ────────────────────────────────────────────────────────────────────
export function SeoProposalDeck({
  businessName,
  websiteUrl,
  dateLabel,
  presentedBy,
  report,
}: {
  businessName: string
  websiteUrl: string | null
  dateLabel: string
  presentedBy?: string | null
  report: SeoProposalReport
}): ReactElement {
  const sp = report.searchPerformance
  const tech = report.gscTechnical
  const demand = report.demandLandscape
  const live = report.liveRankings
  const svc = report.serviceCoverage
  const loc = report.locationTargeting
  const topic = report.topicAuthority
  const syn = report.synthesis
  const roi = syn?.roi ?? null

  return (
    <RocketScroll>
      <div className="proposal-v2">
        <StarfieldRunner />
        <DownloadPdfButton />
        <DeckPrintStyles />

        <DeckStage>
          {/* ── 01 · Cover ── */}
          <section className="slide dark cover" data-label="01 Cover">
            <div className="starfield" aria-hidden="true" />
            <div className="orbit-deco" style={{ width: 1400, height: 1400, right: -500, top: -400 }} />
            <div className="orbit-deco" style={{ width: 900, height: 900, right: -200, top: -100, borderColor: 'rgba(77,148,255,0.1)' }} />

            <div className="top">
              <div className="brand-mark">
                <span className="dot" />
                <Image src="/optimise-digital-logo-white.webp" alt="Optimise Digital" width={182} height={39} priority style={{ height: 39, width: 'auto' }} />
              </div>
            </div>

            <div className="center">
              <div className="eyebrow-line">
                <span className="pill" style={{ color: '#0084ff', borderColor: '#0084ff' }}>SEO Audit Proposal</span>
                <span className="meta-tag" style={{ color: 'rgba(255,255,255,0.45)' }}>Mission Brief · v1.0</span>
                <span className="meta-tag" style={{ color: 'rgba(255,255,255,0.45)' }}>{dateLabel}</span>
              </div>
              <div className="h1" style={{ fontSize: 124 }}>
                Building the<br />spaceship for<br />
                <em style={{ color: '#0084ff' }}>{businessName}.</em>
              </div>
              <div className="deck-for" style={{ fontSize: 35 }}>
                A full SEO, search-performance, demand &amp; opportunity assessment.
              </div>
            </div>
            <div />
          </section>

          {/* ── 02 · Mission Brief (verdict) ── */}
          <SectionDivider num="01" chapter="Chapter One" name="The Verdict" sfId="sf-verdict"
            sub={syn?.verdict ?? 'Run the assessment to populate the verdict.'} />

          {/* ── Search performance (now also carries the "what we found" narrative) ── */}
          {sp ? (
            <ContentSlide label="03 Search Performance" eyebrow="02 · Search Performance" title="How they show up in search today" meta="Google Search Console · 16 months">
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <StatTile label="Clicks (16mo)" value={fmtNum(sp.totalClicks)} />
                <StatTile label="Impressions" value={fmtNum(sp.totalImpressions)} />
                <StatTile label="Avg CTR" value={fmtPct(sp.averageCtr, 2)} />
                <StatTile
                  label="Non-brand demand"
                  value={`${sp.nonBrandImpressionSharePct}%`}
                  tone={sp.nonBrandImpressionSharePct >= 60 ? 'purple' : undefined}
                  desc={`of impressions are non-brand · but only ${100 - sp.brandDependencyPct}% of clicks`}
                />
                <StatTile
                  label="16-month trend"
                  value={`${sp.trend.clicksChangePct > 0 ? '+' : ''}${sp.trend.clicksChangePct}%`}
                  tone={sp.trend.direction === 'up' ? 'green' : undefined}
                  desc={`traffic trending ${sp.trend.direction}`}
                />
                <StatTile label="Avg position" value={sp.averagePosition.toFixed(1)} />
              </div>
              {syn?.narrative ? (
                <p className="small" style={{ fontSize: 24, lineHeight: 1.5, maxWidth: 1500, marginTop: 36 }}>
                  {syn.narrative}
                </p>
              ) : null}
            </ContentSlide>
          ) : null}

          {/* ── Quick wins (striking distance) ── */}
          {sp && sp.strikingDistanceQueries.length > 0 ? (
            <ContentSlide label="05 Quick Wins" eyebrow="02 · Quick Wins" title="Striking distance: ready to convert" meta={`${sp.strikingDistanceQueries.length} non-brand queries · positions 4–20`}>
              <table className="deck-table">
                <thead><tr><th>Query</th><th>Position</th><th>CTR</th><th>Impressions</th><th>Clicks</th></tr></thead>
                <tbody>
                  {sp.strikingDistanceQueries.slice(0, 12).map((r, i) => (
                    <tr key={i}>
                      <td>{r.query}</td>
                      <td className="mono">{r.position}</td>
                      <td className="mono">{fmtPct(r.ctr, 1)}</td>
                      <td className="mono">{fmtNum(r.impressions)}</td>
                      <td className="mono">{fmtNum(r.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small" style={{ marginTop: 18 }}>Positions 4–20 with real impressions. Excludes brand terms and pages already ranking 1–3. Impressions across the 16-month window.</p>
            </ContentSlide>
          ) : null}

          {/* ── SEO + CRO health (reused proposal slides, fed from report) ──
              CroHealthSlide expects per-category scores as top-level *Score keys
              (navigationScore, ctaScore, …). Our report nests them under
              categoryScores with shorter keys, so we map to the slide's shape so
              the bars render and colour-code correctly. */}
          {report.seoAudit ? <SeoHealthSlide seoAudit={report.seoAudit} /> : null}
          {report.croAudit ? (
            <CroHealthSlide
              croAudit={{
                overallScore: report.croAudit.overallScore,
                navigationScore: report.croAudit.categoryScores.navigation ?? null,
                ctaScore: report.croAudit.categoryScores.cta ?? null,
                firstImpressionScore: report.croAudit.categoryScores.firstImpression ?? null,
                trustScore: report.croAudit.categoryScores.trustSocialProof ?? null,
                leadCaptureScore: report.croAudit.categoryScores.leadCapture ?? null,
                contentReadabilityScore: report.croAudit.categoryScores.contentReadability ?? null,
              } as unknown as Parameters<typeof CroHealthSlide>[0]['croAudit']}
              keyFindingsOverride={null}
            />
          ) : null}

          {/* ── GSC technical ── */}
          {tech ? (
            <ContentSlide label="08 Technical" eyebrow="03 · Diagnosing the Ship" title="Indexing & technical health" meta="Search Console">
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <StatTile label="Index rate" value={`${tech.indexRate}%`} tone={tech.indexRate >= 90 ? 'green' : undefined} desc={`${fmtNum(tech.indexed)} indexed · ${fmtNum(tech.notIndexed)} not`} />
                <StatTile label="Sitemap health" value={`${tech.sitemapHealth}/10`} />
                <StatTile label="Crawl health" value={`${tech.crawlHealth}/10`} />
                <StatTile label="Canonical" value={`${tech.canonicalHealth}/10`} />
              </div>
              {tech.topExclusionReasons.length > 0 ? (
                <>
                  <p className="small" style={{ marginTop: 28, fontWeight: 600, color: 'var(--ink)' }}>Top reasons pages aren&rsquo;t indexed</p>
                  <ul className="deck-list">
                    {tech.topExclusionReasons.slice(0, 5).map((e, i) => (
                      <li key={i}>{e.reason} <span className="mono">({e.count})</span></li>
                    ))}
                  </ul>
                </>
              ) : null}
            </ContentSlide>
          ) : null}

          {/* ── Demand landscape ── */}
          {(demand && demand.categories.length > 0) || (live && live.rankings.length > 0) ? (
            <ContentSlide
              label="09 Demand & Rankings"
              eyebrow="04 · The Market"
              title="Market demand & where they rank today"
              meta={demand ? `${fmtNum(demand.totalMonthlyVolume)} searches / mo · ${live ? `${live.page1Count}/${live.keywordsChecked} on page 1` : ''}` : undefined}
            >
              <div className="cards" style={{ gridTemplateColumns: '1fr 1fr', gap: 40 }}>
                <div>
                  <div className="h-eyebrow" style={{ marginBottom: 12 }}>Demand by service category</div>
                  {demand && demand.categories.length > 0 ? (
                    <table className="deck-table">
                      <thead><tr><th>Service category</th><th>Keywords</th><th>Volume</th></tr></thead>
                      <tbody>
                        {demand.categories.slice(0, 8).map((c, i) => (
                          <tr key={i}><td>{c.name}</td><td className="mono">{fmtNum(c.keywordCount)}</td><td className="mono">{fmtNum(c.totalVolume)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="small">Demand data unavailable.</p>}
                </div>
                <div>
                  <div className="h-eyebrow" style={{ marginBottom: 12 }}>Where they rank today</div>
                  {live && live.rankings.length > 0 ? (
                    <table className="deck-table">
                      <thead><tr><th>Keyword</th><th>Rank</th><th>Volume</th></tr></thead>
                      <tbody>
                        {live.rankings.slice(0, 8).map((r, i) => (
                          <tr key={i}><td>{r.keyword}</td><td className="mono">{r.position ?? 'Not ranking'}</td><td className="mono">{fmtNum(r.searchVolume)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p className="small">Live ranking check unavailable.</p>}
                </div>
              </div>
            </ContentSlide>
          ) : null}

          {/* ── Service coverage ── */}
          {svc && (svc.missingServicePages.length > 0 || svc.multiServicePagesToSplit.length > 0) ? (
            <ContentSlide label="10 Service Coverage" eyebrow="05 · Building the Ship" title="Service coverage gaps" meta="On-page + demand + sitemap">
              <div className="cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="card">
                  <div className="h">Missing service pages</div>
                  <div className="b">
                    {svc.missingServicePages.length > 0 ? (
                      <ul className="deck-list">
                        {svc.missingServicePages.slice(0, 8).map((m, i) => (<li key={i}><strong>{m.service}</strong>: {m.evidence}</li>))}
                      </ul>
                    ) : <span className="small">No gaps detected.</span>}
                  </div>
                </div>
                <div className="card">
                  <div className="h">Pages to split</div>
                  <div className="b">
                    {svc.multiServicePagesToSplit.length > 0 ? (
                      <ul className="deck-list">
                        {svc.multiServicePagesToSplit.slice(0, 8).map((p, i) => (<li key={i}><span className="mono">{p.url}</span>: {p.services.join(', ')}</li>))}
                      </ul>
                    ) : <span className="small">No multi-service pages found.</span>}
                  </div>
                </div>
              </div>
            </ContentSlide>
          ) : null}

          {/* ── Location targeting ── */}
          {loc && loc.confidence !== 'none' ? (
            <ContentSlide label="11 Location" eyebrow="05 · Building the Ship" title="Location opportunities" meta={loc.isMultiLocation ? 'Multi-location business' : 'Possible multi-location'}>
              <p className="small" style={{ marginBottom: 18 }}>Detected: {loc.detectedLocations.join(', ') || '—'}</p>
              {loc.locationOpportunities.length > 0 ? (
                <table className="deck-table">
                  <thead><tr><th>Location</th><th>Service intent</th><th>Impressions</th></tr></thead>
                  <tbody>
                    {loc.locationOpportunities.slice(0, 8).map((o, i) => (
                      <tr key={i}><td>{o.location}</td><td>{o.service}</td><td className="mono">{fmtNum(o.gscImpressions)}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="small">No location-page gaps with current demand.</p>}
            </ContentSlide>
          ) : null}

          {/* ── Topic authority (strengths first, then recommendations) ── */}
          {topic && (topic.strongClusters.length > 0 || topic.clusters.some((c) => c.isBlogCluster) || topic.linkSuggestions.length > 0) ? (
            <ContentSlide label="12 Topic Authority" eyebrow="06 · Compounding Growth" title="Topic authority & internal linking" meta="Content clusters">
              {topic.strongClusters.length > 0 ? (
                <div style={{ marginBottom: 28 }}>
                  <div className="h-eyebrow" style={{ marginBottom: 10 }}>Topics you already have authority on</div>
                  <ul className="deck-list">
                    {topic.strongClusters.slice(0, 6).map((c, i) => (<li key={i}><strong>{c.name}</strong>: {c.reason}</li>))}
                  </ul>
                </div>
              ) : null}
              <div className="cards" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="card">
                  <div className="h">Clusters to strengthen</div>
                  <div className="b">
                    <ul className="deck-list">
                      {topic.clusters.filter((c) => c.isBlogCluster).slice(0, 6).map((c, i) => (<li key={i}><strong>{c.name}</strong>: {c.memberCount} pages</li>))}
                      {topic.clusters.filter((c) => c.isBlogCluster).length === 0 ? <li className="small">No multi-post clusters yet.</li> : null}
                    </ul>
                  </div>
                </div>
                <div className="card">
                  <div className="h">Internal-link fixes ({topic.linkSuggestions.length})</div>
                  <div className="b">
                    <ul className="deck-list">
                      {topic.linkSuggestions.slice(0, 8).map((s, i) => (<li key={i}><span className="mono">{s.anchorText}</span> ({s.confidenceScore}%)</li>))}
                      {topic.linkSuggestions.length === 0 ? <li className="small">No suggestions.</li> : null}
                    </ul>
                  </div>
                </div>
              </div>
            </ContentSlide>
          ) : null}

          {/* ── The Opportunity (traffic upside + ROI, editable AOV/conv) ── */}
          {syn?.trafficUpside ? (
            <OpportunitySlide
              conservativeClicks={syn.trafficUpside.conservativeAdditionalClicks}
              optimisticClicks={syn.trafficUpside.optimisticAdditionalClicks}
              initialAov={roi?.assumptions.averageOrderValue ?? null}
              initialConversionRate={roi?.assumptions.conversionRate ?? 0.02}
            />
          ) : null}

          {/* ── Closing (reused) ── */}
          <ClosingSlide businessName={businessName} websiteUrl={websiteUrl} presentedBy={presentedBy} />
        </DeckStage>
      </div>
    </RocketScroll>
  )
}
