import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * A price change must use the frequency Stripe actually bills (what the client
 * picked at checkout), never the admin's default from the offer form.
 */

const payload = { auth: vi.fn(), findByID: vi.fn(), findGlobal: vi.fn(), update: vi.fn() }
const getHostingSubscriptionItems = vi.fn()
const sendBrevoEmail = vi.fn()
vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/brevo-email', () => ({
  sendBrevoEmail: (...args: unknown[]) => sendBrevoEmail(...args),
}))
vi.mock('@/lib/stripe', () => ({
  getHostingSubscriptionItems: (...args: unknown[]) => getHostingSubscriptionItems(...args),
}))

const renewal = new Date(Date.now() + 60 * 86_400_000).toISOString()

const schedule = async () => {
  const { POST } = await import('@/app/(frontend)/api/clients/[id]/hosting-price-changes/route')
  return POST(
    new NextRequest('http://localhost/api/clients/8/hosting-price-changes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        effectiveAt: renewal,
        monthlyBaseCents: 8900,
        annualBaseCents: 106800,
        reason: 'Capacity',
      }),
    }),
    { params: Promise.resolve({ id: '8' }) },
  )
}

const savedChange = () =>
  (
    payload.update.mock.calls[0]?.[0] as {
      data: { hostingSubscription: { priceChanges: Array<Record<string, any>> } }
    }
  ).data.hostingSubscription.priceChanges.at(-1)

describe('scheduling a hosting price change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    payload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
    payload.findGlobal.mockResolvedValue({
      currency: 'aud',
      cardSurchargePercentage: 0,
      cardSurchargeFixedCents: 0,
      minimumNoticeDays: 30,
      noticeEmailSubject: 'Price change',
      noticeEmailBody: '{{newPrice}}',
    })
    payload.findByID.mockResolvedValue({
      id: 8,
      name: 'We Can Quit',
      hostingSubscription: {
        stripeSubscriptionId: 'sub_1',
        currentPeriodEnd: renewal,
        // The admin's default was monthly; the client chose annual at checkout.
        billingInterval: 'month',
        planName: 'Essential',
        monthlyBaseCents: 7900,
        annualBaseCents: 94800,
        recipientEmail: 'billing@example.com',
      },
    })
    sendBrevoEmail.mockResolvedValue({ ok: true, messageId: 'msg_1' })
  })

  it('prices the change annually when Stripe bills the client annually', async () => {
    getHostingSubscriptionItems.mockResolvedValue({ hostingItemId: 'si_1', interval: 'year' })

    const response = await schedule()

    expect(response.status).toBe(200)
    expect(savedChange()?.newQuote).toMatchObject({ interval: 'year', baseCents: 106800 })
    expect(savedChange()?.oldQuote).toMatchObject({ interval: 'year', baseCents: 94800 })
  })

  it.each([
    {
      name: 'Stripe cannot be reached',
      setup: () => getHostingSubscriptionItems.mockRejectedValue(new Error('timeout')),
      status: 502,
    },
    {
      name: 'the frequency is unknown',
      setup: () => getHostingSubscriptionItems.mockResolvedValue({ hostingItemId: 'si_1' }),
      status: 422,
    },
  ])('schedules nothing and sends no notice when $name', async ({ setup, status }) => {
    setup()

    const response = await schedule()

    expect(response.status).toBe(status)
    expect(sendBrevoEmail).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })
})
