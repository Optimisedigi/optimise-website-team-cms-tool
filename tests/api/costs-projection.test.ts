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

import { GET } from '@/app/(frontend)/api/costs/projection/route'
import { NextRequest } from 'next/server'
import { monthKeysBetween } from '@/lib/finance/periods'

const req = (qs = '') => new NextRequest(`http://localhost:3001/api/costs/projection${qs}`)

const xeroMonth = (month: string) => ({ month, invoiced: 1000, received: 900, costs: 400, costsByAccount: [{ account: 'Software', amount: 400 }] })

describe('GET /api/costs/projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 18, 12)) // 18 Oct 2026
    mockPayload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    mockPayload.find.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'estimate-adjustments'
        ? { docs: [{ id: 3, month: '2026-11', kind: 'invoiced', amount: 500, description: 'Extra report', account: null }], totalDocs: 1 }
        : {
            docs: [{ id: 7, name: 'Acme', isActive: true, monthlyRetainer: 2000, clientStartDate: '2025-01-01T12:00:00.000Z' }],
            totalDocs: 1,
          },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('estimates the running calendar year from Xero plus retainers for the months left', async () => {
    mockFetchXero.mockResolvedValue({ ok: true, data: { months: monthKeysBetween('2026-01', '2026-10').map(xeroMonth), fetchedAt: 'x' } })

    const body = await (await GET(req('?from=2026-01&to=2026-12'))).json()

    // Xero up to this month; the cost average window (Apr–Sep) is inside the year.
    expect(mockFetchXero.mock.calls[0]?.[0]).toEqual({ from: '2026-01', to: '2026-10' })
    expect(body.available).toBe(true)
    expect(body.months.map((m: { kind: string }) => m.kind)).toEqual([...Array(9).fill('actual'), 'current', 'estimate', 'estimate'])
    expect(body.months[10]).toMatchObject({ month: '2026-11', invoiced: 2500, costs: 400 })
    expect(body.months[10].adjustments).toEqual([{ id: 3, month: '2026-11', kind: 'invoiced', amount: 500, description: 'Extra report', account: null }])
    expect(body.totals.invoiced).toBe(10 * 1000 + 1000 + 2 * 2000 + 500)
    const adjustmentsQuery = mockPayload.find.mock.calls.find(([args]) => args.collection === 'estimate-adjustments')?.[0]
    expect(adjustmentsQuery.where).toEqual({ month: { in: monthKeysBetween('2026-01', '2026-12') } })
    expect(body.clients).toEqual([{ id: 7, name: 'Acme', monthlyRetainer: 2000, restOfPeriod: 4000, startsOn: null, change: null }])
  })

  it('fetches the six months before this one when the financial year has just started', async () => {
    mockFetchXero.mockResolvedValue({ ok: true, data: { months: monthKeysBetween('2026-04', '2026-10').map(xeroMonth), fetchedAt: 'x' } })

    const body = await (await GET(req())).json()

    expect(mockFetchXero.mock.calls[0]?.[0]).toEqual({ from: '2026-04', to: '2026-10' })
    expect(body.from).toBe('2026-07')
    expect(body.to).toBe('2027-06')
    expect(body.months).toHaveLength(12)
    expect(body.costAverage.months).toEqual(monthKeysBetween('2026-04', '2026-09'))
  })

  it('still estimates when the manual estimates table is missing', async () => {
    mockFetchXero.mockResolvedValue({ ok: true, data: { months: monthKeysBetween('2026-01', '2026-10').map(xeroMonth), fetchedAt: 'x' } })
    mockPayload.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'estimate-adjustments') throw new Error('no such table: estimate_adjustments')
      return { docs: [], totalDocs: 0 }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const body = await (await GET(req('?from=2026-01&to=2026-12'))).json()

    expect(body.available).toBe(true)
    expect(body.months[10].adjustments).toEqual([])
    warn.mockRestore()
  })

  it('says why when Xero is unavailable instead of guessing', async () => {
    mockFetchXero.mockResolvedValue({ ok: false, reason: 'not_connected' })

    const body = await (await GET(req('?from=2026-01&to=2026-12'))).json()

    expect(body).toMatchObject({ available: false, reason: 'not_connected' })
    expect(body.months).toBeUndefined()
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

  it('returns 401 without a session and 403 without finance access', async () => {
    mockPayload.auth.mockResolvedValueOnce({ user: null })
    expect((await GET(req())).status).toBe(401)
    mockPayload.auth.mockResolvedValueOnce({ user: { id: 2, role: 'editor', features: [] } })
    expect((await GET(req())).status).toBe(403)
    expect(mockFetchXero).not.toHaveBeenCalled()
  })
})
