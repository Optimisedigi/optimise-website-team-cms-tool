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
import { POST as dismissReviewPOST } from '@/app/(frontend)/api/monthly-keyword-selection/dismiss-review/route'
import { GET as teammatesGET } from '@/app/(frontend)/api/monthly-keyword-selection/teammates/route'

function getRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'GET' })
}

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

  it('apply stamps an "added" outcome and notifies the flagger for a needs-review term', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 9, role: 'admin', name: 'Adder Amy' } })
    mockPayload.findByID.mockImplementation(({ collection, id }: { collection: string; id: number | string }) => {
      if (collection === 'negative-keyword-lists') return Promise.resolve({ id: 3, name: 'List A', client: 7, keywords: [] })
      if (collection === 'clients') return Promise.resolve({ name: 'Acme' })
      return Promise.resolve(null)
    })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'needs_review', decidedByUserId: '99', decidedBy: 'Flagger Fred' },
        ],
      }],
    })
    mockPayload.update.mockResolvedValue({ id: 22 })
    mockPayload.create.mockResolvedValue({ id: 1 })

    const res = await applyPOST(request('/api/monthly-keyword-selection/apply', {
      clientId: 7,
      comment: 'Clear waste — no conversions.',
      selections: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', appliedToNKL: 3 }],
    }))

    expect(res.status).toBe(200)
    const selectionUpdate = mockPayload.update.mock.calls.find((c: any[]) => c[0].collection === 'monthly-keyword-selections')
    const saved = selectionUpdate[0].data.selections
    expect(saved[0]).toMatchObject({
      decision: 'approved',
      outcomeType: 'added',
      outcomeDetail: 'added to List A (exact)',
      outcomeComment: 'Clear waste — no conversions.',
      outcomeBy: 'Adder Amy',
    })
    expect(saved[0].outcomeAt).toBeTruthy()
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'notifications',
      data: expect.objectContaining({ recipient: '99', kind: 'negative-keywords-needs-review' }),
    }))
  })

  it('apply logs no outcome and no notification for a normally-approved term', async () => {
    mockPayload.findByID.mockResolvedValue({ id: 3, name: 'List A', client: 7, keywords: [] })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'approved' },
        ],
      }],
    })
    mockPayload.update.mockResolvedValue({ id: 22 })

    const res = await applyPOST(request('/api/monthly-keyword-selection/apply', {
      clientId: 7,
      selections: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', appliedToNKL: 3 }],
    }))

    expect(res.status).toBe(200)
    const selectionUpdate = mockPayload.update.mock.calls.find((c: any[]) => c[0].collection === 'monthly-keyword-selections')
    const saved = selectionUpdate[0].data.selections
    expect(saved[0].outcomeType).toBeUndefined()
    // No notification — the only create is the apply's activity-log entry,
    // which credits both the reviewer and the applier.
    const createdCollections = mockPayload.create.mock.calls.map((c: any[]) => c[0].collection)
    expect(createdCollections).not.toContain('notifications')
    expect(createdCollections).toContain('activity-log')
    const activity = mockPayload.create.mock.calls.find((c: any[]) => c[0].collection === 'activity-log')
    expect(activity[0].data.description).toContain('Reviewed by:')
    expect(activity[0].data.description).toContain('Applied by:')
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
      data: { selections: [expect.objectContaining({ appliedToNKL: 4, decision: 'approved', appliedBy: 'Original Reviewer', appliedByUserId: '99' })] },
    }))
  })

  it('revise update stamps an "updated" outcome in place and notifies the submitter', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 9, role: 'admin', name: 'Editor Ed' } })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [{
          yearMonth: '2026-05', searchTerm: 'cheap widgets', negativeKeyword: 'cheap', matchType: 'exact',
          decision: 'approved', appliedToNKL: 3, appliedBy: 'Original Reviewer', appliedByUserId: '99',
        }],
      }],
    })
    mockPayload.findByID.mockImplementation(({ collection, id }: { collection: string; id: number | string }) => {
      if (collection === 'clients') return Promise.resolve({ name: 'Acme' })
      if (String(id) === '3') return Promise.resolve({ id: 3, name: 'List A', client: 7, keywords: [{ keyword: 'cheap', matchType: 'exact', flaggedForRemoval: false }] })
      return Promise.resolve(null)
    })
    mockPayload.update.mockResolvedValue({ id: 22 })
    mockPayload.create.mockResolvedValue({ id: 1 })

    const res = await revisePOST(request('/api/monthly-keyword-selection/revise', {
      clientId: 7, yearMonth: '2026-05', searchTerm: 'cheap widgets', action: 'update',
      newKeyword: 'cheap widget', newMatchType: 'phrase', comment: 'Tighter scope.',
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, notified: true })
    const selectionUpdate = mockPayload.update.mock.calls.find((c: any[]) => c[0].collection === 'monthly-keyword-selections')
    const saved = selectionUpdate[0].data.selections
    expect(saved[0]).toMatchObject({ outcomeType: 'updated', outcomeComment: 'Tighter scope.', outcomeBy: 'Editor Ed' })
    expect(saved[0].outcomeDetail).toContain('cheap → cheap widget')
    expect(saved[0].outcomeDetail).toContain('exact → phrase')
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'notifications',
      data: expect.objectContaining({ recipient: '99', kind: 'negative-keywords-removed' }),
    }))
  })

  it('revise move stamps a "moved" outcome with the list names', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 9, role: 'admin', name: 'Mover Mo' } })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [{
          yearMonth: '2026-05', searchTerm: 'cheap widgets', negativeKeyword: 'cheap', matchType: 'exact',
          decision: 'approved', appliedToNKL: 3, appliedBy: 'Original Reviewer', appliedByUserId: '99',
        }],
      }],
    })
    mockPayload.findByID.mockImplementation(({ collection, id }: { collection: string; id: number | string }) => {
      if (collection === 'clients') return Promise.resolve({ name: 'Acme' })
      if (String(id) === '3') return Promise.resolve({ id: 3, name: 'List A', client: 7, keywords: [{ keyword: 'cheap', matchType: 'exact', flaggedForRemoval: false }] })
      if (String(id) === '4') return Promise.resolve({ id: 4, name: 'List B', client: 7, keywords: [] })
      return Promise.resolve(null)
    })
    mockPayload.update.mockResolvedValue({ id: 22 })
    mockPayload.create.mockResolvedValue({ id: 1 })

    const res = await revisePOST(request('/api/monthly-keyword-selection/revise', {
      clientId: 7, yearMonth: '2026-05', searchTerm: 'cheap widgets', action: 'update',
      newKeyword: 'cheap', newMatchType: 'exact', newNklId: 4,
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, moved: true, notified: true })
    const selectionUpdate = mockPayload.update.mock.calls.find((c: any[]) => c[0].collection === 'monthly-keyword-selections')
    const saved = selectionUpdate[0].data.selections
    expect(saved[0]).toMatchObject({ outcomeType: 'moved', outcomeDetail: 'List A → List B', outcomeBy: 'Mover Mo' })
  })

  it('save stamps the authenticated decider when a non-pending decision is set', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 42, role: 'admin', name: 'Decider Dan' } })
    mockPayload.find.mockResolvedValue({ docs: [{ id: 22, selections: [] }] })
    mockPayload.update.mockResolvedValue({ id: 22 })

    const res = await savePOST(request('/api/monthly-keyword-selection/save', {
      clientId: 7,
      selections: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', negativeKeyword: 'cheap', matchType: 'exact', decision: 'needs_review' }],
    }))

    expect(res.status).toBe(200)
    const saved = mockPayload.update.mock.calls[0][0].data.selections
    expect(saved[0]).toMatchObject({ decision: 'needs_review', decidedByUserId: '42', decidedBy: 'Decider Dan' })
  })

  it('save does not stamp a decider for a pending decision', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 42, role: 'admin', name: 'Decider Dan' } })
    mockPayload.find.mockResolvedValue({ docs: [{ id: 22, selections: [] }] })
    mockPayload.update.mockResolvedValue({ id: 22 })

    const res = await savePOST(request('/api/monthly-keyword-selection/save', {
      clientId: 7,
      selections: [{ yearMonth: '2026-05', searchTerm: 'cheap widgets', negativeKeyword: 'cheap', matchType: 'exact', decision: 'pending' }],
    }))

    expect(res.status).toBe(200)
    const saved = mockPayload.update.mock.calls[0][0].data.selections
    expect(saved[0].decidedByUserId).toBeUndefined()
  })

  it('dismiss-review resolves the matched term as skipped and retains the comment', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 9, role: 'admin', name: 'Reviewer Rita' } })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'needs_review', decidedByUserId: '99', decidedBy: 'Flagger Fred' },
        ],
      }],
    })
    mockPayload.findByID.mockResolvedValue({ name: 'Acme' })
    mockPayload.update.mockResolvedValue({ id: 22 })
    mockPayload.create.mockResolvedValue({ id: 1 })

    const res = await dismissReviewPOST(request('/api/monthly-keyword-selection/dismiss-review', {
      clientId: 7, yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, comment: 'Not waste — converts well.',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true, notified: 1 })
    const saved = mockPayload.update.mock.calls[0][0].data.selections
    expect(saved[0]).toMatchObject({ decision: 'skipped', reviewComment: 'Not waste — converts well.', reviewDismissedBy: 'Reviewer Rita' })
    expect(saved[0].reviewDismissedAt).toBeTruthy()
    // notifies the auto-tracked original handler
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'notifications',
      data: expect.objectContaining({ recipient: '99', kind: 'negative-keywords-needs-review' }),
    }))
  })

  it('dismiss-review works without a comment and still notifies the flagger', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 9, role: 'admin', name: 'Reviewer Rita' } })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'needs_review', decidedByUserId: '99', decidedBy: 'Flagger Fred' },
        ],
      }],
    })
    mockPayload.findByID.mockResolvedValue({ name: 'Acme' })
    mockPayload.update.mockResolvedValue({ id: 22 })
    mockPayload.create.mockResolvedValue({ id: 1 })

    const res = await dismissReviewPOST(request('/api/monthly-keyword-selection/dismiss-review', {
      clientId: 7, yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, comment: '   ',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true, notified: 1 })
    const saved = mockPayload.update.mock.calls[0][0].data.selections
    expect(saved[0]).toMatchObject({ decision: 'skipped', reviewDismissedBy: 'Reviewer Rita' })
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'notifications',
      data: expect.objectContaining({ recipient: '99' }),
    }))
  })

  it('dismiss-review skips notifying the dismisser themselves', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 99, role: 'admin', name: 'Flagger Fred' } })
    mockPayload.find.mockResolvedValue({
      docs: [{
        id: 22,
        selections: [
          { yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, negativeKeyword: 'cheap', matchType: 'exact', decision: 'needs_review', decidedByUserId: '99', decidedBy: 'Flagger Fred' },
        ],
      }],
    })
    mockPayload.update.mockResolvedValue({ id: 22 })

    const res = await dismissReviewPOST(request('/api/monthly-keyword-selection/dismiss-review', {
      clientId: 7, yearMonth: '2026-05', searchTerm: 'cheap widgets', rowIndex: 0, comment: 'My own call.',
    }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.notified).toBe(0)
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('teammates returns the gated user list mapped to id + label', async () => {
    mockPayload.find.mockResolvedValue({ docs: [
      { id: 1, name: 'Alice' },
      { id: 2, email: 'bob@example.com' },
      { id: 3 },
    ] })

    const res = await teammatesGET(getRequest('/api/monthly-keyword-selection/teammates'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.teammates).toEqual([
      { id: '1', label: 'Alice' },
      { id: '2', label: 'bob@example.com' },
      { id: '3', label: 'User 3' },
    ])
    expect(mockPayload.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'users', overrideAccess: true }))
  })

  it('teammates is unauthorized without a user', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })
    const res = await teammatesGET(getRequest('/api/monthly-keyword-selection/teammates'))
    expect(res.status).toBe(401)
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
