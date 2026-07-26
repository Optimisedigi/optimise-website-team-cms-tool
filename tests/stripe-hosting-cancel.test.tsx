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
