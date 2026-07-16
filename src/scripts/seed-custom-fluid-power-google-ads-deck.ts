/**
 * Seed Custom Fluid Power's Google Ads audit into the exact 15-slide template.
 *
 * Score methodology (documented and reproducible): each of the 13 audit areas is
 * scored 0–10 from supplied evidence, then weighted by the methodology-card
 * importance values. The score is deliberately conservative
 * where the export cannot prove quality (measurement, search intent, history).
 * This initial integration uses the template's existing payload as the structural
 * baseline, replacing client/account data and evidence-backed rows only.
 *
 * Usage: npx tsx src/scripts/seed-custom-fluid-power-google-ads-deck.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getPayload } from 'payload'
import configPromise from '../payload.config'
import { googleAdsAudit15SlideSamplePayload } from '../lib/decks/templates/google-ads-audit-15-slide/payload'

const INPUT =
  process.env.CUSTOM_FLUID_POWER_AUDIT_JSON ??
  resolve(
    process.cwd(),
    '../client/website-optimise-digital/website-growth-tools/output/custom-fluid-power-google-ads-audit.json',
  )
const SLUG = 'custom-fluid-power'
const TEMPLATE = 'google-ads-audit-15-slide'
const money = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`
const scoreClass = (s: number) =>
  s >= 8
    ? ['text-green-500', 'bg-green-500']
    : s >= 5
      ? ['text-amber-500', 'bg-amber-500']
      : ['text-red-500', 'bg-red-500']
const chartColors = [
  'rgb(59,130,246)',
  'rgb(168,85,247)',
  'rgb(245,158,11)',
  'rgb(16,185,129)',
] as const

async function main() {
  const source = JSON.parse(readFileSync(INPUT, 'utf8'))
  const totals = source.totals
  const campaigns = source.campaigns ?? []
  const topTerms = source.searchTerms?.top100BySpend ?? []
  const chartRows = (source.monthlyPerformance ?? []).slice(-16)
  const chartGeometry = googleAdsAudit15SlideSamplePayload.nbTrendMonths
  const chartMax = Math.max(1, ...chartRows.map((r: any) => Number(r.spend) || 0))
  const nbTrendMonths = chartRows.map((r: any, index: number) => {
    const geometry = chartGeometry[index]
    const height = ((Number(r.spend) || 0) / chartMax) * 180
    return {
      ...geometry,
      label: String(r.month).slice(0, 7),
      total: money(Number(r.spend) || 0),
      totalY: Math.max(10, 210 - height - 12),
      segments: [
        { y: 210 - height, height },
        { y: 210, height: 0 },
        { y: 210, height: 0 },
        { y: 210, height: 0 },
      ],
    }
  })
  const irrelevantSpend = topTerms
    .filter((r: any) => r.relevance === 'likely irrelevant')
    .reduce((sum: number, r: any) => sum + (Number(r.spend) || 0), 0)
  const topIrrelevant = topTerms.filter((r: any) => r.relevance === 'likely irrelevant')
  const budgetLimited = campaigns.filter((c: any) => c.budgetLimitation === 'budget-limited')
  const duplicateGroups = source.duplicateTrackingReview?.length ?? 0
  const clamp = (value: number) => Math.max(0, Math.min(10, Math.round(value)))
  const evidenceScores = [
    5,
    clamp(4 + Math.min(6, campaigns.length / 2)),
    clamp(10 - topIrrelevant.length / 12),
    clamp(10 - duplicateGroups * 2 - (source.conversions?.primaryActions?.length ?? 0) / 10),
    clamp(5 + budgetLimited.length / 2),
    6,
    clamp(10 - topIrrelevant.length / 15),
    clamp(5 + Math.min(5, (source.negatives?.sharedLists?.length ?? 0) / 80)),
    5,
    clamp(10 - (source.narrative?.brandAndGeneric?.brandSpendSharePct ?? 15) / 3),
    clamp(5 + Math.min(5, (source.monthlyPerformance?.length ?? 0) / 8)),
    5,
    5,
  ]
  const scoreWeights = [5, 8, 10, 12, 8, 8, 10, 7, 8, 10, 7, 5, 5]
  const weightedScoreTotal = evidenceScores.reduce(
    (sum: number, score: number, index: number) => sum + score * scoreWeights[index],
    0,
  )
  const totalWeight = scoreWeights.reduce((sum, weight) => sum + weight, 0)
  const overallScore = Math.round((10 * weightedScoreTotal) / totalWeight)
  const bars = googleAdsAudit15SlideSamplePayload.auditScoreBars.map((b) => {
    const score = evidenceScores[b.step - 1]
    const [scoreColor, barColor] = scoreClass(score)
    return { ...b, score, scoreColor, barColor }
  })
  const campaignCategories = campaigns.slice(0, 4).map((c: any) => ({
    name: c.name,
    spendTotal: money(c.spend),
    cpl: c.cpa == null ? 'N/A' : `$${c.cpa.toFixed(2)}`,
    rows: [
      {
        name: c.name,
        spend: money(c.spend),
        cpl: c.cpa == null ? 'N/A' : `$${c.cpa.toFixed(2)}`,
        is: c.budgetLimitation === 'budget-limited' ? 'Limited' : 'Unverified',
        variant: c.cpa != null && c.cpa > 200 ? 'rose' : 'default',
      },
    ],
    opportunity:
      'Opportunity: validate conversion quality, budget limitation and campaign-level search intent before scaling.',
  }))
  const payload = {
    ...googleAdsAudit15SlideSamplePayload,
    clientName: 'Custom Fluid Power',
    clientWebsite: '',
    auditPeriodLabel: `${String(source.observedAccountInceptionMonth).slice(0, 7)} – ${String(source.requestedDateRange.end).slice(0, 7)}`,
    coverTagline:
      'A focused Google Ads audit of account structure, measurement, search intent and growth opportunities.',
    overallScore,
    overallScoreLabel: overallScore < 60 ? 'Needs attention' : 'Room for improvement',
    overallScoreLabelClass: overallScore < 60 ? 'text-amber-500' : 'text-lime-600',
    scoreRingDashoffset: (1 - overallScore / 100) * 339.292,
    auditScoreBars: bars,
    scoringMethodologyCards: googleAdsAudit15SlideSamplePayload.scoringMethodologyCards.map(
      (card) => {
        const score = evidenceScores[card.n - 1]
        return { ...card, score, scoreClass: scoreClass(score)[0] }
      },
    ),
    adGroupCategories: campaignCategories,
    accountGlanceRows: chartRows.map((r: any) => ({
      m: String(r.month).slice(0, 7),
      s: Number(r.spend) || 0,
      c: Number(r.clicks) || 0,
      v: Number(r.conversions) || 0,
    })),
    nbTrendMonths,
    nbTrendSegmentColors: [...chartColors],
    nbTrendGridLines: [
      { y: 20, label: money(chartMax) },
      { y: 67.5, label: money(chartMax * 0.75) },
      { y: 115, label: money(chartMax * 0.5) },
      { y: 162.5, label: money(chartMax * 0.25) },
      { y: 210, label: '$0' },
    ],
    nbTrendLegend: [
      {
        x: 0,
        color: chartColors[0],
        name: 'Account spend',
        cpl: `$${totals.overallCpa.toFixed(0)} CPA`,
      },
    ],
    negativePatternRows: [
      {
        label: 'Heuristic irrelevant terms',
        detail: ' (review queue, not automatic exclusions)',
        examples: topTerms
          .filter((r: any) => r.relevance === 'likely irrelevant')
          .slice(0, 4)
          .map((r: any) => `${r.searchTerm} ${money(r.spend)}`)
          .join(' · '),
        wasted: money(irrelevantSpend),
        terms: String(topIrrelevant.length),
      },
    ],
    landingPageRows: [],
    searchTermTopRows: topTerms.slice(0, 8).map((r: any) => ({
      term: r.searchTerm,
      spend: money(r.spend),
      conv: String(Math.round(r.conversions)),
      cpl: r.cpa == null ? 'N/A' : `$${r.cpa.toFixed(2)}`,
      budgetLimited: 'Review',
    })),
    recommendations: [
      {
        n: '01',
        title: 'Protect the healthier account position',
        desc:
          source.narrative.comparativeHealth.conclusion +
          ' Treat this as supplied comparative context, not a new benchmark score.',
      },
      {
        n: '02',
        title: 'Validate conversion quality and deduplication',
        desc: source.narrative.measurement.duplicateTrackingReview[0].hypothesis,
      },
      {
        n: '03',
        title: 'Separate brand efficiency from generic growth',
        desc: source.narrative.brandAndGeneric.interpretation,
      },
      {
        n: '04',
        title: 'Review search-term waste and negatives',
        desc: source.narrative.searchAndNegativeKeywords.recommendation,
      },
      { n: '05', title: 'Investigate HYDAC before relaunching', desc: source.narrative.hydac },
      {
        n: '06',
        title: 'Scale only evidenced opportunities',
        desc: source.narrative.budgetRecommendation + ' ' + source.narrative.seoOpportunity,
      },
    ],
  }
  const payloadApi = await getPayload({ config: configPromise })
  const clientResult = await payloadApi.find({
    collection: 'clients',
    where: { slug: { equals: SLUG } },
    limit: 1,
    depth: 0,
  })
  let client: any = clientResult.docs[0]
  if (!client) {
    client = await payloadApi.create({
      collection: 'clients',
      data: {
        name: 'Custom Fluid Power',
        slug: SLUG,
        websiteUrl: '',
        isActive: true,
      },
    })
  }
  const template: any = (
    await payloadApi.find({
      collection: 'deck-templates' as any,
      where: { templateSlug: { equals: TEMPLATE } },
      limit: 1,
    })
  ).docs[0]
  if (!template)
    throw new Error(`Template '${TEMPLATE}' not found; run seed-deck-templates.ts first`)
  const presentations = [...(client.presentations ?? [])]
  const row = {
    title: 'Google Ads Audit',
    deckSlug: 'google-ads-audit',
    kind: 'deck',
    isPublic: true,
    templateSlug: template.id,
    deckPayload: payload,
  }
  const index = presentations.findIndex((p: any) => p.deckSlug === row.deckSlug)
  if (index >= 0) presentations[index] = { ...presentations[index], ...row }
  else presentations.push(row)
  await payloadApi.update({ collection: 'clients', id: client.id, data: { presentations } })
  console.log(
    `Upserted ${SLUG}/${row.deckSlug}; weighted score ${overallScore}/100; template ${template.id}`,
  )
}
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
