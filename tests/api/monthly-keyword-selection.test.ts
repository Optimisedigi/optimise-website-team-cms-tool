import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

import { POST as savePOST } from '@/app/(frontend)/api/monthly-keyword-selection/save/route'
import { POST as applyPOST } from '@/app/(frontend)/api/monthly-keyword-selection/apply/route'
import { POST as completePOST } from '@/app/(frontend)/api/monthly-keyword-selection/complete/route'
import { POST as clearPOST } from '@/app/(frontend)/api/monthly-keyword-selection/clear/route'
import { POST as revisePOST } from '@/app/(frontend)/api/monthly-keyword-selection/revise/route'

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('monthly keyword selection API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue({ user: { id: 9, role: 'admin' } })
  })

  it('save creates a per-client selection doc with normalised selections', async () => {
    mockPayload.find.mockResolvedValue({ docs: [] })
    mockPayload.create.mockResolvedValue({ id: 44 })

    const res = await savePOST(request('/api/monthly-keyword-selection/save', {
      clientId: 7,
      selections: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', negativeKeyword: 'cheap', matchType: 'exact', decision: 'approved' }],
    }))

    expect(res.status).toBe(200)
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'monthly-keyword-selections',
      data: expect.objectContaining({ client: 7, status: 'active' }),
    }))
  })

  it('save persists multiple sub-rows for the same search term keyed by rowIndex', async () => {
    mockPayload.find.mockResolvedValue({ docs: [{ id: 22, selections: [] }] })
    mockPayload.update.mockResolvedValue({ id: 22 })

    const res = await savePOST(request('/api/monthly-keyword-selection/save', {
      clientId: 7,
      selections: [
        { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'approved', appliedToNKL: 3 },
        { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 1, negativeKeyword: 'discount', matchType: 'phrase', decision: 'approved', appliedToNKL: 3 },
      ],
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true, selectionCount: 2 })
    const updateCall = mockPayload.update.mock.calls[0][0]
    const saved = updateCall.data.selections
    expect(saved).toHaveLength(2)
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap' }),
      expect.objectContaining({ searchTerm: 'cheap widgets', rowIndex: 1, negativeKeyword: 'discount' }),
    ]))
  })

  it('save prunes a removed sub-row via deletions', async () => {
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'pending' },
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 1, negativeKeyword: 'discount', matchType: 'phrase', decision: 'pending' },
        ],
      }],
    })
    mockPayload.update.mockResolvedValue({ id: 22 })

    const res = await savePOST(request('/api/monthly-keyword-selection/save', {
      clientId: 7,
      selections: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'pending' }],
      deletions: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 1 }],
    }))

    expect(res.status).toBe(200)
    const saved = mockPayload.update.mock.calls[0][0].data.selections
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ rowIndex: 0, negativeKeyword: 'cheap' })
  })

  it('save bails on empty input (no selections, no deletions) without touching the doc', async () => {
    const res = await savePOST(request('/api/monthly-keyword-selection/save', {
      clientId: 7,
      selections: [],
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true, skipped: 'empty-input' })
    // Guard 2: must not even read or write the doc.
    expect(mockPayload.find).not.toHaveBeenCalled()
    expect(mockPayload.update).not.toHaveBeenCalled()
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('save refuses to clear a populated array when the merge would empty it', async () => {
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'approved' },
        ],
      }],
    })

    // Only a deletion that removes the sole existing row, no incoming upserts:
    // the resulting array is empty while the stored doc had rows -> abort.
    const res = await savePOST(request('/api/monthly-keyword-selection/save', {
      clientId: 7,
      deletions: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0 }],
    }))

    expect(res.status).toBe(409)
    expect(mockPayload.update).not.toHaveBeenCalled()
  })

  it('apply stamps each sub-row of a term independently by rowIndex', async () => {
    mockPayload.findByID.mockResolvedValue({ id: 3, client: 7, keywords: [] })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'approved' },
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 1, negativeKeyword: 'discount', matchType: 'phrase', decision: 'approved' },
        ],
      }],
    })
    mockPayload.update.mockResolvedValue({ id: 22 })

    const res = await applyPOST(request('/api/monthly-keyword-selection/apply', {
      clientId: 7,
      selections: [
        { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', appliedToNKL: 3 },
        { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 1, negativeKeyword: 'discount', matchType: 'phrase', appliedToNKL: 3 },
      ],
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, applied: 2 })
    const selectionUpdate = mockPayload.update.mock.calls.find((c: any[]) => c[0].collection === 'monthly-keyword-selections')
    const saved = selectionUpdate[0].data.selections
    expect(saved).toHaveLength(2)
    expect(saved.every((s: any) => s.appliedToNKL === 3 && s.appliedAt)).toBe(true)
    expect(saved.map((s: any) => s.rowIndex).sort()).toEqual([0, 1])
  })

  it('apply merges approved selections into the target NKL and stamps matching rows', async () => {
    mockPayload.findByID.mockResolvedValue({
      id: 3,
      client: 7,
      keywords: [{ keyword: 'existing', matchType: 'exact', flaggedForRemoval: false }],
    })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', negativeKeyword: 'cheap', matchType: 'phrase', decision: 'approved' }],
      }],
    })
    mockPayload.update.mockResolvedValue({ id: 22 })

    const res = await applyPOST(request('/api/monthly-keyword-selection/apply', {
      clientId: 7,
      nklId: 3,
      selections: [{ negativeKeyword: 'cheap', matchType: 'phrase' }, { negativeKeyword: 'existing', matchType: 'exact' }],
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, applied: 1, skipped: 1 })
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'negative-keyword-lists',
      id: 3,
      data: { keywords: expect.arrayContaining([expect.objectContaining({ keyword: 'cheap', matchType: 'phrase' })]) },
    }))
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'monthly-keyword-selections',
      id: 22,
      data: { selections: [expect.objectContaining({ appliedToNKL: 3, decision: 'approved' })] },
    }))
  })

  it('complete toggles reviewComplete and stamps the authenticated user', async () => {
    mockPayload.find.mockResolvedValue({ docs: [{ id: 5 }] })
    mockPayload.update.mockResolvedValue({ id: 5, reviewCompletedAt: '2026-06-04T00:00:00.000Z' })

    const res = await completePOST(request('/api/monthly-keyword-selection/complete', {
      clientId: 7,
      yearMonth: '2026-05',
      complete: true,
    }))

    expect(res.status).toBe(200)
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'monthly-keyword-terms-cache',
      id: 5,
      data: expect.objectContaining({ reviewComplete: true, reviewCompletedBy: 9 }),
    }))
  })

  it('revise update moves a negative between NKLs and repoints the selection', async () => {
    // selection doc lookup
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [{
          yearMonth: '2026-05',
          searchTerm: 'cheap widgets',
          negativeKeyword: 'cheap',
          matchType: 'exact',
          decision: 'approved',
          appliedToNKL: 3,
          appliedAt: '2026-05-01T00:00:00.000Z',
          appliedBy: 'Original Reviewer',
          appliedByUserId: '99',
        }],
      }],
    })
    // old NKL (id 3) then new NKL (id 4)
    mockPayload.findByID.mockImplementation(({ id }: { id: number | string }) => {
      if (String(id) === '3') return Promise.resolve({ id: 3, client: 7, keywords: [{ keyword: 'cheap', matchType: 'exact', flaggedForRemoval: false }] })
      if (String(id) === '4') return Promise.resolve({ id: 4, client: 7, keywords: [] })
      return Promise.resolve(null)
    })
    mockPayload.update.mockResolvedValue({ id: 1 })

    const res = await revisePOST(request('/api/monthly-keyword-selection/revise', {
      clientId: 7,
      yearMonth: '2026-05',
      searchTerm: 'cheap widgets',
      action: 'update',
      newKeyword: 'cheap',
      newMatchType: 'exact',
      newNklId: 4,
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, moved: true })
    // removed from old list (3) -> empty keywords
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'negative-keyword-lists',
      id: '3',
      data: { keywords: [] },
    }))
    // added to new list (4)
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'negative-keyword-lists',
      id: '4',
      data: { keywords: [expect.objectContaining({ keyword: 'cheap', matchType: 'exact', flaggedForRemoval: false })] },
    }))
    // selection repointed to new NKL, submitter preserved
    expect(mockPayload.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'monthly-keyword-selections',
      id: 22,
      data: { selections: [expect.objectContaining({ appliedToNKL: '4', decision: 'approved', appliedBy: 'Original Reviewer', appliedByUserId: '99' })] },
    }))
  })

  it('clear is admin-only and wipes the client terms cache', async () => {
    mockPayload.delete.mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }] })

    const res = await clearPOST(request('/api/monthly-keyword-selection/clear', { clientId: 7 }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.deleted).toBe(2)
    expect(mockPayload.delete).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'monthly-keyword-terms-cache',
      where: { client: { equals: 7 } },
    }))
  })
})
