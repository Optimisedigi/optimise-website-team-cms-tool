import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildOneOffPaymentEmail,
  createOneOffQuote,
  parseOneOffRequest,
  type OneOffSnapshot,
} from '@/lib/hosting-one-off-payment'
import { createHostingOneOffCheckout, getStripePublishableKey } from '@/lib/stripe'

const createSession = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn(function StripeMock() {
    return { checkout: { sessions: { create: createSession } } }
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_one_off'
  process.env.CMS_URL = 'http://localhost:3004'
  createSession.mockResolvedValue({ id: 'cs_once', url: 'https://checkout.stripe.test/once' })
})

describe('parseOneOffRequest', () => {
  it.each([
    [
      { description: '  Backdated hosting  ', amount: 297 },
      { ok: true, value: { description: 'Backdated hosting', baseCents: 29700 } },
    ],
    [
      { description: 'Hosting', amount: '99.95' },
      { ok: true, value: { description: 'Hosting', baseCents: 9995 } },
    ],
    [
      { description: '', amount: 10 },
      { ok: false, error: 'Describe what the payment is for.' },
    ],
    [
      { description: 'Hosting', amount: 0 },
      { ok: false, error: 'Enter an amount above $0.' },
    ],
    [
      { description: 'Hosting', amount: -5 },
      { ok: false, error: 'Enter an amount above $0.' },
    ],
    [
      { description: 'Hosting', amount: 'abc' },
      { ok: false, error: 'Enter an amount above $0.' },
    ],
    [
      { description: 'Hosting', amount: 10.005 },
      { ok: false, error: 'Use at most two decimal places for the amount.' },
    ],
    [
      { description: 'Hosting', amount: 50_000.01 },
      { ok: false, error: 'One-off payments are limited to $50,000.00.' },
    ],
    [
      { description: 'x'.repeat(201), amount: 10 },
      { ok: false, error: 'Keep the description under 200 characters.' },
    ],
    [null, { ok: false, error: 'Describe what the payment is for.' }],
  ])('%j', (body, expected) => {
    expect(parseOneOffRequest(body)).toEqual(expected)
  })
})

describe('createOneOffQuote', () => {
  it('adds the same grossed-up card surcharge as hosting subscriptions', () => {
    // ceil((29700 + 30) / (1 - 0.0175)) - 29700 = 560
    expect(createOneOffQuote(29700, 'AUD', { percentage: 1.75, fixedCents: 30 })).toEqual({
      currency: 'aud',
      baseCents: 29700,
      surchargeCents: 560,
      totalCents: 30260,
    })
  })
})

describe('buildOneOffPaymentEmail', () => {
  const snapshot: OneOffSnapshot = {
    description: 'Backdated hosting <July–Sept>',
    quote: { currency: 'aud', baseCents: 29700, surchargeCents: 560, totalCents: 30260 },
    recipientEmail: 'billing@example.com',
    recipientName: 'Sam',
  }
  const build = (overrides: Partial<OneOffSnapshot> = {}) =>
    buildOneOffPaymentEmail({
      clientName: 'We Can Quit',
      snapshot: { ...snapshot, ...overrides },
      url: 'https://cms.test/hosting-pay/once/abc',
      expiresAt: '2026-10-16T00:00:00.000Z',
      logoUrl: 'https://cms.test/brand/optimise-digital-logo.png',
      signOff: { signOff: 'Thanks,', senderName: 'Accounts', signatureHtml: '<b>OD</b>' },
    })

  it('itemises the amount, surcharge and total, and says it is not recurring', () => {
    const { subject, textContent } = build()

    expect(subject).toBe('Payment request from Optimise Digital: Backdated hosting <July–Sept>')
    expect(textContent).toContain('Backdated hosting <July–Sept>: $297.00')
    expect(textContent).toContain('Card processing surcharge: $5.60')
    expect(textContent).toContain('Total: $302.60')
    expect(textContent).toContain('does not set up any recurring charge')
    expect(textContent).toContain('Pay $302.60 securely: https://cms.test/hosting-pay/once/abc')
    expect(textContent).toContain('One-off payment · Card, Apple Pay, Google Pay')
    expect(textContent).toContain('16 October 2026')
    expect(textContent).toContain('Thanks,\nAccounts')
  })

  it('follows the approved design: logo header, pay button, fallback link and sign-off', () => {
    const { htmlContent } = build()

    expect(htmlContent).toContain(
      '<img src="https://cms.test/brand/optimise-digital-logo.png" alt="Optimise Digital" height="26"',
    )
    // Two links to the payment page: the button and the copyable fallback.
    expect(htmlContent.match(/href="https:\/\/cms\.test\/hosting-pay\/once\/abc"/g)).toHaveLength(2)
    expect(htmlContent).toContain('>Pay $302.60 securely</a>')
    expect(htmlContent).toContain('background:#141414;border-radius:8px;')
    expect(htmlContent).toContain('<p style="margin:0 0 14px;">Accounts</p>')
  })

  it('omits the surcharge line when there is no surcharge', () => {
    const { textContent } = build({
      quote: { currency: 'aud', baseCents: 29700, surchargeCents: 0, totalCents: 29700 },
    })

    expect(textContent).not.toContain('surcharge')
    expect(textContent).toContain('Total: $297.00')
  })

  it('escapes the description in HTML and keeps the statement signature', () => {
    const { htmlContent } = build()

    expect(htmlContent).toContain('Backdated hosting &lt;July–Sept&gt;')
    expect(htmlContent).not.toContain('<July–Sept>')
    expect(htmlContent).toContain('<b>OD</b>')
  })
})

describe('createHostingOneOffCheckout', () => {
  const base = {
    clientId: '8',
    paymentId: '31',
    email: 'billing@example.com',
    description: 'Backdated hosting',
    currency: 'aud',
    totalCents: 30260,
    idempotencyKey: 'once-key',
    returnToPaymentLink: '/hosting-pay/once/tok',
  }

  it('opens a single card payment, never a subscription', async () => {
    await createHostingOneOffCheckout(base)

    const [params, options] = createSession.mock.calls[0] ?? []
    expect(params.mode).toBe('payment')
    expect(params).not.toHaveProperty('subscription_data')
    expect(params.customer_email).toBe('billing@example.com')
    expect(params.metadata).toEqual({ cmsClientId: '8', hostingOneOffPaymentId: '31' })
    expect(params.payment_intent_data.metadata).toEqual({
      cmsClientId: '8',
      hostingOneOffPaymentId: '31',
    })
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: 30260,
          product_data: {
            name: 'Backdated hosting',
            metadata: { cmsClientId: '8', hostingOneOffPaymentId: '31' },
          },
        },
      },
    ])
    expect(params.cancel_url).toBe(
      'http://localhost:3004/hosting-pay/cancel?return_to=%2Fhosting-pay%2Fonce%2Ftok',
    )
    expect(options).toEqual({ idempotencyKey: 'once-key' })
  })

  it("reuses the client's existing Stripe customer when there is one", async () => {
    await createHostingOneOffCheckout({ ...base, customerId: 'cus_existing' })

    const [params] = createSession.mock.calls[0] ?? []
    expect(params.customer).toBe('cus_existing')
    expect(params).not.toHaveProperty('customer_email')
  })

  it('opens an embedded card form that never redirects away from the payment page', async () => {
    await createHostingOneOffCheckout({ ...base, ui: 'embedded' })

    const [params] = createSession.mock.calls[0] ?? []
    expect(params.mode).toBe('payment')
    expect(params.ui_mode).toBe('embedded_page')
    expect(params.redirect_on_completion).toBe('never')
    expect(params).not.toHaveProperty('success_url')
    expect(params).not.toHaveProperty('cancel_url')
    expect(params.metadata).toEqual({ cmsClientId: '8', hostingOneOffPaymentId: '31' })
  })

  it('opens an in-page card session that returns to the payment link only if a method needs it', async () => {
    await createHostingOneOffCheckout({ ...base, ui: 'elements' })

    const [params] = createSession.mock.calls[0] ?? []
    expect(params.mode).toBe('payment')
    expect(params.ui_mode).toBe('elements')
    expect(params.return_url).toBe('http://localhost:3004/hosting-pay/once/tok')
    expect(params).not.toHaveProperty('success_url')
    expect(params).not.toHaveProperty('cancel_url')
    expect(params).not.toHaveProperty('redirect_on_completion')
  })
})

describe('getStripePublishableKey', () => {
  const withEnv = (publishable: string | undefined, secret: string) => {
    if (publishable === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY
    else process.env.STRIPE_PUBLISHABLE_KEY = publishable
    process.env.STRIPE_SECRET_KEY = secret
    return getStripePublishableKey()
  }

  it.each([
    ['matching live keys', 'pk_live_abc123', 'sk_live_xyz', 'pk_live_abc123'],
    ['matching test keys', ' pk_test_abc123 ', 'sk_test_xyz', 'pk_test_abc123'],
    ['a restricted live secret', 'pk_live_abc123', 'rk_live_xyz', 'pk_live_abc123'],
    ['no publishable key (keeps the Stripe page)', undefined, 'sk_live_xyz', null],
    ['a test key against a live secret', 'pk_test_abc123', 'sk_live_xyz', null],
    ['a live key against a test secret', 'pk_live_abc123', 'sk_test_xyz', null],
    ['a secret key pasted by mistake', 'sk_live_abc123', 'sk_live_xyz', null],
  ])('%s', (_label, publishable, secret, expected) => {
    expect(withEnv(publishable, secret)).toBe(expected)
  })
})
