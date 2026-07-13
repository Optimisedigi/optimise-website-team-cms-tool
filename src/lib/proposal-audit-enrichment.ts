import { hasTrafficCoverage } from '@/lib/proposal-audit-backfill'

export function cleanProposalDomain(value: unknown): string {
  return String(value || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim()
}

export function needsScreenshotRefresh(profile: any): boolean {
  return Boolean(cleanProposalDomain(profile?.domain || profile?.website || profile?.url))
    && !profile?.websiteScreenshot
}

export function needsTrafficRefresh(profile: any): boolean {
  return Boolean(cleanProposalDomain(profile?.domain || profile?.website || profile?.url))
    && !hasTrafficCoverage(profile)
}

export function needsMetaAdsRefresh(profile: any): boolean {
  if (!cleanProposalDomain(profile?.domain || profile?.website || profile?.url)) return false
  const metaAds = profile?.metaAds
  if (!metaAds || typeof metaAds !== 'object') return true
  if (metaAds.providerStatus === 'completed') return false
  if (metaAds.providerStatus === 'failed') return true
  if (metaAds.isRunningAds === true) return false
  const activeAds = Number(metaAds.activeAdCount ?? metaAds.adCount ?? 0)
  const screenshots = Array.isArray(metaAds.adScreenshots) ? metaAds.adScreenshots : []
  // Growth Tools currently returns this empty shape when its Meta provider fails,
  // so it is not sufficient evidence that the competitor genuinely has no ads.
  return activeAds === 0 && screenshots.length === 0
}

export async function dispatchProposalAuditEnrichment({
  origin,
  proposalId,
  internalApiKey,
  fetchImpl = fetch,
}: {
  origin: string
  proposalId: string
  internalApiKey: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const response = await fetchImpl(
    `${origin}/api/proposals/${encodeURIComponent(proposalId)}/enrich-audit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': internalApiKey,
      },
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) {
    throw new Error(`Audit enrichment dispatch failed: ${response.status}`)
  }
}
