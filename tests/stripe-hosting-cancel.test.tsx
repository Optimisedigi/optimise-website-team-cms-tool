import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CancelPage from '@/app/(frontend)/hosting-pay/cancel/page'
import { createHostingCheckout } from '@/lib/stripe'

const createCustomer = vi.fn()
const createSession = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn(function StripeMock() {
    return {
      customers: { create: createCustomer },
      checkout: { sessions: { create: createSession } },
    }
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_cancel_test'
  process.env.CMS_URL = 'http://localhost:3004'
  createCustomer.mockResolvedValue({ id: 'cus_test' })
  createSession.mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.test/session' })
})

describe('hosting Checkout cancellation', () => {
  it('gives Stripe a safely encoded cancel URL that returns to the payment link', async () => {
    await createHostingCheckout({
      clientId: '42',
      offerId: '99',
      email: 'billing@example.com',
      idempotencyKey: 'checkout-test',
      billingStart: {},
      returnToPaymentLink: '/hosting-pay/token with spaces?x=1&y=2',
      quote: {
        currency: 'aud',
        interval: 'month',
        planName: 'Website Hosting',
        allowance: '10GB',
        clause: 'Terms',
        baseCents: 10000,
        surchargeCents: 200,
        totalCents: 10200,
      },
    })

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_url:
          'http://localhost:3004/hosting-pay/cancel?return_to=%2Fhosting-pay%2Ftoken%20with%20spaces%3Fx%3D1%26y%3D2',
      }),
      expect.anything(),
    )
  })

  it.each([
    { interval: 'month' as const, billingStart: {} },
    {
      interval: 'year' as const,
      billingStart: { billing_cycle_anchor: 1_790_000_000, proration_behavior: 'none' as const },
    },
    { interval: 'month' as const, billingStart: { trial_end: 1_800_000_000 } },
  ])('passes the billing start schedule to Stripe unchanged ($interval)', async ({ interval, billingStart }) => {
    await createHostingCheckout({
      clientId: '42',
      offerId: '99',
      email: 'billing@example.com',
      idempotencyKey: 'checkout-test',
      billingStart,
      quote: {
        currency: 'aud',
        interval,
        planName: 'Website Hosting',
        allowance: '10GB',
        clause: 'Terms',
        baseCents: 10000,
        surchargeCents: 0,
        totalCents: 10000,
      },
    })

    const subscriptionData = createSession.mock.calls[0]?.[0]?.subscription_data
    expect(subscriptionData).toEqual({
      metadata: { cmsClientId: '42', hostingOfferId: '99' },
      ...billingStart,
    })
    // No first payment, so no note and a single plan line.
    expect(createSession.mock.calls[0]?.[0]?.custom_text).toBeUndefined()
    expect(createSession.mock.calls[0]?.[0]?.line_items).toHaveLength(1)
  })

  it('adds the full price for a past start date as a one-time charge, with the plan waiting until renewal', async () => {
    await createHostingCheckout({
      clientId: '42',
      offerId: '99',
      email: 'billing@example.com',
      idempotencyKey: 'checkout-test',
      billingStart: { trial_end: 1_820_000_000 },
      firstPayment: { paidUntil: '14 September 2027' },
      quote: {
        currency: 'aud',
        interval: 'year',
        planName: 'Website Hosting',
        allowance: '10GB',
        clause: 'Terms',
        baseCents: 39000,
        surchargeCents: 0,
        totalCents: 39000,
      },
    })

    const params = createSession.mock.calls[0]?.[0]
    const metadata = { cmsClientId: '42', hostingOfferId: '99' }
    expect(params?.subscription_data).toEqual({ metadata, trial_end: 1_820_000_000 })
    // Stripe calls the time before the first renewal a trial; the note says why.
    expect(params?.custom_text).toEqual({
      submit: {
        message:
          "You pay $390.00 today for hosting up to 14 September 2027. Your plan then renews at the same price on that date each year. Stripe shows the time until then as free because today's payment already covers it.",
      },
    })
    expect(params?.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: 39000,
          product_data: { name: 'Website Hosting, renews 14 September 2027', metadata },
          recurring: { interval: 'year' },
        },
      },
      {
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: 39000,
          product_data: { name: 'Website Hosting, up to 14 September 2027', metadata },
        },
      },
    ])
  })

  it('renders a return link only for an internal hosting payment path', async () => {
    render(await CancelPage({ searchParams: Promise.resolve({ return_to: '/hosting-pay/valid-token' }) }))

    expect(screen.getByRole('link', { name: 'Return to payment link' })).toHaveAttribute(
      'href',
      '/hosting-pay/valid-token',
    )
  })

  it('rejects an external return destination instead of rendering an open redirect', async () => {
    render(await CancelPage({ searchParams: Promise.resolve({ return_to: 'https://evil.example' }) }))

    expect(screen.queryByRole('link', { name: 'Return to payment link' })).not.toBeInTheDocument()
    expect(
      screen.getByText(/Please return to your payment link or contact your Optimise Digital representative/i),
    ).toBeInTheDocument()
  })
})
