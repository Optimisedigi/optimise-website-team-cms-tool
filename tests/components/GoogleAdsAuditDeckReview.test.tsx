import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GoogleAdsAuditDeckReview from '@/components/GoogleAdsAuditDeckReview'

vi.mock('@payloadcms/ui', () => ({ useDocumentInfo: () => ({ id: '4' }) }))

const review = {
  businessName: 'Acme', published: false, generatedAt: '2026-07-02T00:00:00Z',
  snapshot: { status: 'completed', schemaVersion: 3, requestedAt: '2026-07-01T00:00:00Z', capturedAt: '2026-07-02T00:00:00Z', periodStart: '2024-01-01', periodEnd: '2026-06-30', accountTimeZone: 'Australia/Sydney', currencyCode: 'AUD', earliestAvailableActivityDate: '2024-01-01', sourceRowCounts: { campaigns: 3 }, evidenceCoverage: { datasets: [{ datasetKey: 'campaigns', rowCount: 3, status: 'completed', providers: ['google_ads'] }, { datasetKey: 'paid_serp_competitors', rowCount: 0, status: 'failed', providers: ['serper'], failureReasons: ['Serper timed out'] }], unavailableProviders: ['serper'] }, scorecards: Array.from({ length: 13 }, (_, index) => ({ id: `category-${index}`, label: `Category ${index + 1}`, score: index === 12 ? null : 8, maximum: 10, status: index === 12 ? 'insufficient_evidence' : 'scored' })) },
  deck: { slides: [
    { id: 'cover', title: 'Google Ads audit', required: true, hidden: false, assessment: 'mixed', completeness: 'complete' },
    { id: 'search-terms', title: 'Search terms', required: false, hidden: false, assessment: 'opportunity', completeness: 'complete' },
  ] },
}

describe('GoogleAdsAuditDeckReview', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows provenance, required-slide protection, and reversible visibility feedback', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(review), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...review, deck: { slides: [review.deck.slides[0], { ...review.deck.slides[1], hidden: true }] } }), { status: 200 }))
    render(<GoogleAdsAuditDeckReview />)
    expect(await screen.findByText('2024-01-01 to 2026-06-30')).toBeInTheDocument()
    expect(screen.getByLabelText('Slides, 2 visible')).toBeInTheDocument()
    expect(screen.getByText('1 unavailable')).toBeInTheDocument()
    expect(screen.getByText('Serper timed out')).toBeInTheDocument()
    expect(screen.getByLabelText('Thirteen audit category scores').children).toHaveLength(13)
    expect(screen.getByText('Not assessed')).toBeInTheDocument()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toBeDisabled()
    fireEvent.click(checkboxes[1])
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/google-ads-audits/4/deck-slides', expect.objectContaining({ method: 'PATCH' })))
    expect(await screen.findByText('Search terms hidden from the client deck.')).toBeInTheDocument()
  })

  it('renders an honest empty state while snapshot capture is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ businessName: 'Acme', published: false, snapshot: null, deck: null }), { status: 200 }))
    render(<GoogleAdsAuditDeckReview />)
    expect(await screen.findByText('No frozen snapshot exists yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate deck' })).toBeDisabled()
  })

  it('blocks deck changes after capture failure and offers a frozen-window retry', async () => {
    const failed = { ...review, snapshot: { ...review.snapshot, status: 'failed', error: 'Collector timed out' } }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(failed), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending', periodStart: '2024-01-01', periodEnd: '2026-06-30' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...failed, snapshot: { ...failed.snapshot, status: 'pending' } }), { status: 200 }))
    render(<GoogleAdsAuditDeckReview />)
    expect(await screen.findByText('Collector timed out')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regenerate deck' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Publish reviewed deck' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry frozen snapshot' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/google-ads-audits/4/snapshot', expect.objectContaining({ method: 'POST' })))
  })

  it('marks schema-v3 snapshots without coverage metadata as Not assessed', async () => {
    const legacy = { ...review, snapshot: { ...review.snapshot, schemaVersion: 3, evidenceCoverage: undefined } }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(legacy), { status: 200 }))
    render(<GoogleAdsAuditDeckReview />)
    expect(await screen.findByText('Coverage metadata is unavailable for this legacy snapshot. Evidence is Not assessed.')).toBeInTheDocument()
    expect(screen.getByText('Not assessed', { selector: '.gads-review__evidence-heading span' })).toBeInTheDocument()
  })
})
