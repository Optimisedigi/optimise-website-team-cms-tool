import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { captureAndUploadScreenshot, type ScreenshotOptions } from '@/lib/screenshots'
import { fetchMetaAdsForCompetitors } from '@/lib/proposal-meta-ads'
import {
  explicitUnavailableTraffic,
  extractRootDomain,
  formatTraffic,
  type FormattedTraffic,
} from '@/lib/proposal-audit-backfill'
import {
  cleanProposalDomain,
  needsScreenshotRefresh,
  needsTrafficRefresh,
} from '@/lib/proposal-audit-enrichment'

export const maxDuration = 300

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY
const ITEM_TIMEOUT_MS = 20_000
// Meta Ad Library scrapes are slower than a traffic lookup: each one drives a
// headless browser (social-link extraction + clicking into individual ads) and
// queues behind the Scrapling service's browser-concurrency gate. A 20s cap
// killed jobs while they were still waiting in that queue, so give the Meta
// pipeline a dedicated, larger budget. Overall runtime is still bounded by
// deadlineAt, which skips remaining competitors once the route budget is spent.
const META_ITEM_TIMEOUT_MS = 50_000
const DEADLINE_SAFETY_MS = 45_000

function relationshipId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchTrafficRecoverable(rootDomain: string, deadlineAt: number): Promise<FormattedTraffic> {
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) return explicitUnavailableTraffic('not_configured')
  const backoffs = [1_000, 3_000, 7_000]
  let unavailableReason = 'failed'

  for (let attempt = 0; attempt < 3; attempt++) {
    const remainingMs = deadlineAt - Date.now()
    if (remainingMs <= 0) return explicitUnavailableTraffic('timeout')
    try {
      const response = await fetch(
        `${GROWTH_TOOLS_URL}/api/traffic?domain=${encodeURIComponent(rootDomain)}`,
        {
          headers: { 'x-internal-key': INTERNAL_API_KEY },
          signal: AbortSignal.timeout(Math.min(ITEM_TIMEOUT_MS, remainingMs)),
        },
      )
      if (!response.ok) throw new Error(`Traffic API failed: ${response.status}`)
      return formatTraffic(await response.json())
    } catch (error: any) {
      unavailableReason = error?.name === 'TimeoutError' || error?.name === 'AbortError'
        ? 'timeout'
        : 'failed'
      if (attempt < 2) {
        const backoffMs = Math.min(backoffs[attempt], Math.max(0, deadlineAt - Date.now()))
        if (backoffMs > 0) await sleep(backoffMs)
      }
    }
  }

  return explicitUnavailableTraffic(unavailableReason)
}

async function runEnrichment(proposalId: string): Promise<void> {
  const deadlineAt = Date.now() + maxDuration * 1_000 - DEADLINE_SAFETY_MS
  const payload = await getPayload({ config })
  const proposal: any = await payload.findByID({
    collection: 'client-proposals',
    id: proposalId,
    overrideAccess: true,
  })
  const competitorAnalysisId = relationshipId(proposal.competitorAnalysis)
  if (competitorAnalysisId == null) throw new Error('No linked competitor analysis found')

  const analysis: any = await payload.findByID({
    collection: 'competitor-analyses',
    id: competitorAnalysisId as any,
    overrideAccess: true,
  })
  const yourProfile = analysis?.yourProfile && typeof analysis.yourProfile === 'object'
    ? { ...analysis.yourProfile }
    : null
  const competitors = Array.isArray(analysis?.competitors)
    ? analysis.competitors.map((profile: any) => ({ ...profile }))
    : []

  // Add only CMS-entered competitors that Growth Tools did not already return.
  const proposalCompetitors = Array.isArray(proposal.competitors)
    ? proposal.competitors.map((competitor: any) => ({ ...competitor }))
    : []
  const existingDomains = new Set(competitors.map((profile: any) => cleanProposalDomain(profile?.domain)).filter(Boolean))
  for (const manual of proposalCompetitors) {
    const domain = cleanProposalDomain(manual?.websiteUrl)
    if (!domain || existingDomains.has(domain)) continue
    competitors.push({
      domain,
      name: manual?.name || domain,
      traffic: null,
      websiteScreenshot: null,
      metaAds: null,
      googleAds: null,
      googleBusinessProfile: null,
    })
    existingDomains.add(domain)
  }

  const allProfiles = [yourProfile, ...competitors].filter(Boolean)
  const screenshotProfiles = allProfiles.filter(needsScreenshotRefresh)
  const clickSelector = proposal.screenshotClickSelector as string | undefined
  const yourDomain = cleanProposalDomain(yourProfile?.domain || proposal.websiteUrl)
  const screenshotResults = await Promise.allSettled(
    screenshotProfiles.map(async (profile: any) => {
      const domain = cleanProposalDomain(profile?.domain || profile?.website || profile?.url)
      const options: ScreenshotOptions | undefined = domain === yourDomain && clickSelector
        ? { clickSelector }
        : undefined
      const screenshot = await Promise.race([
        captureAndUploadScreenshot(`https://${domain}`, options),
        new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error('Screenshot timed out')),
          Math.min(ITEM_TIMEOUT_MS, Math.max(1, deadlineAt - Date.now())),
        )),
      ])
      return { profile, screenshot }
    }),
  )
  for (const result of screenshotResults) {
    if (result.status === 'fulfilled' && result.value.screenshot) {
      result.value.profile.websiteScreenshot = result.value.screenshot
    }
  }

  // Treat explicit unavailable traffic as a completed provider result; retry only
  // profiles where Growth Tools returned no traffic state at all.
  const trafficProfiles = allProfiles.filter(needsTrafficRefresh)
  await Promise.all(
    trafficProfiles.map(async (profile: any) => {
      const domain = cleanProposalDomain(profile?.domain || profile?.website || profile?.url)
      const rootDomain = extractRootDomain(domain)
      profile.traffic = rootDomain
        ? await fetchTrafficRecoverable(rootDomain, deadlineAt)
        : explicitUnavailableTraffic('invalid_domain')
    }),
  )

  // Meta Ad Library data comes exclusively from the Scrapling scrape (public
  // facebook.com/ads/library). Growth Tools no longer performs a Meta check, so
  // run the scrape for every competitor that has a domain.
  const metaCandidates = competitors.filter((c: any) =>
    Boolean(cleanProposalDomain(c?.domain || c?.website || c?.url)),
  )
  let metaAdsStatus: 'completed' | 'failed' = 'completed'
  let metaAdsError: string | null = null
  if (metaCandidates.length > 0) {
    const metaResult = await fetchMetaAdsForCompetitors(metaCandidates, {
      timeoutMs: META_ITEM_TIMEOUT_MS,
      deadlineAt,
    })
    const refreshedByDomain = new Map(
      metaResult.updated.map((profile: any) => [cleanProposalDomain(profile?.domain), profile]),
    )
    for (let index = 0; index < competitors.length; index++) {
      const refreshed = refreshedByDomain.get(cleanProposalDomain(competitors[index]?.domain))
      if (refreshed) competitors[index] = { ...competitors[index], ...refreshed }
    }
    if (metaResult.failed > 0 || metaResult.skipped > 0) {
      metaAdsStatus = 'failed'
      metaAdsError = `Meta Ads incomplete: ${metaResult.failed} failed, ${metaResult.skipped} skipped (deadline) of ${metaResult.attempted}. Use "Refresh Meta Ads" to retry.`
    }
  }

  // Preserve the former pipeline's GBP enrichment for manually entered
  // competitors that have a Google Maps URL but no saved profile data.
  const gbpUpdates = new Map<string, {
    rating: number
    reviewCount: number
    respondsToReviews: boolean
    profile: any
  }>()
  if (GROWTH_TOOLS_URL && INTERNAL_API_KEY) {
    const gbpCandidates = proposalCompetitors.filter((competitor: any) =>
      competitor?.googleMapsUrl && competitor?.name && !competitor?.gbpRating,
    )
    const gbpResults = await Promise.allSettled(
      gbpCandidates.map(async (competitor: any) => {
        const remainingMs = deadlineAt - Date.now()
        if (remainingMs <= 0) throw new Error('GBP enrichment deadline reached')
        const response = await fetch(`${GROWTH_TOOLS_URL}/api/gbp-lookup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': INTERNAL_API_KEY,
          },
          body: JSON.stringify({
            name: competitor.name,
            location: proposal.targetLocation || undefined,
            language: proposal.searchLanguage || undefined,
          }),
          signal: AbortSignal.timeout(Math.min(ITEM_TIMEOUT_MS, remainingMs)),
        })
        if (!response.ok) throw new Error(`GBP lookup failed: ${response.status}`)
        return { competitor, profile: await response.json() }
      }),
    )
    for (const result of gbpResults) {
      if (result.status !== 'fulfilled' || !result.value.profile) continue
      const { competitor, profile } = result.value
      gbpUpdates.set(competitor.name, {
        rating: profile.rating,
        reviewCount: profile.reviewCount,
        respondsToReviews: profile.respondsToReviews ?? false,
        profile,
      })
      const domain = cleanProposalDomain(competitor.websiteUrl)
      const matchedProfile = competitors.find((item: any) => cleanProposalDomain(item?.domain) === domain)
      if (matchedProfile) {
        matchedProfile.googleBusinessProfile = {
          name: profile.name,
          rating: profile.rating,
          reviewCount: profile.reviewCount,
          category: profile.category ?? null,
          respondsToReviews: profile.respondsToReviews ?? false,
          responseRate: profile.responseRate ?? null,
        }
      }
    }
  }

  const updatedProposalCompetitors = proposalCompetitors.map((competitor: any) => {
    const update = gbpUpdates.get(competitor.name)
    return update
      ? {
          ...competitor,
          gbpRating: update.rating,
          gbpReviewCount: update.reviewCount,
          gbpRespondsToReviews: update.respondsToReviews,
        }
      : competitor
  })

  await payload.update({
    collection: 'competitor-analyses',
    id: competitorAnalysisId as any,
    data: { yourProfile, competitors } as any,
    overrideAccess: true,
  })
  await payload.update({
    collection: 'client-proposals',
    id: proposalId,
    data: {
      metaAdsStatus,
      metaAdsError,
      metaAdsUpdatedAt: new Date().toISOString(),
      ...(gbpUpdates.size > 0 ? { competitors: updatedProposalCompetitors } : {}),
      keywordCategories: proposal.keywordCategories ?? [],
      googleMapsUrls: proposal.googleMapsUrls ?? [],
      flightPlanImages: proposal.flightPlanImages ?? [],
      missionResourcesImages: proposal.missionResourcesImages ?? [],
    } as any,
    overrideAccess: true,
  })

  console.log(
    `[enrich-audit] Proposal ${proposalId}: screenshots=${screenshotProfiles.length}, traffic=${trafficProfiles.length}, meta=${metaCandidates.length}, metaStatus=${metaAdsStatus}`,
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const payload = await getPayload({ config })
  const isInternal = Boolean(INTERNAL_API_KEY && req.headers.get('x-internal-key') === INTERNAL_API_KEY)
  if (!isInternal) {
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const proposal: any = await payload.findByID({
      collection: 'client-proposals',
      id,
      overrideAccess: true,
    })
    if (relationshipId(proposal.competitorAnalysis) == null) {
      return NextResponse.json({ error: 'No linked competitor analysis found' }, { status: 422 })
    }
    await payload.update({
      collection: 'client-proposals',
      id,
      data: {
        metaAdsStatus: 'running',
        metaAdsError: null,
        metaAdsUpdatedAt: new Date().toISOString(),
      } as any,
      overrideAccess: true,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Proposal not found' }, { status: 404 })
  }

  after(async () => {
    try {
      await runEnrichment(id)
    } catch (error: any) {
      console.error(`[enrich-audit] Proposal ${id} failed:`, error?.message || error)
      const payload = await getPayload({ config })
      await payload.update({
        collection: 'client-proposals',
        id,
        data: {
          metaAdsStatus: 'failed',
          metaAdsError: error?.message || 'Optional proposal enrichment failed.',
          metaAdsUpdatedAt: new Date().toISOString(),
        } as any,
        overrideAccess: true,
      }).catch((statusError: any) => {
        console.error(`[enrich-audit] Failed to persist failure for proposal ${id}:`, statusError?.message || statusError)
      })
    }
  })

  return NextResponse.json({ ok: true, status: 'running' }, { status: 202 })
}
