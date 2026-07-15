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
