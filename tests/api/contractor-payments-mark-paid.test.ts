import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockPayload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}

vi.mock('payload', () => ({ getPayload: vi.fn(async () => mockPayload) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))

beforeEach(() => {
  vi.clearAllMocks()
  mockPayload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
})

describe('POST /api/contractor-payments/mark-paid', () => {
  it('rejects users without contractor cost access', async () => {
    mockPayload.auth.mockResolvedValue({ user: { id: 2, role: 'specialist', featureAccess: ['nav:invoices'] } })
    const { POST } = await import('@/app/(frontend)/api/contractor-payments/mark-paid/route')
    const response = await POST(new NextRequest('http://localhost/api/contractor-payments/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractorId: 1, fortnightStartDate: '2026-07-13' }),
    }))
    expect(response.status).toBe(403)
    expect(mockPayload.create).not.toHaveBeenCalled()
  })

  it('marks every approved fortnight entry paid so All Time Entries stays synchronized', async () => {
    const { POST } = await import('@/app/(frontend)/api/contractor-payments/mark-paid/route')
    const legacyEntry = {
      id: 28,
      user: 3,
      contractor: null,
      weekCommencing: '2026-07-13T00:00:00.000Z',
      status: 'approved',
    }
    mockPayload.findByID.mockResolvedValue({ id: 1, name: 'Lorenzo', email: null })
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: 3, name: 'Lorenzo', email: 'lorenzo@example.com' }] })
      .mockResolvedValueOnce({ docs: [legacyEntry] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ ...legacyEntry, contractor: 1 }] })
    mockPayload.update.mockResolvedValue({ ...legacyEntry, contractor: 1 })
    mockPayload.create.mockResolvedValue({ id: 77 })

    const response = await POST(new NextRequest('http://localhost/api/contractor-payments/mark-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractorId: 1, fortnightStartDate: '2026-07-13' }),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, paymentId: 77 })
    expect(mockPayload.update).toHaveBeenNthCalledWith(1, {
      collection: 'contractor-time-entries',
      id: 28,
      data: { contractor: 1 },
      overrideAccess: true,
    })
    expect(mockPayload.update).toHaveBeenNthCalledWith(2, {
      collection: 'contractor-time-entries',
      id: 28,
      data: { payment: 77, status: 'paid' },
      overrideAccess: true,
    })
    expect(mockPayload.find).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        collection: 'contractor-time-entries',
        pagination: false,
        where: {
          and: expect.arrayContaining([
            { contractor: { equals: 1 } },
            { status: { in: ['approved', 'submitted'] } },
          ]),
        },
      }),
    )
  })
})
