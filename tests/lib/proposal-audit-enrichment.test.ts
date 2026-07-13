import { describe, expect, it, vi } from 'vitest'
import {
  dispatchProposalAuditEnrichment,
  needsMetaAdsRefresh,
  needsScreenshotRefresh,
  needsTrafficRefresh,
} from '@/lib/proposal-audit-enrichment'

describe('proposal audit enrichment selection', () => {
  it('retries only missing screenshot, Meta, and traffic data', () => {
    const complete = {
      domain: 'complete.example',
      websiteScreenshot: 'https://blob.example/screenshot.webp',
      traffic: { status: 'available', monthlyVisits: 1234 },
      metaAds: { isRunningAds: true, activeAdCount: 2, adScreenshots: ['https://blob.example/ad.webp'] },
    }
    const unavailableTraffic = {
      domain: 'blocked.example',
      traffic: { status: 'unavailable', monthlyVisits: null, unavailableReason: 'blocked' },
    }
    const growthMetaFallback = {
      domain: 'meta.example',
      metaAds: { isRunningAds: false, activeAdCount: 0, adScreenshots: [], providerStatus: 'failed' },
    }
    const verifiedNoAds = {
      domain: 'no-ads.example',
      metaAds: { isRunningAds: false, activeAdCount: 0, adScreenshots: [], providerStatus: 'completed' },
    }

    expect(needsScreenshotRefresh(complete)).toBe(false)
    expect(needsTrafficRefresh(complete)).toBe(false)
    expect(needsMetaAdsRefresh(complete)).toBe(false)
    expect(needsTrafficRefresh(unavailableTraffic)).toBe(false)
    expect(needsScreenshotRefresh({ domain: 'missing.example' })).toBe(true)
    expect(needsTrafficRefresh({ domain: 'missing.example', traffic: null })).toBe(true)
    expect(needsMetaAdsRefresh(growthMetaFallback)).toBe(true)
    expect(needsMetaAdsRefresh(verifiedNoAds)).toBe(false)
  })
})

describe('dispatchProposalAuditEnrichment', () => {
  it('starts a separate internal request without waiting for enrichment work', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 })

    await dispatchProposalAuditEnrichment({
      origin: 'https://cms.example',
      proposalId: '12',
      internalApiKey: 'internal-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://cms.example/api/proposals/12/enrich-audit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-key': 'internal-key' }),
      }),
    )
  })

  it('surfaces dispatch rejection instead of reporting enrichment as started', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 })

    await expect(dispatchProposalAuditEnrichment({
      origin: 'https://cms.example',
      proposalId: '12',
      internalApiKey: 'internal-key',
      fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toThrow('503')
  })
})
