import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const payload = { auth: vi.fn(), findByID: vi.fn() }
const list = vi.fn()
// The real permission check runs; only Payload and Stripe are stubbed.
vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ invoices: { list } }) }))

const route = () => import('@/app/(frontend)/api/clients/[id]/hosting-payments/route')
const call = async (id = '8') =>
  (await route()).GET(new NextRequest(`http://localhost/api/clients/${id}/hosting-payments`), {
    params: Promise.resolve({ id }),
  })

function asyncList<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      yield* items
    },
  }
}

const invoice = (id: string, paidAt: number, extra: Record<string, unknown> = {}) => ({
  id,
  status: 'paid',
  amount_paid: 9900,
  currency: 'aud',
  period_start: paidAt,
  period_end: paidAt,
  metadata: {},
  status_transitions: { paid_at: paidAt },
  parent: { subscription_details: { subscription: 'sub_123' } },
  lines: { data: [{ period: { start: paidAt, end: paidAt + 2_592_000 } }] },
  ...extra,
})

describe('GET /api/clients/[id]/hosting-payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    payload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    payload.findByID.mockResolvedValue({
      id: 8,
      hostingSubscription: { stripeSubscriptionId: 'sub_123', stripeCustomerId: 'cus_9' },
    })
    list.mockReturnValue(
      asyncList([
        invoice('in_old', 1_750_000_000),
        invoice('in_new', 1_760_000_000),
        // One-off: payment-mode checkout, no subscription parent.
        invoice('in_once', 1_765_000_000, {
          parent: null,
          metadata: { hostingOneOffPaymentId: '4' },
        }),
      ]),
    )
  })

  it.each([
    { name: 'anonymous visitors', user: null },
    { name: 'staff without the clients feature', user: { id: 2, role: 'user', featureAccess: [] } },
  ])('refuses $name', async ({ user }) => {
    payload.auth.mockResolvedValue({ user })
    const response = await call()
    expect(response.status).toBe(403)
    expect(list).not.toHaveBeenCalled()
  })

  it('rejects an invalid id', async () => {
    const response = await call('8;drop')
    expect(response.status).toBe(400)
    expect(payload.findByID).not.toHaveBeenCalled()
  })

  it('returns an empty list when the client has no Stripe ids', async () => {
    payload.findByID.mockResolvedValue({ id: 8, hostingSubscription: {} })
    const response = await call()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ payments: [], count: 0, totalPaidCents: 0 })
    expect(list).not.toHaveBeenCalled()
  })

  it('lists paid subscription invoices newest first, excluding one-offs', async () => {
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=60')
    expect(list).toHaveBeenCalledWith({ customer: 'cus_9', status: 'paid', limit: 100 })
    const body = await response.json()
    expect(body.count).toBe(2)
    expect(body.totalPaidCents).toBe(19800)
    expect(body.payments.map((p: { invoiceId: string }) => p.invoiceId)).toEqual([
      'in_new',
      'in_old',
    ])
    expect(body.payments[0]).toMatchObject({
      amountPaidCents: 9900,
      currency: 'aud',
      status: 'paid',
      paidAt: new Date(1_760_000_000_000).toISOString(),
    })
  })

  it('filters by subscription when there is no customer id', async () => {
    payload.findByID.mockResolvedValue({
      id: 8,
      hostingSubscription: { stripeSubscriptionId: 'sub_123' },
    })
    await call()
    expect(list).toHaveBeenCalledWith({ subscription: 'sub_123', status: 'paid', limit: 100 })
  })

  it('returns 502 when Stripe fails', async () => {
    list.mockImplementation(() => {
      throw Object.assign(new Error('boom'), { type: 'StripeConnectionError' })
    })
    const response = await call()
    expect(response.status).toBe(502)
  })
})
