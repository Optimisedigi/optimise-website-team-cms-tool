import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const payload = { auth: vi.fn(), findByID: vi.fn(), update: vi.fn() }
const stopHostingSubscription = vi.fn()
// The real permission check runs; only Payload and Stripe are stubbed.
vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/stripe', () => ({
  stopHostingSubscription: (...args: unknown[]) => stopHostingSubscription(...args),
}))

const params = { params: Promise.resolve({ id: '8' }) }
const request = (body: string, contentType: string) =>
  new NextRequest('http://localhost/api/clients/8/hosting-subscription/stop', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })

describe('POST /api/clients/[id]/hosting-subscription/stop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    payload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    payload.findByID.mockResolvedValue({
      id: 8,
      hostingSubscription: { stripeSubscriptionId: 'sub_123', subscriptionStatus: 'active' },
    })
    stopHostingSubscription.mockResolvedValue({
      status: 'active',
      cancel_at_period_end: true,
      items: { data: [{ current_period_end: 1_793_498_400 }] },
    })
  })

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'])(
    'refuses a %s body so a cross-site form cannot stop a subscription',
    async (contentType) => {
      const { POST } =
        await import('@/app/(frontend)/api/clients/[id]/hosting-subscription/stop/route')

      const response = await POST(request('{"action":"immediately"}', contentType), params)

      expect(response.status).toBe(415)
      expect(stopHostingSubscription).not.toHaveBeenCalled()
    },
  )

  it.each([
    { name: 'anonymous visitors', user: null },
    {
      name: 'staff who can edit clients but not billing',
      user: { id: 2, role: 'user', featureAccess: ['clients'] },
    },
  ])('refuses $name', async ({ user }) => {
    payload.auth.mockResolvedValue({ user })
    const { POST } =
      await import('@/app/(frontend)/api/clients/[id]/hosting-subscription/stop/route')

    const response = await POST(request('{"action":"immediately"}', 'application/json'), params)

    expect(response.status).toBe(403)
    expect(stopHostingSubscription).not.toHaveBeenCalled()
  })

  it('lets non-admin staff with billing permission stop payments', async () => {
    payload.auth.mockResolvedValue({
      user: { id: 3, role: 'user', featureAccess: ['clients', 'hosting-billing-settings'] },
    })
    const { POST } =
      await import('@/app/(frontend)/api/clients/[id]/hosting-subscription/stop/route')

    const response = await POST(request('{"action":"end_of_period"}', 'application/json'), params)

    expect(response.status).toBe(200)
  })

  it('schedules the stop in Stripe and saves the result for an authorised JSON request', async () => {
    const { POST } =
      await import('@/app/(frontend)/api/clients/[id]/hosting-subscription/stop/route')

    const response = await POST(request('{"action":"end_of_period"}', 'application/json'), params)

    expect(response.status).toBe(200)
    expect(stopHostingSubscription).toHaveBeenCalledWith('sub_123', 'end_of_period')
    expect(await response.json()).toMatchObject({ cancelAtPeriodEnd: true })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 8,
        data: { hostingSubscription: expect.objectContaining({ cancelAtPeriodEnd: true }) },
      }),
    )
  })
})
