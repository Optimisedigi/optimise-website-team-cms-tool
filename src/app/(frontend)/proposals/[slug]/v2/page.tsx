/**
 * Proposal report — V2 design (NEW deck from Claude artifact).
 *
 * Built one slide at a time, alongside the existing /proposals/[slug] route
 * so the live deck is never at risk while we iterate.
 *
 * Currently rendered slides:
 *   - NEW-01 Cover
 *
 * The animated rocket (from <RocketScroll>) overlays every slide and persists
 * across the whole deck, matching the OLD deck's behaviour.
 */

import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import config from '@/payload.config'
import RocketScroll from '@/components/RocketScroll'
import AuditPasswordGate from '@/components/AuditPasswordGate'
import { ClosingSlide } from '@/components/v2/ClosingSlide'
import { CommercialModelSlide } from '@/components/v2/CommercialModelSlide'
import { CroHealthSlide } from '@/components/v2/CroHealthSlide'
import { SeoHealthSlide } from '@/components/v2/SeoHealthSlide'
import {
  applyOverridesToCompetitorAnalysis,
  normaliseDomain,
} from '@/components/v2/competitorAdOverrides'
import { CompetitorAnalysisSlide } from '@/components/v2/CompetitorAnalysisSlide'
import { DeckPrintStyles } from '@/components/v2/DeckPrintStyles'
import { DeckStage } from '@/components/v2/DeckStage'
import { DownloadPdfButton } from '@/components/v2/DownloadPdfButton'
import { KeywordLandscapeSlides } from '@/components/v2/KeywordLandscapeSlide'
import { MissionBriefSlide } from '@/components/v2/MissionBriefSlide'
import { MissionPrioritiesSlide } from '@/components/v2/MissionPrioritiesSlide'
import { OrganicPropulsionSlide } from '@/components/v2/OrganicPropulsionSlide'
import { PaidBurnSlide } from '@/components/v2/PaidBurnSlide'
import { ReturnModellingSlide } from '@/components/v2/ReturnModellingSlide'
import { RoadmapSlide } from '@/components/v2/RoadmapSlide'
import { StarfieldRunner } from '@/components/v2/StarfieldRunner'
import './report-v2.css'

// Path to the static HTML chunk containing slides 02-27, lifted verbatim from
// the Claude artifact so the visual is byte-identical. Slide 01 (Cover) is
// rendered as JSX above so we can wire in dynamic data (logo, businessName,
// date). As we customize each remaining slide we'll move it from this static
// chunk into JSX one at a time.
const SLIDES_STATIC_PATH = path.join(
  process.cwd(),
  'src/app/(frontend)/proposals/[slug]/v2/slides-static.html',
)

// Fonts — the NEW design relies on Space Grotesk for headings and JetBrains
// Mono for meta tags. Loaded via next/font/google so we don't have to embed
// 100KB of @font-face data in the stylesheet.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function findProposalBySlug(slug: string) {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })

  const result = await payload.find({
    collection: 'client-proposals',
    where: { slug: { equals: slug } },
    depth: 2,
    limit: 1,
    overrideAccess: true,
  })

  return result.docs[0] ?? null
}

// Pull every content-research linked to this proposal. Used by the dynamic
// Organic Propulsion slide to surface real customer questions.
async function findContentResearches(proposalId: number) {
  const payloadConfig = await config
  const payload = await getPayload({ config: payloadConfig })
  const result = await payload.find({
    collection: 'content-researches',
    where: { proposal: { equals: proposalId } },
    sort: '-createdAt',
    limit: 20,
    overrideAccess: true,
  })
  return result.docs
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const proposal = await findProposalBySlug(slug)
  if (!proposal) return { title: 'Report Not Found' }
  return {
    title: `Pre-launch Assessment | ${proposal.businessName}`,
    description: `Pre-launch SEO, CRO, keyword, digital ads & competitor assessment for ${proposal.businessName}`,
    robots: { index: false, follow: false },
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProposalReportV2Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const proposal = await findProposalBySlug(slug)

  if (!proposal) notFound()

  // PIN gate — same field the existing route uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proposalPin = (proposal as any).proposalPin as string | null

  // Date label for the cover top-right (e.g. "MAY 2026").
  // Pulled from proposal.createdAt as requested.
  const dateLabel = formatMonthYear(proposal.createdAt)

  // Read the static slide chunk (slides 02-27) once per request. The chunk
  // is split on SLOT:* marker pairs so we can render dynamic JSX slides in
  // between static chunks. Each dynamic slide owns one START/END marker pair.
  const staticSlidesHtml = await readFile(SLIDES_STATIC_PATH, 'utf8')

  /**
   * Split a single string on multiple marker pairs in document order.
   * Returns the chunks between markers. Example with two slot pairs:
   *   chunks[0] = everything before the first START
   *   chunks[1] = everything after the first END until the second START
   *   chunks[2] = everything after the last END
   */
  function splitOnSlots(
    src: string,
    pairs: Array<{ start: string; end: string }>,
  ): string[] {
    const chunks: string[] = []
    let cursor = 0
    for (const { start, end } of pairs) {
      const s = src.indexOf(start, cursor)
      const e = src.indexOf(end, s + start.length)
      if (s < 0 || e < 0) {
        chunks.push(src.slice(cursor))
        return chunks
      }
      chunks.push(src.slice(cursor, s))
      cursor = e + end.length
    }
    chunks.push(src.slice(cursor))
    return chunks
  }

  const [
    staticBefore,
    staticBeforeMissionBriefDivider,
    staticMid1,
    staticMid2,
    staticBeforeSeo,
    staticBetweenSeoAndCro,
    staticAfterCro,
    staticMid4,
    staticMid5,
    staticMid6,
    staticMid7,
    staticMid8,
    staticMid9,
    staticAfter,
  ] = splitOnSlots(staticSlidesHtml, [
    // Slots MUST appear here in the same order as they appear in
    // slides-static.html — splitOnSlots walks forward and won't backtrack.
    {
      start: '<!-- SLOT:MISSION_BRIEF_DIVIDER_START -->',
      end: '<!-- SLOT:MISSION_BRIEF_DIVIDER_END -->',
    },
    {
      start: '<!-- SLOT:MISSION_BRIEF_START -->',
      end: '<!-- SLOT:MISSION_BRIEF_END -->',
    },
    {
      start: '<!-- SLOT:COMPETITOR_ANALYSIS_START -->',
      end: '<!-- SLOT:COMPETITOR_ANALYSIS_END -->',
    },
    {
      start: '<!-- SLOT:KEYWORD_LANDSCAPE_START -->',
      end: '<!-- SLOT:KEYWORD_LANDSCAPE_END -->',
    },
    {
      start: '<!-- SLOT:SEO_HEALTH_START -->',
      end: '<!-- SLOT:SEO_HEALTH_END -->',
    },
    {
      start: '<!-- SLOT:CRO_HEALTH_START -->',
      end: '<!-- SLOT:CRO_HEALTH_END -->',
    },
    {
      start: '<!-- SLOT:ORGANIC_PROPULSION_START -->',
      end: '<!-- SLOT:ORGANIC_PROPULSION_END -->',
    },
    {
      start: '<!-- SLOT:PAID_BURN_START -->',
      end: '<!-- SLOT:PAID_BURN_END -->',
    },
    {
      start: '<!-- SLOT:RETURN_MODELLING_START -->',
      end: '<!-- SLOT:RETURN_MODELLING_END -->',
    },
    {
      start: '<!-- SLOT:MISSION_PRIORITIES_START -->',
      end: '<!-- SLOT:MISSION_PRIORITIES_END -->',
    },
    {
      start: '<!-- SLOT:ROADMAP_START -->',
      end: '<!-- SLOT:ROADMAP_END -->',
    },
    {
      start: '<!-- SLOT:COMMERCIAL_MODEL_START -->',
      end: '<!-- SLOT:COMMERCIAL_MODEL_END -->',
    },
    {
      start: '<!-- SLOT:CLOSING_START -->',
      end: '<!-- SLOT:CLOSING_END -->',
    },
  ])

  // Resolve relationships used by the dynamic Mission Brief slide. They come
  // back as either populated objects (depth: 2 above) or null when missing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = proposal as any
  const seoAuditDoc = p.seoAudit && typeof p.seoAudit === 'object' ? p.seoAudit : null
  const croAuditDoc = p.croAudit && typeof p.croAudit === 'object' ? p.croAudit : null
  const rawKeywordSnapshotDoc =
    p.keywordSnapshot && typeof p.keywordSnapshot === 'object' ? p.keywordSnapshot : null
  const rawCompetitorAnalysisDoc =
    p.competitorAnalysis && typeof p.competitorAnalysis === 'object'
      ? p.competitorAnalysis
      : null

  // ----- CMS exclusions (Post-report-input tab) -----
  // Each field is stored as `json` so it can come back as either an array,
  // a JSON-encoded string, or null. Normalise to a plain string[] up front
  // and mirror the excluder components' tolerance for either shape.
  const excludedCompetitorDomains = normaliseStringList(p.excludedCompetitorDomains)
  const hiddenKeywordCategories = normaliseStringList(p.hiddenKeywordCategories)
  const excludedKeywords = normaliseStringList(p.excludedKeywords)
  const excludedContentQuestions = normaliseStringList(p.excludedContentQuestions)

  // Pre-compute lookup sets. Domains and keywords are case-insensitive; the
  // excluder UI stores domains pre-normalised (www stripped, lower-cased), so
  // we run them through `normaliseDomain` again to be defensive.
  const excludedDomainSet = new Set(
    excludedCompetitorDomains.map((d) => normaliseDomain(d)).filter(Boolean),
  )
  const hiddenCategorySet = new Set(hiddenKeywordCategories)
  const excludedKeywordSet = new Set(excludedKeywords.map((k) => k.toLowerCase()))
  const excludedQuestionSet = new Set(excludedContentQuestions)

  // Merge per-competitor manual ad overrides (set on the proposal's own
  // competitors[] rows) onto the audit doc. Lets the team flag a competitor
  // as running Google/Meta Ads last-minute when the SERP scraper missed them.
  // IMPORTANT: overrides must apply *before* exclusions so derived calcs
  // (e.g. Paid Burn ad counts) honour the manual flags on rows that survive.
  const overriddenCompetitorAnalysisDoc = applyOverridesToCompetitorAnalysis(
    rawCompetitorAnalysisDoc,
    p.competitors ?? null,
  )

  // Drop excluded competitor rows from the audit doc. `competitors[]` items
  // identify by `domain`; fall back to `websiteUrl` if domain is missing.
  const competitorAnalysisDoc =
    overriddenCompetitorAnalysisDoc && excludedDomainSet.size > 0
      ? {
          ...overriddenCompetitorAnalysisDoc,
          competitors: (overriddenCompetitorAnalysisDoc.competitors ?? []).filter(
            (c: { domain?: string | null; websiteUrl?: string | null }) => {
              const key =
                normaliseDomain(c.domain) || normaliseDomain(c.websiteUrl)
              return !key || !excludedDomainSet.has(key)
            },
          ),
        }
      : overriddenCompetitorAnalysisDoc

  // Same filter applied to manual proposal-side competitors so the Competitor
  // Analysis slide, PaidBurn and Return Modelling see a consistent set.
  const filteredProposalCompetitors =
    Array.isArray(p.competitors) && excludedDomainSet.size > 0
      ? (p.competitors as Array<{ websiteUrl?: string | null; name?: string | null }>).filter(
          (c) => {
            const key =
              normaliseDomain(c.websiteUrl) || normaliseDomain(c.name)
            return !key || !excludedDomainSet.has(key)
          },
        )
      : (p.competitors ?? null)

  // Drop hidden keyword categories before they reach Mission Brief, Keyword
  // Landscape, and Organic Propulsion.
  const filteredKeywordCategories =
    Array.isArray(p.keywordCategories) && hiddenCategorySet.size > 0
      ? (p.keywordCategories as Array<{ categoryName?: string | null }>).filter(
          (c) => !c.categoryName || !hiddenCategorySet.has(c.categoryName),
        )
      : (p.keywordCategories ?? null)

  // Drop excluded individual keywords from the snapshot so total-volume tiles,
  // Keyword Landscape and Return Modelling all reflect the exclusion.
  const keywordSnapshotDoc =
    rawKeywordSnapshotDoc &&
    Array.isArray(rawKeywordSnapshotDoc.keywords) &&
    excludedKeywordSet.size > 0
      ? {
          ...rawKeywordSnapshotDoc,
          keywords: (rawKeywordSnapshotDoc.keywords as Array<{ keyword?: string | null }>).filter(
            (k) =>
              !k.keyword || !excludedKeywordSet.has(k.keyword.toLowerCase()),
          ),
        }
      : rawKeywordSnapshotDoc

  // Numeric IDs from Payload; proposal.id is a number. The `clusters` column
  // is stored as JSON, so it comes back loosely typed — cast at the boundary
  // to the shape the Organic Propulsion slide expects.
  type ContentResearchForSlide = {
    keyword?: string | null
    clusters?: Array<{
      label?: string | null
      questions?: Array<{
        question?: string | null
        source?: string | null
        modifier?: string | null
        searchVolume?: number | null
      }> | null
    }> | null
  }
  const rawContentResearchDocs = await findContentResearches(proposal.id as number)
  const contentResearchDocsAll = rawContentResearchDocs as unknown as ContentResearchForSlide[]

  // Drop excluded content questions from every cluster on every research doc.
  // Empty clusters are kept — the slide already handles them gracefully and we
  // don't want to silently lose context when every question on a cluster is
  // hidden.
  const contentResearchDocs: ContentResearchForSlide[] =
    excludedQuestionSet.size > 0
      ? contentResearchDocsAll.map((doc) => ({
          ...doc,
          clusters: (doc.clusters ?? []).map((cluster) => ({
            ...cluster,
            questions: (cluster?.questions ?? []).filter(
              (q) => !q.question || !excludedQuestionSet.has(q.question),
            ),
          })),
        }))
      : contentResearchDocsAll

  const reportContent = (
    <RocketScroll>
      <div
        className={`proposal-v2 ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      >
        {/* Runs once on mount and seeds every .starfield element in the deck
            with random stars. Mirrors the artifact's inline <script>. */}
        <StarfieldRunner />
        <DownloadPdfButton />
        <DeckPrintStyles />

        <DeckStage>
        {/* =========================================================
            NEW-01 — COVER  (JSX, dynamic data wired in)
            ========================================================= */}
        <section className="slide dark cover" data-label="01 Cover">
          <div className="starfield" aria-hidden="true" />

          {/* Decorative orbit rings — pure CSS, behind everything. */}
          <div
            className="orbit-deco"
            style={{ width: 1400, height: 1400, right: -500, top: -400 }}
          />
          <div
            className="orbit-deco"
            style={{
              width: 900,
              height: 900,
              right: -200,
              top: -100,
              borderColor: 'rgba(77,148,255,0.1)',
            }}
          />

          <div className="top">
            <div className="brand-mark">
              <span className="dot" />
              <a
                href="https://optimisedigital.online?utm_source=direct&utm_medium=proposal-preso"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center' }}
                aria-label="Visit Optimise Digital"
              >
                <Image
                  src="/optimise-digital-logo-white.webp"
                  alt="Optimise Digital"
                  /* 30% smaller than original (260×56 → 182×39). */
                  width={182}
                  height={39}
                  priority
                  style={{ height: 39, width: 'auto' }}
                />
              </a>
            </div>
          </div>

          <div className="center">
            <div className="eyebrow-line">
              <span
                className="pill"
                style={{ color: '#0084ff', borderColor: '#0084ff' }}
              >
                Pre-launch Assessment
              </span>
              <span
                className="meta-tag"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                Mission Brief · v1.0
              </span>
              <span
                className="meta-tag"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                {dateLabel}
              </span>
            </div>

            <div className="h1" style={{ fontSize: 124 }}>
              Building the
              <br />
              spaceship for
              <br />
              <em style={{ color: '#0084ff' }}>{proposal.businessName}.</em>
            </div>

            <div className="deck-for" style={{ fontSize: 35 }}>
              A pre-launch digital SEO, CRO, keyword, digital ads &amp;
              competitor assessment.
            </div>
          </div>

          {/* Spacer so the cover uses the same flex-between layout as the design. */}
          <div />
        </section>

        {/* Slides 02-05 (before the Mission Brief divider). */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticBefore }}
        />

        {/* Chapter Two divider — dynamic so businessName is injected. */}
        <section className="slide section-divider" data-label="05 Section 02">
          <div className="starfield" id="sf-02" />
          <div className="num">02</div>
          <div className="meta">
            <div className="label">Chapter Two</div>
            <div className="name">Mission Brief</div>
            <div className="sub">
              Who {proposal.businessName} is, what the business is trying to
              do, and what the market around it looks like today.
            </div>
          </div>
        </section>

        {/* Gap between divider and Mission Brief — typically empty. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticBeforeMissionBriefDivider }}
        />

        {/* Slide 07 — Mission Brief (dynamic). */}
        <MissionBriefSlide
          businessName={proposal.businessName}
          websiteUrl={p.websiteUrl ?? null}
          businessType={p.businessType ?? null}
          conversionGoal={p.conversionGoal ?? null}
          businessGoals={p.businessGoals ?? null}
          seoAudit={seoAuditDoc}
          croAudit={croAuditDoc}
          keywordSnapshot={keywordSnapshotDoc}
          competitorAnalysis={competitorAnalysisDoc}
          keywordCategories={filteredKeywordCategories}
        />

        {/* Slide 08 (Section Divider 03) — static. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticMid1 }}
        />

        {/* Slide 09 — Competitor analysis (dynamic). */}
        <CompetitorAnalysisSlide
          proposalWebsiteUrl={p.websiteUrl ?? null}
          competitorAnalysis={competitorAnalysisDoc}
          proposalCompetitors={filteredProposalCompetitors}
        />

        {/* Static slides between competitor analysis and keyword landscape
           (empty by default — they sit back-to-back). */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticMid2 }}
        />

        {/* Slide 10 — Keyword landscape (dynamic, one or more slides depending
            on the number of keyword categories defined on the proposal). */}
        <KeywordLandscapeSlides
          keywordCategories={filteredKeywordCategories}
          keywordSnapshot={keywordSnapshotDoc}
          location={p.targetLocation ?? null}
        />

        {/* Building-the-Ship divider — static. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticBeforeSeo }}
        />

        {/* SEO Health score (dynamic). */}
        <SeoHealthSlide seoAudit={seoAuditDoc} />

        {/* Between SEO Health and CRO Health — typically empty. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticBetweenSeoAndCro }}
        />

        {/* CRO Health score (dynamic). */}
        <CroHealthSlide croAudit={croAuditDoc} />

        {/* Fueling-the-Ship divider — static. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticAfterCro }}
        />

        {/* Organic propulsion (dynamic). */}
        <OrganicPropulsionSlide
          contentResearches={contentResearchDocs}
          keywordCategories={filteredKeywordCategories}
          location={p.targetLocation ?? null}
        />

        {/* Sits back-to-back with Paid Burn — the slot gap is typically empty. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticMid4 }}
        />

        {/* Paid burn (dynamic). */}
        <PaidBurnSlide competitorAnalysis={competitorAnalysisDoc} />

        {/* Mission Control divider sits between Paid Burn and Return Modelling. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticMid5 }}
        />

        {/* Return modelling (dynamic, hidden when inputs are missing). */}
        <ReturnModellingSlide
          businessName={proposal.businessName}
          leadConversionRate={p.leadConversionRate ?? null}
          leadToSaleConversionRate={p.leadToSaleConversionRate ?? null}
          averageOrderValue={p.averageOrderValue ?? null}
          annualPurchaseFrequency={p.annualPurchaseFrequency ?? null}
          overrideMonthlyVisits={p.overrideMonthlyVisits ?? null}
          competitorAnalysis={competitorAnalysisDoc}
        />

        {/* Mission Priorities divider sits between Return Modelling and the
           Mission Priorities content slide. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticMid6 }}
        />

        {/* Mission priorities (dynamic, hidden when empty). */}
        <MissionPrioritiesSlide priorities={p.missionPriorities ?? null} />

        {/* Static between Mission Priorities and Roadmap (Flight Plan divider). */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticMid7 }}
        />

        {/* Roadmap (dynamic, hidden when empty). */}
        <RoadmapSlide
          cells={p.roadmapCells ?? null}
          meta={p.roadmapMeta ?? null}
          note={p.roadmapNote ?? null}
        />

        {/* Static between Roadmap and Commercial Model (Mission Resources divider). */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticMid8 }}
        />

        {/* Commercial model (dynamic, hidden when empty). */}
        <CommercialModelSlide
          phases={p.commercialPhases ?? null}
          meta={p.commercialMeta ?? null}
          note={p.commercialNote ?? null}
        />

        {/* Static between Commercial Model and Closing (transition strip). */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticMid9 }}
        />

        {/* Transition strip between Commercial (slide 26) and Closing (slide 27). */}
        <div
          className="v2-space-transition"
          aria-hidden="true"
          data-no-print="true"
        />

        {/* Closing (dynamic). */}
        <ClosingSlide
          businessName={proposal.businessName}
          websiteUrl={p.websiteUrl ?? null}
        />

        {/* Anything trailing the final SLOT marker. */}
        <div
          style={{ display: 'contents' }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: staticAfter }}
        />
        </DeckStage>
      </div>
    </RocketScroll>
  )

  if (proposalPin) {
    return (
      <AuditPasswordGate
        auditSlug={proposal.slug}
        businessName={proposal.businessName}
        featureLabel="Proposal"
      >
        {reportContent}
      </AuditPasswordGate>
    )
  }

  return reportContent
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a Payload `json` field into a string[]. The excluder components
 * write arrays directly via setValue(), but older proposals may still hold
 * the JSON-encoded form. Anything else (null, malformed JSON, non-string
 * entries) collapses to an empty list.
 */
function normaliseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string')
      }
    } catch {
      // fall through
    }
  }
  return []
}

function formatMonthYear(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return ''
  // e.g. "MAY 2026"
  return d
    .toLocaleString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase()
}
