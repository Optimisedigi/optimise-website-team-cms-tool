import { describe, expect, it, vi } from 'vitest'
import {
  buildAuditProgressUpdate,
  failedOptionalEnrichmentState,
  persistCoreAuditCheckpoint,
} from '@/lib/proposal-audit-checkpoint'

const auditIds = {
  seoAudit: 38,
  croAudit: 46,
  keywordSnapshot: 44,
  competitorAnalysis: 43,
  contentResearch: [122, 123],
}

describe('buildAuditProgressUpdate', () => {
  it('preserves proposal arrays while progress changes', () => {
    expect(buildAuditProgressUpdate('SEO complete', 40, {
      keywordCategories: [{ categoryName: 'Clinics', keywords: 'medical clinic' }],
      competitors: [{ name: 'Example' }],
    })).toEqual({
      auditProgress: 'SEO complete|40',
      keywordCategories: [{ categoryName: 'Clinics', keywords: 'medical clinic' }],
      competitors: [{ name: 'Example' }],
    })
  })
})

describe('persistCoreAuditCheckpoint', () => {
  it('links every available partial result without treating provider warnings as fatal', async () => {
    const update = vi.fn().mockResolvedValue({})

    const status = await persistCoreAuditCheckpoint({
      payload: { update },
      proposalId: '12',
      auditIds: { ...auditIds, croAudit: null },
      errors: ['CRO audit failed: 504'],
      validationErrors: [],
      preservedFields: { competitors: [] },
      completedAt: '2026-07-13T10:55:20.000Z',
    })

    expect(status).toBe('completed')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        auditStatus: 'completed',
        auditProgress: 'Complete|100',
        seoAudit: 38,
        keywordSnapshot: 44,
        competitorAnalysis: 43,
        contentResearch: [122, 123],
        auditError: 'CRO audit failed: 504',
      }),
    }))
    expect(update.mock.calls[0][0].data).not.toHaveProperty('croAudit')
  })

  it('keeps the completed core checkpoint when optional enrichment fails later', async () => {
    const update = vi.fn().mockResolvedValue({})

    await persistCoreAuditCheckpoint({
      payload: { update },
      proposalId: '12',
      auditIds,
      errors: [],
      validationErrors: [],
      preservedFields: {},
    })

    const enrichment = failedOptionalEnrichmentState(new Error('Screenshot timeout'))

    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0].data.auditStatus).toBe('completed')
    expect(update.mock.calls[0][0].data.auditProgress).toBe('Complete|100')
    expect(enrichment).toEqual({
      status: 'failed',
      error: 'Optional enrichment failed: Screenshot timeout',
    })
  })
})

