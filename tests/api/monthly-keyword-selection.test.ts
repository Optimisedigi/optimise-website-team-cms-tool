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
