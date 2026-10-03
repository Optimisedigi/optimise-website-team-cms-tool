import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * One-off payment links: issuing (admin), paying (public token), Stripe
 * confirming, and cancelling. A one-off payment must never touch the client's
 * hosting subscription record.
 */

const payload = {
  auth: vi.fn(),
  find: vi.fn(),
  findByID: vi.fn(),
  findGlobal: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  db: { drizzle: { run: vi.fn() } },
}
const stripe = {
  getHostingCheckoutSession: vi.fn(),
  expireHostingCheckoutSession: vi.fn(),
  createHostingOneOffCheckout: vi.fn(),
  verifyStripeWebhook: vi.fn(),
  getHostingSubscriptionItems: vi.fn(),
}
const sendBrevoEmail = vi.fn()
// The real conditional UPDATE is covered against SQLite in
// tests/hosting-one-off-payment-status.test.ts; here it decides who won a race.
const moveFromPayable = vi.fn()
const missing = Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' })

vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/access', () => ({
  userHasFeature: (user: { features?: string[] }, slug: string) =>
    Boolean(user?.features?.includes(slug)),
}))
vi.mock('@/lib/brevo-email', () => ({
  sendBrevoEmail: (...args: unknown[]) => sendBrevoEmail(...args),
}))
vi.mock('@/lib/hosting-one-off-payment-status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hosting-one-off-payment-status')>()),
  moveFromPayable: (...args: unknown[]) => moveFromPayable(...args),
}))
vi.mock('@/lib/stripe', async (importOriginal) => ({
  ...stripe,
  checkoutSessionUi: (await importOriginal<typeof import('@/lib/stripe')>()).checkoutSessionUi,
  getCmsUrl: () => 'https://cms.test',
  getStripe: vi.fn(),
  isStripeMissingResource: (error: { code?: string }) => error?.code === 'resource_missing',
  isStripeIdempotencyConflict: (error: { rawType?: string }) =>
    error?.rawType === 'idempotency_error',
}))

const billingAdmin = { user: { id: 1, features: ['hosting-billing-settings'] } }
const snapshot = {
  description: 'Backdated hosting, July to September 2026',
  quote: { currency: 'aud', baseCents: 29700, surchargeCents: 560, totalCents: 30260 },
  recipientEmail: 'billing@example.com',
  recipientName: 'Sam',
}
const payment = (overrides: Record<string, unknown> = {}) => ({
  id: 31,
  client: 8,
  status: 'active',
  expiresAt: '2099-01-01T00:00:00.000Z',
  stripeCheckoutSessionId: null,
  snapshot,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  payload.auth.mockResolvedValue(billingAdmin)
  payload.findGlobal.mockImplementation(async ({ slug }: { slug: string }) =>
    slug === 'email-templates'
      ? {
          statementFromEmail: 'accounts@optimisedigital.online',
          statementReplyToEmail: 'accounts-replies@optimisedigital.online',
          statementSignOff: 'Thanks,',
          statementSenderName: 'Maria',
          signatureHtml: '<b>OD</b>',
        }
      : { currency: 'aud', cardSurchargePercentage: 1.75, cardSurchargeFixedCents: 30 },
  )
  payload.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 31,
    ...data,
  }))
  payload.update.mockResolvedValue({})
  sendBrevoEmail.mockResolvedValue({ ok: true })
  moveFromPayable.mockResolvedValue(true)
  stripe.expireHostingCheckoutSession.mockResolvedValue({})
})

describe('issuing a one-off payment link', () => {
  const issue = async (body: unknown) => {
    const { POST } =
      await import('@/app/(frontend)/api/clients/[id]/hosting-one-off-payments/route')
    return POST(
      new NextRequest('http://localhost/api/clients/8/hosting-one-off-payments', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: '8' }) },
    )
  }

  beforeEach(() => {
    payload.findByID.mockResolvedValue({
      id: 8,
      name: 'We Can Quit',
      hostingSubscription: { recipientEmail: 'billing@example.com', recipientName: 'Sam' },
    })
  })

  it('is limited to staff with hosting billing access', async () => {
    payload.auth.mockResolvedValue({ user: { id: 2, features: ['clients'] } })

    const response = await issue({ description: 'Backdated hosting', amount: 297 })

    expect(response.status).toBe(403)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid amount before creating anything', async () => {
    const response = await issue({ description: 'Backdated hosting', amount: 0 })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('Enter an amount above $0.')
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('needs a billing email on the client', async () => {
    payload.findByID.mockResolvedValue({ id: 8, name: 'We Can Quit', hostingSubscription: {} })

    const response = await issue({ description: 'Backdated hosting', amount: 297 })

    expect(response.status).toBe(422)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('freezes the amount and surcharge, stores only a token hash, and emails the link from accounts', async () => {
    const response = await issue({
      description: 'Backdated hosting, July to September 2026',
      amount: 297,
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    const created = payload.create.mock.calls[0]?.[0] as {
      collection: string
      data: Record<string, any>
    }
    expect(created.collection).toBe('hosting-one-off-payments')
    expect(created.data.snapshot).toEqual(snapshot)
    expect(created.data.status).toBe('active')
    const token = String(body.url).split('/').pop()
    expect(body.url).toMatch(/^https:\/\/cms\.test\/hosting-pay\/once\/[\w-]{43}$/)
    expect(created.data.tokenHash).not.toBe(token)
    expect(JSON.stringify(body.payment)).not.toContain(created.data.tokenHash)

    const sent = sendBrevoEmail.mock.calls[0]?.[0]
    expect(sent.sender).toEqual({
      email: 'accounts@optimisedigital.online',
      name: 'Optimise Digital',
    })
    expect(sent.replyTo).toEqual({ email: 'accounts-replies@optimisedigital.online' })
    expect(sent.to).toEqual([{ email: 'billing@example.com', name: 'Sam' }])
    expect(sent.textContent).toContain(body.url)
    expect(body.emailSent).toBe(true)
  })

  it('still returns the link when the email fails', async () => {
    sendBrevoEmail.mockResolvedValue({ ok: false, code: 'no-api-key' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await issue({ description: 'Backdated hosting', amount: 297 })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.emailSent).toBe(false)
    expect(body.url).toMatch(/^https:\/\/cms\.test\/hosting-pay\/once\//)
  })
})

describe('paying a one-off payment link', () => {
  const pay = async (token: string, ui: 'hosted' | 'embedded' | 'elements' = 'hosted') => {
    const { POST } = await import('@/app/(frontend)/api/hosting-pay/once/[token]/checkout/route')
    return POST(
      new NextRequest(`http://localhost/api/hosting-pay/once/${token}/checkout`, {
        method: 'POST',
        ...(ui !== 'hosted'
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ui }) }
          : {}),
      }),
      {
        params: Promise.resolve({ token }),
      },
    )
  }

  beforeEach(() => {
    payload.findByID.mockResolvedValue({
      id: 8,
      hostingSubscription: { stripeCustomerId: 'cus_existing' },
    })
    stripe.createHostingOneOffCheckout.mockResolvedValue({
      id: 'cs_new',
      url: 'https://checkout.stripe.test/new',
    })
  })

  it.each([
    ['paid', payment({ status: 'paid' })],
    ['revoked', payment({ status: 'revoked' })],
    ['expired', payment({ expiresAt: '2020-01-01T00:00:00.000Z' })],
  ])('refuses a %s link', async (_label, doc) => {
    payload.find.mockResolvedValue({ docs: [doc] })

    const response = await pay(`token-${_label}`)

    expect(response.status).toBe(410)
    expect(stripe.createHostingOneOffCheckout).not.toHaveBeenCalled()
  })

  it('opens Stripe for the frozen total and records the checkout', async () => {
    payload.find.mockResolvedValue({ docs: [payment()] })

    const response = await pay('token-new')

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://checkout.stripe.test/new')
    expect(stripe.createHostingOneOffCheckout).toHaveBeenCalledWith({
      clientId: '8',
      paymentId: '31',
      customerId: 'cus_existing',
      email: 'billing@example.com',
      description: 'Backdated hosting, July to September 2026',
      currency: 'aud',
      totalCents: 30260,
      idempotencyKey: 'hosting-one-off-v2-31',
      returnToPaymentLink: '/hosting-pay/once/token-new',
      ui: 'hosted',
    })
    expect(moveFromPayable).toHaveBeenCalledWith(payload.db.drizzle, {
      id: 31,
      status: 'checkout_pending',
      stripeCheckoutSessionId: 'cs_new',
      now: expect.any(Date),
    })
    expect(stripe.expireHostingCheckoutSession).not.toHaveBeenCalled()
  })

  it('closes the new Stripe session and refuses if the link was cancelled meanwhile', async () => {
    payload.find.mockResolvedValue({ docs: [payment()] })
    moveFromPayable.mockResolvedValue(false)

    const response = await pay('token-cancelled-meanwhile')

    expect(response.status).toBe(410)
    expect(response.headers.get('location')).toBeNull()
    expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_new')
  })

  it('sends the client back to an open checkout instead of opening a second', async () => {
    payload.find.mockResolvedValue({
      docs: [payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_open' })],
    })
    stripe.getHostingCheckoutSession.mockResolvedValue({
      id: 'cs_open',
      status: 'open',
      url: 'https://checkout.stripe.test/open',
    })

    const response = await pay('token-open')

    expect(response.headers.get('location')).toBe('https://checkout.stripe.test/open')
    expect(stripe.createHostingOneOffCheckout).not.toHaveBeenCalled()
  })

  it('refuses a link whose checkout has already completed', async () => {
    payload.find.mockResolvedValue({
      docs: [payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_done' })],
    })
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_done', status: 'complete' })

    const response = await pay('token-done')

    expect(response.status).toBe(410)
    expect(stripe.createHostingOneOffCheckout).not.toHaveBeenCalled()
  })

  it('opens a fresh checkout with a new key after the old one expired', async () => {
    payload.find.mockResolvedValue({
      docs: [payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_old' })],
    })
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_old', status: 'expired' })

    await pay('token-retry')

    expect(stripe.createHostingOneOffCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'hosting-one-off-v2-31-cs_old' }),
    )
  })

  it("returns the in-page payment session secret for the design's own card form", async () => {
    payload.find.mockResolvedValue({ docs: [payment()] })
    stripe.createHostingOneOffCheckout.mockResolvedValue({
      id: 'cs_el',
      url: null,
      client_secret: 'cs_el_secret',
    })

    const response = await pay('token-elements', 'elements')

    expect(await response.json()).toEqual({ clientSecret: 'cs_el_secret' })
    expect(stripe.createHostingOneOffCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ ui: 'elements' }),
    )
  })

  it('reopens the same in-page payment session on refresh instead of starting another', async () => {
    payload.find.mockResolvedValue({
      docs: [payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_el' })],
    })
    stripe.getHostingCheckoutSession.mockResolvedValue({
      id: 'cs_el',
      status: 'open',
      ui_mode: 'elements',
      client_secret: 'cs_el_secret',
    })

    const response = await pay('token-elements-refresh', 'elements')

    expect(await response.json()).toEqual({ clientSecret: 'cs_el_secret' })
    expect(stripe.createHostingOneOffCheckout).not.toHaveBeenCalled()
    expect(stripe.expireHostingCheckoutSession).not.toHaveBeenCalled()
  })

  it('returns the card form secret instead of redirecting when the page embeds the form', async () => {
    payload.find.mockResolvedValue({ docs: [payment()] })
    stripe.createHostingOneOffCheckout.mockResolvedValue({
      id: 'cs_embed',
      url: null,
      client_secret: 'cs_embed_secret',
    })

    const response = await pay('token-embed', 'embedded')

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toEqual({ clientSecret: 'cs_embed_secret' })
    expect(stripe.createHostingOneOffCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ ui: 'embedded', idempotencyKey: 'hosting-one-off-v2-31' }),
    )
    expect(moveFromPayable).toHaveBeenCalledWith(
      payload.db.drizzle,
      expect.objectContaining({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_embed' }),
    )
  })

  it('reopens the same embedded card form instead of starting a second payment', async () => {
    payload.find.mockResolvedValue({
      docs: [payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_embed' })],
    })
    stripe.getHostingCheckoutSession.mockResolvedValue({
      id: 'cs_embed',
      status: 'open',
      ui_mode: 'embedded_page',
      url: null,
      client_secret: 'cs_embed_secret',
    })

    const response = await pay('token-embed-again', 'embedded')

    expect(await response.json()).toEqual({ clientSecret: 'cs_embed_secret' })
    expect(stripe.createHostingOneOffCheckout).not.toHaveBeenCalled()
    expect(stripe.expireHostingCheckoutSession).not.toHaveBeenCalled()
  })

  it('closes an open Stripe-page checkout before opening the card form, so only one can be paid', async () => {
    payload.find.mockResolvedValue({
      docs: [payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_hosted' })],
    })
    stripe.getHostingCheckoutSession.mockResolvedValue({
      id: 'cs_hosted',
      status: 'open',
      ui_mode: 'hosted_page',
      url: 'https://checkout.stripe.test/hosted',
    })
    stripe.createHostingOneOffCheckout.mockResolvedValue({
      id: 'cs_embed',
      url: null,
      client_secret: 'cs_embed_secret',
    })

    const response = await pay('token-switch', 'embedded')

    expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_hosted')
    expect(stripe.createHostingOneOffCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        ui: 'embedded',
        idempotencyKey: 'hosting-one-off-v2-31-cs_hosted',
      }),
    )
    expect(await response.json()).toEqual({ clientSecret: 'cs_embed_secret' })
  })

  it('does not open the card form if Stripe will not close the earlier checkout', async () => {
    payload.find.mockResolvedValue({
      docs: [payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_hosted' })],
    })
    stripe.getHostingCheckoutSession.mockResolvedValue({
      id: 'cs_hosted',
      status: 'open',
      ui_mode: 'hosted_page',
    })
    stripe.expireHostingCheckoutSession.mockRejectedValueOnce(new Error('already completed'))

    const response = await pay('token-switch-refused', 'embedded')

    expect(response.status).toBe(409)
    expect(stripe.createHostingOneOffCheckout).not.toHaveBeenCalled()
  })

  it('stops when Stripe cannot confirm the earlier checkout', async () => {
    payload.find.mockResolvedValue({
      docs: [payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_x' })],
    })
    stripe.getHostingCheckoutSession.mockRejectedValue(new Error('network down'))

    const response = await pay('token-down')

    expect(response.status).toBe(503)
    expect(stripe.createHostingOneOffCheckout).not.toHaveBeenCalled()
  })
})

describe('Stripe confirming a one-off payment', () => {
  const deliver = async (object: Record<string, unknown>) => {
    stripe.verifyStripeWebhook.mockReturnValue({
      id: 'evt_once',
      type: 'checkout.session.completed',
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
  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'cs_paid',
    mode: 'payment',
    payment_status: 'paid',
    customer: null,
    subscription: null,
    client_reference_id: '8',
    metadata: { cmsClientId: '8', hostingOneOffPaymentId: '31' },
    ...overrides,
  })
  const updatesTo = (collection: string) =>
    payload.update.mock.calls.filter(
      ([args]) => (args as { collection: string }).collection === collection,
    )

  it('marks the link paid and leaves the hosting subscription record alone', async () => {
    payload.findByID.mockResolvedValue(payment({ status: 'checkout_pending' }))

    const response = await deliver(session())

    expect(response.status).toBe(200)
    expect(updatesTo('hosting-one-off-payments')).toEqual([
      [
        expect.objectContaining({
          id: 31,
          data: {
            status: 'paid',
            paidAt: new Date(1_790_000_000 * 1000).toISOString(),
            stripeCheckoutSessionId: 'cs_paid',
          },
        }),
      ],
    ])
    expect(updatesTo('clients')).toHaveLength(0)
  })

  it('ignores a session for a link belonging to another client', async () => {
    payload.findByID.mockResolvedValue(payment({ client: 99 }))

    await deliver(session())

    expect(payload.update).not.toHaveBeenCalled()
  })

  it('ignores a completed checkout that is not paid', async () => {
    payload.findByID.mockResolvedValue(payment())

    await deliver(session({ payment_status: 'unpaid' }))

    expect(payload.update).not.toHaveBeenCalled()
  })
})

describe('cancelling a one-off payment link', () => {
  const revoke = async (paymentId = '31', clientId = '8') => {
    const { POST } =
      await import('@/app/(frontend)/api/clients/[id]/hosting-one-off-payments/[paymentId]/revoke/route')
    return POST(
      new NextRequest(
        `http://localhost/api/clients/${clientId}/hosting-one-off-payments/${paymentId}/revoke`,
        { method: 'POST' },
      ),
      {
        params: Promise.resolve({ id: clientId, paymentId }),
      },
    )
  }

  const cancelledWith = () =>
    moveFromPayable.mock.calls.filter(([, input]) => input.status === 'revoked')

  it('cancels the link, then closes the open Stripe checkout on record', async () => {
    payload.findByID
      .mockResolvedValueOnce(
        payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_open' }),
      )
      .mockResolvedValueOnce(payment({ status: 'revoked', stripeCheckoutSessionId: 'cs_open' }))
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_open', status: 'open' })

    const response = await revoke()

    expect(response.status).toBe(200)
    expect(cancelledWith()).toHaveLength(1)
    expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_open')
  })

  it('also closes a checkout the client opened just before the cancel landed', async () => {
    // Read before cancel: no session yet. Read after: checkout had recorded one.
    payload.findByID
      .mockResolvedValueOnce(payment({ status: 'active', stripeCheckoutSessionId: null }))
      .mockResolvedValueOnce(payment({ status: 'revoked', stripeCheckoutSessionId: 'cs_racing' }))
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_racing', status: 'open' })

    const response = await revoke()

    expect(response.status).toBe(200)
    expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_racing')
  })

  it('refuses to cancel a paid link', async () => {
    payload.findByID.mockResolvedValue(payment({ status: 'paid' }))

    const response = await revoke()

    expect(response.status).toBe(409)
    expect(moveFromPayable).not.toHaveBeenCalled()
  })

  it('reports a payment that Stripe confirmed while the cancel was running', async () => {
    payload.findByID
      .mockResolvedValueOnce(
        payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_done' }),
      )
      .mockResolvedValueOnce(payment({ status: 'paid', stripeCheckoutSessionId: 'cs_done' }))
    moveFromPayable.mockResolvedValue(false)

    const response = await revoke()

    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(
      'This payment has already been made. Refund it in Stripe instead.',
    )
    expect(stripe.expireHostingCheckoutSession).not.toHaveBeenCalled()
  })

  it('tells the admin when the client had already completed checkout', async () => {
    payload.findByID.mockResolvedValue(
      payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_done' }),
    )
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_done', status: 'complete' })

    const response = await revoke()

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('the client had already paid')
    expect(stripe.expireHostingCheckoutSession).not.toHaveBeenCalled()
  })

  it('keeps the link cancelled and asks for a retry when Stripe cannot be reached', async () => {
    payload.findByID.mockResolvedValue(
      payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_x' }),
    )
    stripe.getHostingCheckoutSession.mockRejectedValue(new Error('network down'))

    const response = await revoke()

    expect(response.status).toBe(503)
    expect(cancelledWith()).toHaveLength(1)
    expect((await response.json()).error).toContain('Click Cancel link again')
  })

  it('retrying a cancelled link only closes the Stripe checkout', async () => {
    payload.findByID.mockResolvedValue(
      payment({ status: 'revoked', stripeCheckoutSessionId: 'cs_x' }),
    )
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_x', status: 'open' })

    const response = await revoke()

    expect(response.status).toBe(200)
    expect(moveFromPayable).not.toHaveBeenCalled()
    expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_x')
  })

  it('cancels when Stripe no longer has the checkout', async () => {
    payload.findByID.mockResolvedValue(
      payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_gone' }),
    )
    stripe.getHostingCheckoutSession.mockRejectedValue(missing)

    const response = await revoke()

    expect(response.status).toBe(200)
  })

  it("treats another client's link as not found", async () => {
    payload.findByID.mockResolvedValue(payment({ client: 99 }))

    const response = await revoke()

    expect(response.status).toBe(404)
    expect(moveFromPayable).not.toHaveBeenCalled()
  })
})
