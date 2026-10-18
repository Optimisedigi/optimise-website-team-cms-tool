import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

const mockFetchXero = vi.hoisted(() => vi.fn())
vi.mock('@/lib/finance/xero-finance', () => ({
  fetchXeroMonthlyFinance: mockFetchXero,
}))

import { GET } from '@/app/(frontend)/api/costs/route'
import { NextRequest } from 'next/server'

const req = (qs = '') => new NextRequest(`http://localhost:3001/api/costs${qs}`)

const xeroData = {
  months: [
    { month: '2026-09', invoiced: 0, received: 0, costs: 500, costsByAccount: [{ account: 'Software', amount: 500 }] },
    { month: '2026-10', invoiced: 0, received: 0, costs: 650, costsByAccount: [{ account: 'Software', amount: 650 }] },
  ],
  fetchedAt: '2026-10-18T03:00:00.000Z',
}

describe('GET /api/costs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 })
  })

  it('serves Xero costs for the selected month without reading imported statements', async () => {
    mockFetchXero.mockResolvedValue({ ok: true, data: xeroData })

    const res = await GET(req('?month=2026-10'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.source).toBe('xero')
    expect(body.totalThisMonth).toBe(650)
    expect(body.totalLastMonth).toBe(500)
    expect(body.costsByCategory[0].category.name).toBe('Software')
    const collections = mockPayload.find.mock.calls.map(([args]) => args.collection)
    expect(collections).toEqual(['cost-categories'])
  })

  it('falls back to imported statements and says why when Xero is unavailable', async () => {
    mockFetchXero.mockResolvedValue({ ok: false, reason: 'scope_missing' })

    const body = await (await GET(req('?month=2026-10'))).json()

    expect(body.source).toBe('bank')
    expect(body.xeroUnavailable).toBe('scope_missing')
    expect(mockPayload.find.mock.calls.map(([args]) => args.collection)).toContain('business-costs')
  })

  it('falls back when Xero has no data for an older selected month', async () => {
    mockFetchXero.mockResolvedValue({ ok: true, data: xeroData })

    const body = await (await GET(req('?month=2024-01'))).json()

    expect(body.source).toBe('bank')
    expect(body.xeroUnavailable).toBeUndefined()
  })

  it('skips Xero entirely when the imported CSV view is requested', async () => {
    const body = await (await GET(req('?month=2026-10&source=bank'))).json()

    expect(mockFetchXero).not.toHaveBeenCalled()
    expect(body.source).toBe('bank')
  })

  it('rejects a malformed month', async () => {
    const res = await GET(req('?month=October'))
    expect(res.status).toBe(400)
    expect(mockFetchXero).not.toHaveBeenCalled()
  })

  it('returns 401 without a session and never calls Xero', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(mockFetchXero).not.toHaveBeenCalled()
  })
})
