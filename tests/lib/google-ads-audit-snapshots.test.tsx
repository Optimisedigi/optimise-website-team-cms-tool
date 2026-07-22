import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { previousCalendarMonthEnd } from '@/lib/google-ads-audit-snapshots/window'
import {
  AUDIT_SLIDE_CATALOG,
  generateAuditDeck,
  generateSemanticDeckPayload,
} from '@/lib/google-ads-audit-snapshots/deck'
import {
  googleAdsAudit15SlideSchema,
  type SemanticGoogleAdsAuditPayload,
} from '@/lib/decks/templates/google-ads-audit-15-slide/payload'
import { SemanticComponent } from '@/lib/decks/templates/google-ads-audit-15-slide/SemanticComponent'
import {
  createSnapshotForAudit,
  finalizeSnapshot,
  ingestSnapshotChunk,
} from '@/lib/google-ads-audit-snapshots/lifecycle'
import {
  SNAPSHOT_DATASET_KEYS,
  SNAPSHOT_SCHEMA_VERSION,
} from '@/lib/google-ads-audit-snapshots/types'
import {
  GOOGLE_ADS_AUDIT_CATEGORY_IDS,
  GOOGLE_ADS_AUDIT_RUBRIC_VERSION,
} from '@/lib/google-ads-audit-snapshots/scoring'
import { createHash } from 'node:crypto'

const analysis = {
  totals: {
    impressions: 1000,
    clicks: 100,
    cost: 5000,
    conversions: 10,
    allConversions: 14,
    ctr: 0.1,
    averageCpc: 50,
    cpa: 500,
  },
  monthlyTrend: [
    { month: '2026-05', cost: 2000 },
    { month: '2026-06', cost: 3000 },
  ],
  conversionDiagnostics: {
    configuredActions: 2,
    primaryActions: 1,
    primaryConversions: 10,
    allConversions: 14,
  },
  structure: { campaigns: 3, enabledCampaigns: 2, adGroups: 8, enabledAds: 8 },
  channelPerformance: [],
  impressionShare: {},
  competitors: [],
  brandGeneric: {
    brand: { cost: 1000, conversions: 4, cpa: 250 },
    generic: { cost: 4000, conversions: 6, cpa: 666.67 },
  },
  searchTerms: { confirmedWasteAmount: 300, reviewCount: 2, classified: [] },
  negatives: { campaignCount: 4, sharedCount: 2, assignments: 3 },
  adCopy: { ads: 8, assets: 24, enabledAds: 8 },
  landingPages: { pages: [] },
  recommendations: [{ priority: 1, area: 'search_terms', title: 'Control irrelevant intent' }],
  scoring: {
    rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION,
    total: 76,
    maximum: 100,
    categories: GOOGLE_ADS_AUDIT_CATEGORY_IDS.map((id) => ({
      id,
      label: id,
      score: 7.6,
      maximum: 10,
      status: 'scored',
      weight: 1,
      checks: [],
    })),
  },
}

const snapshot = {
  id: 9,
  status: 'completed',
  analysis,
  requestedAt: '2026-07-01T00:30:00Z',
  capturedAt: '2026-07-02T00:00:00Z',
  periodStart: '2024-01-01',
  periodEnd: '2026-06-30',
  earliestAvailableActivityDate: '2024-01-01',
  accountTimeZone: 'Australia/Sydney',
  currencyCode: 'AUD',
  retentionCaveat: 'Earlier zero-activity time cannot be reconstructed.',
  sourceRowCounts: Object.fromEntries(SNAPSHOT_DATASET_KEYS.map((key) => [key, 1])),
  schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION,
}
const audit = {
  id: 4,
  businessName: 'Long Client Name for Responsive Layout Verification',
  client: 2,
  snapshot: 9,
  deckSlideVisibility: {},
}

describe('snapshot windows', () => {
  it('ends on the previous local calendar month across timezone boundaries', () => {
    expect(previousCalendarMonthEnd('2026-07-01T00:30:00.000Z', 'America/Los_Angeles')).toBe(
      '2026-05-31',
    )
    expect(previousCalendarMonthEnd('2026-06-30T23:30:00.000Z', 'Australia/Sydney')).toBe(
      '2026-06-30',
    )
  })
})

describe('versioned semantic deck', () => {
  it('generates the complete stable catalog and protects required slides', () => {
    const deck = generateSemanticDeckPayload(audit, snapshot) as SemanticGoogleAdsAuditPayload
    expect(deck.slides.map((slide) => slide.id)).toEqual(AUDIT_SLIDE_CATALOG.map(([id]) => id))
    expect(deck.slides.filter((slide) => slide.required).every((slide) => !slide.hidden)).toBe(true)
    expect(googleAdsAudit15SlideSchema.safeParse(deck).ok).toBe(true)
    const invalid = structuredClone(deck)
    invalid.slides.find((slide) => slide.id === 'cover')!.hidden = true
    expect(googleAdsAudit15SlideSchema.safeParse(invalid).ok).toBe(false)
  })

  it('omits hidden and unavailable slides and recalculates visible numbering', () => {
    const deck = generateSemanticDeckPayload(
      { ...audit, deckSlideVisibility: { competitors: true } },
      { ...snapshot, sourceRowCounts: { ...snapshot.sourceRowCounts, landing_page_views: 0 } },
    ) as SemanticGoogleAdsAuditPayload
    const html = renderToStaticMarkup(<SemanticComponent payload={deck} />)
    expect(html).not.toContain('Competitor analysis')
    expect(html).not.toContain('Landing-page performance')
    expect(html).toContain('01 / 18')
    expect(html).toContain('18 / 18')
  })

  it('renders all scorecards and unavailable evidence as Not assessed', () => {
    const incomplete = {
      ...analysis,
      scoring: {
        ...analysis.scoring,
        total: null,
        categories: analysis.scoring.categories.map((category, index) =>
          index === 0 ? { ...category, score: null, status: 'insufficient_evidence' } : category,
        ),
      },
    }
    const deck = generateSemanticDeckPayload(audit, {
      ...snapshot,
      analysis: incomplete,
    }) as SemanticGoogleAdsAuditPayload
    const html = renderToStaticMarkup(<SemanticComponent payload={deck} />)
    expect(deck.scorecards).toHaveLength(GOOGLE_ADS_AUDIT_CATEGORY_IDS.length)
    expect(html).toContain(`${GOOGLE_ADS_AUDIT_CATEGORY_IDS.length} audit category scores`)
    expect(html).toContain('Not assessed')
    expect(html).not.toContain('0/100')
  })

  it('renders high-volume semantic values without precomputed chart geometry', () => {
    const deck = generateSemanticDeckPayload(audit, {
      ...snapshot,
      analysis: {
        ...analysis,
        monthlyTrend: Array.from({ length: 40 }, (_, index) => ({
          month: `2026-${String((index % 12) + 1).padStart(2, '0')}`,
          cost: (index + 1) * 1_000_000,
        })),
      },
    }) as SemanticGoogleAdsAuditPayload
    const html = renderToStaticMarkup(<SemanticComponent payload={deck} />)
    expect(html).toContain('Monthly Google Ads spend trend')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
  })

  it('regenerates from stored analysis with zero network calls and preserves unrelated presentations', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const updates: any[] = []
    const client = {
      id: 2,
      slug: 'client',
      presentations: [
        { id: 'keep', title: 'Unrelated', deckSlug: 'other', deckPayload: { keep: true } },
      ],
    }
    const fakePayload: any = {
      findByID: vi.fn(async ({ collection }: any) =>
        collection === 'google-ads-audits'
          ? audit
          : collection === 'google-ads-audit-snapshots'
            ? snapshot
            : client,
      ),
      find: vi.fn(async () => ({ docs: [{ id: 7, templateSlug: 'google-ads-audit-15-slide' }] })),
      create: vi.fn(),
      update: vi.fn(async (args: any) => {
        updates.push(args)
        return args.data
      }),
    }
    const deck = await generateAuditDeck(fakePayload, '4')
    expect(fetchSpy).not.toHaveBeenCalled()
    const clientUpdate = updates.find((item) => item.collection === 'clients')
    expect(clientUpdate.data.presentations[0]).toMatchObject({
      id: 'keep',
      deckPayload: { keep: true },
    })
    expect(clientUpdate.data.presentations[1]).toMatchObject({
      deckSlug: 'google-ads-audit-4',
      isPublic: false,
      deckPayload: { version: 2 },
    })
    expect(deck.publicPath).toBe('/partners/client/google-ads-audit-4')
  })

  it('trims 140k classified search terms before persisting the generated deck', async () => {
    const classified = Array.from({ length: 140_000 }, (_, index) => ({
      searchTerm: `term-${index}`,
      category: 'irrelevant',
      spend: index,
    }))
    const largeSnapshot = {
      ...snapshot,
      analysis: { ...analysis, searchTerms: { ...analysis.searchTerms, classified } },
    }
    const updates: any[] = []
    const client = { id: 2, slug: 'client', presentations: [] }
    const fakePayload: any = {
      findByID: vi.fn(async ({ collection }: any) =>
        collection === 'google-ads-audits'
          ? audit
          : collection === 'google-ads-audit-snapshots'
            ? largeSnapshot
            : client,
      ),
      find: vi.fn(async () => ({ docs: [{ id: 7, templateSlug: 'google-ads-audit-15-slide' }] })),
      create: vi.fn(),
      update: vi.fn(async (args: any) => {
        updates.push(args)
        return args.data
      }),
    }

    await generateAuditDeck(fakePayload, '4')

    const clientDeck = updates.find((item) => item.collection === 'clients').data.presentations[0]
      .deckPayload
    const auditDeck = updates.find((item) => item.collection === 'google-ads-audits').data
      .generatedDeckPayload
    expect(classified).toHaveLength(140_000)
    expect(clientDeck.analysis.searchTerms.classified).toHaveLength(25)
    expect(auditDeck.analysis.searchTerms.classified).toHaveLength(25)
    expect(auditDeck.analysis.searchTerms.classified.map((term: any) => term.searchTerm)).toEqual(
      Array.from({ length: 25 }, (_, index) => `term-${139_999 - index}`),
    )
    expect(fakePayload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'google-ads-audits',
        select: expect.objectContaining({ snapshot: true, client: true }),
      }),
    )
    expect(fakePayload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'clients',
        select: { slug: true, presentations: true },
      }),
    )
  })
})

describe('snapshot lifecycle', () => {
  it('marks a stale running snapshot failed and retries the same frozen snapshot', async () => {
    const updates: any[] = []
    const staleSnapshot = {
      ...snapshot,
      audit: 4,
      status: 'running',
      growthToolsJobId: 'dead-job',
      retryCount: 1,
      updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    }
    const fakePayload: any = {
      findByID: vi.fn(async () => ({ ...audit, customerId: '123-456-7890' })),
      find: vi.fn(async () => ({ docs: [staleSnapshot] })),
      delete: vi.fn(async () => ({ docs: [] })),
      update: vi.fn(async (args: any) => {
        updates.push(args)
        return { ...staleSnapshot, ...args.data }
      }),
    }

    const retried = await createSnapshotForAudit(fakePayload, 4, { dispatch: false })

    expect(retried).toMatchObject({ status: 'pending', growthToolsJobId: null, retryCount: 2 })
    expect(fakePayload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'google-ads-audit-snapshot-chunks',
        where: { snapshot: { equals: snapshot.id } },
      }),
    )
    expect(updates[0]).toMatchObject({
      collection: 'google-ads-audit-snapshots',
      data: { status: 'failed', error: 'Snapshot timed out, Growth Tools job presumed dead' },
    })
    expect(
      updates.some(
        (item) => item.collection === 'google-ads-audits' && item.data.auditStatus === 'failed',
      ),
    ).toBe(true)
  })
})

describe('chunk integrity and finalization', () => {
  it('accepts idempotent chunks, rejects checksum conflicts, and finalizes only a complete manifest', async () => {
    const chunks: any[] = []
    const updates: any[] = []
    const fakePayload: any = {
      findByID: vi.fn(async ({ collection }: any) =>
        collection === 'google-ads-audit-snapshots'
          ? { ...snapshot, status: 'running', growthToolsJobId: 'job', audit: 4 }
          : audit,
      ),
      find: vi.fn(async ({ collection, where }: any) =>
        collection === 'google-ads-audit-snapshot-chunks'
          ? {
              docs: where?.identity
                ? chunks.filter((chunk) => chunk.identity === where.identity.equals)
                : chunks,
            }
          : { docs: [] },
      ),
      create: vi.fn(async ({ data }: any) => {
        chunks.push(data)
        return data
      }),
      update: vi.fn(async (args: any) => {
        updates.push(args)
        return { id: args.id, ...args.data }
      }),
    }
    const manifest = []
    for (const [index, datasetKey] of SNAPSHOT_DATASET_KEYS.entries()) {
      const rows = index === 0 ? [{ customer: { id: '123' } }] : []
      const checksum = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
      const input = {
        jobId: 'job',
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        datasetKey,
        chunkIndex: 0,
        rowCount: rows.length,
        checksum,
        rows,
      }
      expect(await ingestSnapshotChunk(fakePayload, '9', input)).toEqual({ duplicate: false })
      expect(await ingestSnapshotChunk(fakePayload, '9', input)).toEqual({ duplicate: true })
      manifest.push({ datasetKey, chunkIndex: 0, rowCount: rows.length, checksum })
    }
    await expect(
      ingestSnapshotChunk(fakePayload, '9', {
        ...manifest[0],
        jobId: 'job',
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        rows: [],
        rowCount: 0,
      }),
    ).rejects.toThrow('checksum')
    const completed = await finalizeSnapshot(fakePayload, '9', {
      jobId: 'job',
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION,
      manifest,
      analysis,
      capturedAt: snapshot.capturedAt,
    })
    expect(completed.status).toBe('completed')
    expect(
      updates.some(
        (item) => item.collection === 'google-ads-audits' && item.data.overallScore === 76,
      ),
    ).toBe(true)
  })

  it('rejects late finalization after failure', async () => {
    const fakePayload: any = {
      findByID: vi.fn(async () => ({
        ...snapshot,
        status: 'failed',
        growthToolsJobId: 'job',
        audit: 4,
      })),
    }

    await expect(
      finalizeSnapshot(fakePayload, '9', {
        jobId: 'job',
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION,
        manifest: [],
        analysis,
        capturedAt: snapshot.capturedAt,
      }),
    ).rejects.toThrow('not ready to finalize')
  })
})
