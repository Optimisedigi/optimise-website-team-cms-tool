import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { GET } from '@/app/(frontend)/api/costs/pnl/route'
import { NextRequest } from 'next/server'

const req = (qs = '') => new NextRequest(`http://localhost:3001/api/costs/pnl${qs}`)

const xeroMonth = (month: string) => ({ month, invoiced: 1000, received: 900, costs: 400, costsByAccount: [{ account: 'Software', amount: 400 }] })

describe('GET /api/costs/pnl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 18, 12)) // 18 Oct 2026
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a past financial year month by month from Xero, with the year total', async () => {
    const months = ['2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06']
    mockFetchXero.mockResolvedValue({ ok: true, data: { months: months.map(xeroMonth), fetchedAt: 'x' } })

    const body = await (await GET(req('?from=2024-07&to=2025-06'))).json()

    expect(mockFetchXero.mock.calls[0]?.[0]).toEqual({ from: '2024-07', to: '2025-06' })
    expect(body.source).toBe('xero')
    expect(body.months.map((m: { month: string }) => m.month)).toEqual(months)
    expect(body.totals.sales).toBe(12000)
    expect(body.totals.costs).toBe(4800)
    expect([body.from, body.to]).toEqual(['2024-07', '2025-06'])
  })

  it('stops the current financial year at this month', async () => {
    mockFetchXero.mockResolvedValue({ ok: true, data: { months: ['2026-07', '2026-08', '2026-09', '2026-10'].map(xeroMonth), fetchedAt: 'x' } })

    const body = await (await GET(req('?from=2026-07&to=2027-06'))).json()

    expect(mockFetchXero.mock.calls[0]?.[0]).toEqual({ from: '2026-07', to: '2026-10' })
    expect(body.months).toHaveLength(4)
    expect(body.to).toBe('2026-10')
  })

  it('defaults to the current financial year', async () => {
    mockFetchXero.mockResolvedValue({ ok: true, data: { months: ['2026-07', '2026-08', '2026-09', '2026-10'].map(xeroMonth), fetchedAt: 'x' } })

    await GET(req())

    expect(mockFetchXero.mock.calls[0]?.[0]).toEqual({ from: '2026-07', to: '2026-10' })
  })

  it('falls back to statements and client records for the same range when Xero is unavailable', async () => {
    mockFetchXero.mockResolvedValue({ ok: false, reason: 'error' })

    const body = await (await GET(req('?from=2025-01&to=2025-12'))).json()

    expect(body.source).toBe('bank')
    expect(body.months.map((m: { month: string }) => m.month)).toHaveLength(12)
    expect(body.months[0].month).toBe('2025-01')
  })

  it.each([
    ['?from=2026-7&to=2026-12'],
    ['?from=2026-07'],
    ['?from=2026-10&to=2026-07'],
    ['?from=2027-01&to=2027-06'],
    ['?from=2020-01&to=2026-10'],
  ])('rejects %s with 400 before calling Xero', async (qs) => {
    const res = await GET(req(qs))
    expect(res.status).toBe(400)
    expect(mockFetchXero).not.toHaveBeenCalled()
  })

  it('returns 401 without a session', async () => {
    mockPayload.auth.mockResolvedValue({ user: null })
    expect((await GET(req())).status).toBe(401)
    expect(mockFetchXero).not.toHaveBeenCalled()
  })
})
