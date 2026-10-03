import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * One client must never end up with two hosting subscriptions. These cover the
 * three places a second one could start: reissuing a link, paying a link, and
 * Stripe reporting a subscription the CMS did not expect.
 */

const payload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  findGlobal: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}
const stripe = {
  getHostingCheckoutSession: vi.fn(),
  expireHostingCheckoutSession: vi.fn(),
  createHostingCheckout: vi.fn(),
  verifyStripeWebhook: vi.fn(),
  getHostingSubscriptionItems: vi.fn(),
}
const missing = Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' })

vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/access', () => ({ userHasFeature: () => true }))
// Issuing a link emails it; never let these tests reach Brevo.
vi.mock('@/lib/brevo-email', () => ({ sendBrevoEmail: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/stripe', async (importOriginal) => ({
  checkoutSessionUi: (await importOriginal<typeof import('@/lib/stripe')>()).checkoutSessionUi,
  getCmsUrl: () => 'https://cms.test',
  isStripeMissingResource: (error: unknown) =>
    (error as { code?: string } | null)?.code === 'resource_missing',
  isStripeIdempotencyConflict: (error: unknown) =>
    (error as { rawType?: string } | null)?.rawType === 'idempotency_error',
  getStripe: vi.fn(),
  ...Object.fromEntries(
    Object.keys(stripe).map((name) => [
      name,
      (...args: unknown[]) =>
        (stripe as Record<string, (...a: unknown[]) => unknown>)[name]?.(...args),
    ]),
  ),
}))

const quote = (interval: 'month' | 'year', totalCents: number) => ({
  currency: 'aud',
  interval,
  planName: 'Essential',
  allowance: '',
  clause: '',
  baseCents: totalCents,
  surchargeCents: 0,
  totalCents,
})
const plan = {
  planName: 'Essential',
  recipientEmail: 'billing@example.com',
  monthlyBaseCents: 7900,
  annualBaseCents: 94800,
  billingInterval: 'month',
}

beforeEach(() => {
  vi.clearAllMocks()
  payload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
  payload.findGlobal.mockResolvedValue({
    currency: 'aud',
    cardSurchargePercentage: 0,
    cardSurchargeFixedCents: 0,
  })
  payload.create.mockImplementation(async ({ collection }: { collection: string }) =>
    collection === 'hosting-payment-offers' ? { id: 77 } : { id: 1 },
  )
  payload.update.mockResolvedValue({})
  stripe.createHostingCheckout.mockResolvedValue({
    id: 'cs_new',
    url: 'https://checkout.stripe.test/new',
  })
  stripe.getHostingSubscriptionItems.mockResolvedValue({})
})

describe('issuing a new payment link', () => {
  const issue = async () => {
    const { POST } = await import('@/app/(frontend)/api/clients/[id]/hosting-offers/route')
    return POST(
      new NextRequest('http://localhost/api/clients/8/hosting-offers', { method: 'POST' }),
      {
        params: Promise.resolve({ id: '8' }),
      },
    )
  }
  const clientWith = (hosting: Record<string, unknown>) => (args: { collection: string }) =>
    args.collection === 'clients'
      ? { id: 8, hostingSubscription: { ...plan, ...hosting } }
      : undefined

  it('refuses while the client already has a live subscription', async () => {
    payload.findByID.mockImplementation(async (args: { collection: string }) =>
      clientWith({ stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' })(args),
    )

    const response = await issue()

    expect(response.status).toBe(409)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('allows a new link once the previous subscription has ended', async () => {
    payload.findByID.mockImplementation(async (args: { collection: string }) =>
      clientWith({ stripeSubscriptionId: 'sub_1', subscriptionStatus: 'canceled' })(args),
    )

    const response = await issue()

    expect(response.status).toBe(200)
  })

  it('makes the sign-up link work for 14 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T12:00:00.000Z'))
    try {
      payload.findByID.mockImplementation(async (args: { collection: string }) =>
        clientWith({})(args),
      )

      expect((await issue()).status).toBe(200)

      const offer = payload.create.mock.calls.find(
        ([args]: [{ collection: string }]) => args.collection === 'hosting-payment-offers',
      )?.[0] as { data: { expiresAt: string } }
      expect(offer.data.expiresAt).toBe('2026-10-17T12:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the old Stripe payment page before revoking the old link', async () => {
    payload.findByID.mockImplementation(async (args: { collection: string }) =>
      args.collection === 'hosting-payment-offers'
        ? { id: 5, status: 'checkout_pending', stripeCheckoutSessionId: 'cs_old' }
        : clientWith({ activeOffer: 5 })(args),
    )
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_old', status: 'open' })

    const response = await issue()

    expect(response.status).toBe(200)
    expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_old')
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'hosting-payment-offers',
        id: 5,
        data: { status: 'revoked' },
      }),
    )
  })

  it.each([
    {
      name: 'the old page was just paid',
      session: { id: 'cs_old', status: 'complete' },
      error: null,
    },
    { name: 'Stripe cannot be reached', session: null, error: new Error('timeout') },
  ])('keeps the old link and refuses when $name', async ({ session, error }) => {
    payload.findByID.mockImplementation(async (args: { collection: string }) =>
      args.collection === 'hosting-payment-offers'
        ? { id: 5, status: 'checkout_pending', stripeCheckoutSessionId: 'cs_old' }
        : clientWith({ activeOffer: 5 })(args),
    )
    if (error) stripe.getHostingCheckoutSession.mockRejectedValue(error)
    else stripe.getHostingCheckoutSession.mockResolvedValue(session)

    const response = await issue()

    expect(response.status).toBe(409)
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('treats a session Stripe no longer has as closed', async () => {
    payload.findByID.mockImplementation(async (args: { collection: string }) =>
      args.collection === 'hosting-payment-offers'
        ? { id: 5, status: 'checkout_pending', stripeCheckoutSessionId: 'cs_gone' }
        : clientWith({ activeOffer: 5 })(args),
    )
    stripe.getHostingCheckoutSession.mockRejectedValue(missing)

    const response = await issue()

    expect(response.status).toBe(200)
  })
})

describe('paying a link', () => {
  const offer = {
    id: 99,
    client: 8,
    status: 'checkout_pending',
    selectedInterval: 'month',
    stripeCheckoutSessionId: 'cs_old',
    expiresAt: '2999-01-01T00:00:00.000Z',
    snapshot: {
      monthly: quote('month', 7900),
      annual: quote('year', 94800),
      recipientEmail: 'b@example.com',
    },
  }
  const pay = async (token: string) => {
    const { POST } = await import('@/app/(frontend)/api/hosting-pay/[token]/checkout/route')
    const body = new FormData()
    body.set('interval', 'year')
    return POST(
      new NextRequest(`http://localhost/api/hosting-pay/${token}/checkout`, {
        method: 'POST',
        body,
      }),
      {
        params: Promise.resolve({ token }),
      },
    )
  }

  beforeEach(() => {
    payload.find.mockResolvedValue({ docs: [offer] })
    payload.findByID.mockResolvedValue({ id: 8, hostingSubscription: {} })
  })

  it('refuses rather than opening a second checkout when Stripe cannot be reached', async () => {
    stripe.getHostingCheckoutSession.mockRejectedValue(new Error('timeout'))

    const response = await pay('token-unreachable')

    expect(response.status).toBe(503)
    expect(stripe.createHostingCheckout).not.toHaveBeenCalled()
  })

  it('refuses when the client already pays for hosting', async () => {
    stripe.getHostingCheckoutSession.mockRejectedValue(missing)
    payload.findByID.mockResolvedValue({
      id: 8,
      hostingSubscription: { stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' },
    })

    const response = await pay('token-already-paying')

    expect(response.status).toBe(409)
    expect(stripe.createHostingCheckout).not.toHaveBeenCalled()
  })

  it('opens a new checkout when the previous one no longer exists', async () => {
    stripe.getHostingCheckoutSession.mockRejectedValue(missing)

    const response = await pay('token-recreate')

    expect(response.status).toBe(303)
    expect(stripe.createHostingCheckout).toHaveBeenCalledTimes(1)
  })

  it("bills from the offer's start date: nothing charged before it, renewals on it", async () => {
    // 2 Oct 2026 in Sydney; the annual start date is about six weeks away.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-02T00:00:00.000Z'))
    try {
      payload.find.mockResolvedValue({
        docs: [
          {
            ...offer,
            status: 'active',
            stripeCheckoutSessionId: null,
            snapshot: { ...offer.snapshot, billingStartDate: '2026-11-15' },
          },
        ],
      })

      await pay('token-start-date')

      const args = stripe.createHostingCheckout.mock.calls[0]?.[0] as {
        billingStart: unknown
        firstPayment?: unknown
      }
      expect(args.billingStart).toEqual({
        billing_cycle_anchor: Date.UTC(2026, 10, 15, 2) / 1000,
        proration_behavior: 'none',
      })
      expect(args.firstPayment).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('charges the full price today for a start date that has passed, never pro-rata', async () => {
    // 3 Oct 2026; the annual start date was 14 September.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T02:00:00.000Z'))
    try {
      payload.find.mockResolvedValue({
        docs: [
          {
            ...offer,
            status: 'active',
            stripeCheckoutSessionId: null,
            snapshot: { ...offer.snapshot, billingStartDate: '2026-09-14' },
          },
        ],
      })

      await pay('token-past-start')

      const args = stripe.createHostingCheckout.mock.calls[0]?.[0] as {
        billingStart: unknown
        firstPayment: unknown
      }
      // The full annual price today, then the plan renews on 14 September.
      expect(args.firstPayment).toEqual({ paidUntil: '14 September 2027' })
      expect(args.billingStart).toEqual({ trial_end: Date.UTC(2027, 8, 14, 2) / 1000 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses one Stripe request key per attempt, whichever frequency is chosen', async () => {
    payload.find.mockResolvedValue({
      docs: [{ ...offer, status: 'active', stripeCheckoutSessionId: null }],
    })

    await pay('token-key-year')
    const { POST } = await import('@/app/(frontend)/api/hosting-pay/[token]/checkout/route')
    const monthly = new FormData()
    monthly.set('interval', 'month')
    await POST(
      new NextRequest('http://localhost/api/hosting-pay/token-key-month/checkout', {
        method: 'POST',
        body: monthly,
      }),
      {
        params: Promise.resolve({ token: 'token-key-month' }),
      },
    )

    const keys = stripe.createHostingCheckout.mock.calls.map(
      ([args]) => (args as { idempotencyKey: string }).idempotencyKey,
    )
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('refuses the losing request when two arrive at once', async () => {
    payload.find.mockResolvedValue({
      docs: [{ ...offer, status: 'active', stripeCheckoutSessionId: null }],
    })
    stripe.createHostingCheckout.mockRejectedValue(
      Object.assign(
        new Error('Keys for idempotent requests can only be used with the same parameters'),
        {
          rawType: 'idempotency_error',
        },
      ),
    )

    const response = await pay('token-race')

    expect(response.status).toBe(409)
    expect(payload.update).not.toHaveBeenCalled()
  })

  const payEmbedded = async (token: string, interval: 'month' | 'year') => {
    const { POST } = await import('@/app/(frontend)/api/hosting-pay/[token]/checkout/route')
    return POST(
      new NextRequest(`http://localhost/api/hosting-pay/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval, ui: 'embedded' }),
      }),
      { params: Promise.resolve({ token }) },
    )
  }

  it('returns the card form secret for the chosen frequency when the form is embedded', async () => {
    payload.find.mockResolvedValue({ docs: [{ ...offer, status: 'active', stripeCheckoutSessionId: null }] })
    stripe.createHostingCheckout.mockResolvedValue({ id: 'cs_embed', url: null, client_secret: 'cs_embed_secret' })

    const response = await payEmbedded('token-embed', 'year')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ clientSecret: 'cs_embed_secret' })
    expect(stripe.createHostingCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ ui: 'embedded', quote: offer.snapshot.annual }),
    )
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'checkout_pending', selectedInterval: 'year', stripeCheckoutSessionId: 'cs_embed' },
      }),
    )
  })

  it('reopens the same embedded form for the same frequency instead of a second checkout', async () => {
    stripe.getHostingCheckoutSession.mockResolvedValue({
      id: 'cs_old',
      status: 'open',
      ui_mode: 'embedded_page',
      client_secret: 'cs_old_secret',
    })

    const response = await payEmbedded('token-embed-again', 'month')

    expect(await response.json()).toEqual({ clientSecret: 'cs_old_secret' })
    expect(stripe.createHostingCheckout).not.toHaveBeenCalled()
    expect(stripe.expireHostingCheckoutSession).not.toHaveBeenCalled()
  })

  it('closes an open Stripe-page checkout before opening the embedded form', async () => {
    stripe.getHostingCheckoutSession.mockResolvedValue({
      id: 'cs_old',
      status: 'open',
      ui_mode: 'hosted_page',
      url: 'https://checkout.stripe.test/old',
    })
    stripe.createHostingCheckout.mockResolvedValue({ id: 'cs_embed', url: null, client_secret: 'cs_embed_secret' })

    const response = await payEmbedded('token-embed-switch', 'month')

    expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_old')
    expect(stripe.createHostingCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ ui: 'embedded', idempotencyKey: 'hosting-checkout-v6-99-cs_old' }),
    )
    expect(await response.json()).toEqual({ clientSecret: 'cs_embed_secret' })
  })
})

describe('Stripe reporting a subscription', () => {
  const deliver = async (type: string, object: Record<string, unknown>, id = `evt_${type}`) => {
    stripe.verifyStripeWebhook.mockReturnValue({
      id,
      type,
      created: 1_790_000_000,
      data: { object },
    })
    const { POST } = await import('@/app/(frontend)/api/stripe/webhook/route')
    return POST(
      new NextRequest('http://localhost/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig' },
        body: '{}',
      }),
    )
  }
  const subscription = (id: string) => ({
    id,
    status: 'active',
    cancel_at_period_end: false,
    metadata: { cmsClientId: '8' },
    items: { data: [{ current_period_end: 1_793_498_400 }] },
  })
  const recorded = (status: string) => ({
    id: 8,
    name: 'We Can Quit',
    hostingSubscription: { stripeSubscriptionId: 'sub_first', subscriptionStatus: status },
  })
  const clientUpdates = () =>
    payload.update.mock.calls.filter(
      ([args]) => (args as { collection: string }).collection === 'clients',
    )

  it('keeps the recorded subscription and alerts admins when a second one starts', async () => {
    payload.findByID.mockResolvedValue(recorded('active'))
    payload.find.mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }] })

    const response = await deliver('customer.subscription.created', subscription('sub_second'))

    expect(response.status).toBe(200)
    expect(clientUpdates()).toHaveLength(0)
    const alerts = payload.create.mock.calls.map(
      ([args]) => args as { collection: string; data: { kind: string } },
    )
    expect(alerts).toHaveLength(2)
    expect(
      alerts.every(
        (a) => a.collection === 'notifications' && a.data.kind === 'hosting-duplicate-subscription',
      ),
    ).toBe(true)
  })

  it("does not let the duplicate subscription's failed invoice mark the client as failed", async () => {
    payload.findByID.mockResolvedValue(recorded('active'))

    await deliver('invoice.payment_failed', {
      id: 'in_dup',
      parent: {
        subscription_details: { subscription: 'sub_second', metadata: { cmsClientId: '8' } },
      },
    })

    expect(clientUpdates()).toHaveLength(0)
  })

  it('records a new subscription once the previous one has ended', async () => {
    payload.findByID.mockResolvedValue(recorded('canceled'))

    await deliver('customer.subscription.created', subscription('sub_second'))

    expect(clientUpdates()).toHaveLength(1)
    expect(clientUpdates()[0]?.[0]).toMatchObject({
      data: {
        hostingSubscription: { stripeSubscriptionId: 'sub_second', subscriptionStatus: 'active' },
      },
    })
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('records the frequency the client chose at checkout, not the offer default', async () => {
    payload.findByID.mockResolvedValue({
      id: 8,
      hostingSubscription: { billingInterval: 'month' },
    })
    stripe.getHostingSubscriptionItems.mockResolvedValue({
      hostingItemId: 'si_new',
      interval: 'year',
    })

    await deliver('customer.subscription.created', subscription('sub_new'))

    expect(clientUpdates()[0]?.[0]).toMatchObject({
      data: { hostingSubscription: { billingInterval: 'year', stripeHostingItemId: 'si_new' } },
    })
  })

  it('drops item IDs from an ended subscription when recording a new one', async () => {
    payload.findByID.mockResolvedValue({
      id: 8,
      hostingSubscription: {
        stripeSubscriptionId: 'sub_first',
        subscriptionStatus: 'canceled',
        stripeHostingItemId: 'si_old_hosting',
        stripeSurchargeItemId: 'si_old_surcharge',
      },
    })
    stripe.getHostingSubscriptionItems.mockResolvedValue({
      hostingItemId: 'si_new',
      interval: 'month',
    })

    await deliver('customer.subscription.created', subscription('sub_second'))

    const saved = (
      clientUpdates()[0]?.[0] as { data: { hostingSubscription: Record<string, unknown> } }
    ).data.hostingSubscription
    expect(saved.stripeHostingItemId).toBe('si_new')
    expect(saved.stripeSurchargeItemId).toBeNull()
  })

  it('only marks an offer paid when it belongs to the paying client', async () => {
    payload.findByID.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'clients' ? { id: 8, hostingSubscription: {} } : { id: 55, client: 3 },
    )

    await deliver('checkout.session.completed', {
      customer: 'cus_1',
      subscription: 'sub_new',
      metadata: { cmsClientId: '8', hostingOfferId: '55' },
    })

    const offerUpdates = payload.update.mock.calls.filter(
      ([args]) => (args as { collection: string }).collection === 'hosting-payment-offers',
    )
    expect(offerUpdates).toHaveLength(0)
  })
})
