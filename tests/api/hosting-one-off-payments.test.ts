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
const claimScheduledForSend = vi.fn()
const returnToSchedule = vi.fn()
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
  claimScheduledForSend: (...args: unknown[]) => claimScheduledForSend(...args),
  returnToSchedule: (...args: unknown[]) => returnToSchedule(...args),
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
    expect(sent.subject).toBe('Payment request: Backdated hosting, July to September 2026')
    expect(sent.textContent.startsWith('Hi Sam,')).toBe(true)
    expect(body.emailSent).toBe(true)
  })

  it("greets the client's main contact by first name when no billing name is set", async () => {
    payload.findByID.mockResolvedValue({
      id: 8,
      name: 'We Can Quit',
      contactName: 'Jordan Smith',
      hostingSubscription: { recipientEmail: 'billing@example.com', recipientName: '' },
    })

    await issue({ description: 'Backdated hosting', amount: 297 })

    const created = payload.create.mock.calls[0]?.[0] as { data: Record<string, any> }
    expect(created.data.snapshot.recipientName).toBe('Jordan Smith')
    const sent = sendBrevoEmail.mock.calls[0]?.[0]
    expect(sent.to).toEqual([{ email: 'billing@example.com', name: 'Jordan Smith' }])
    expect(sent.textContent.startsWith('Hi Jordan,')).toBe(true)
  })

  it('uses the billing name set in the hosting section over the main contact', async () => {
    payload.findByID.mockResolvedValue({
      id: 8,
      name: 'We Can Quit',
      contactName: 'Jordan Smith',
      hostingSubscription: { recipientEmail: 'billing@example.com', recipientName: 'Priya Rao' },
    })

    await issue({ description: 'Backdated hosting', amount: 297 })

    expect(sendBrevoEmail.mock.calls[0]?.[0].textContent.startsWith('Hi Priya,')).toBe(true)
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

  it('schedules the email for 9am Sydney on the chosen day without sending anything now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T02:00:00.000Z'))
    try {
      const response = await issue({
        description: 'Backdated hosting',
        amount: 297,
        sendOn: '2026-10-10',
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      const created = payload.create.mock.calls[0]?.[0] as { data: Record<string, any> }
      expect(created.data.status).toBe('scheduled')
      expect(created.data.scheduledSendAt).toBe('2026-10-09T22:00:00.000Z')
      expect(sendBrevoEmail).not.toHaveBeenCalled()
      // The link is made when the email goes out, so there is nothing to copy yet.
      expect(body.url).toBeUndefined()
      expect(body.emailSent).toBe(false)
      expect(body.payment).toMatchObject({
        status: 'scheduled',
        scheduledSendAt: '2026-10-09T22:00:00.000Z',
        emailSentAt: null,
        sendFailed: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a send date that is not after today', async () => {
    const response = await issue({
      description: 'Backdated hosting',
      amount: 297,
      sendOn: '2020-01-01',
    })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(
      'Pick a send date after today, or leave it blank to send now.',
    )
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('sending scheduled one-off payment emails', () => {
  const NOW = new Date('2026-10-10T00:00:00.000Z')
  const run = async () => {
    const { sendDueScheduledOneOffPayments } = await import('@/lib/hosting-one-off-issue')
    return sendDueScheduledOneOffPayments(payload as any, NOW)
  }
  const cron = async (authorization?: string) => {
    const { GET } = await import('@/app/(frontend)/api/hosting-pay/once/send-scheduled/route')
    return GET(
      new NextRequest('http://localhost/api/hosting-pay/once/send-scheduled', {
        headers: authorization ? { authorization } : {},
      }),
    )
  }

  // Links due for a first send, and unpaid links due for a scheduled resend.
  let firstSends: unknown[]
  let resends: unknown[]

  beforeEach(() => {
    firstSends = [
      payment({
        status: 'scheduled',
        scheduledSendAt: '2026-10-09T22:00:00.000Z',
        sendAttempts: 0,
      }),
    ]
    resends = []
    payload.find.mockImplementation(async ({ where }: { where: { and: object[] } }) => ({
      docs: JSON.stringify(where).includes('resendAt') ? resends : firstSends,
    }))
    payload.findByID.mockResolvedValue({ id: 8, name: 'We Can Quit' })
    payload.db.drizzle.run.mockResolvedValue({ rowsAffected: 1 })
    claimScheduledForSend.mockResolvedValue(true)
    returnToSchedule.mockResolvedValue(true)
  })

  it('only picks up scheduled links that are due and still retrying', async () => {
    await run()

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'hosting-one-off-payments',
        where: {
          and: [
            { status: { equals: 'scheduled' } },
            { scheduledSendAt: { less_than_equal: NOW.toISOString() } },
            { sendAttempts: { less_than: 5 } },
          ],
        },
      }),
    )
  })

  it('emails a fresh payable link valid for 14 days from the send date', async () => {
    const summary = await run()

    expect(summary).toEqual({ due: 1, sent: 1, failed: 0, skipped: 0 })
    const claim = claimScheduledForSend.mock.calls[0]?.[1] as Record<string, any>
    expect(claim).toMatchObject({ id: 31, expiresAt: '2026-10-24T00:00:00.000Z' })
    const sent = sendBrevoEmail.mock.calls[0]?.[0]
    const url = /https:\/\/cms\.test\/hosting-pay\/once\/[\w-]{43}/.exec(sent.textContent)?.[0]
    expect(url).toBeDefined()
    // The emailed token is the one the claim made payable.
    const { hashOfferToken } = await import('@/lib/hosting-billing')
    expect(hashOfferToken(String(url).split('/').pop() ?? '')).toBe(claim.tokenHash)
    expect(sent.to).toEqual([{ email: 'billing@example.com', name: 'Sam' }])
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 31, data: { emailSentAt: NOW.toISOString() } }),
    )
  })

  it('skips a link another run or a cancel got to first, without emailing', async () => {
    claimScheduledForSend.mockResolvedValue(false)

    expect(await run()).toEqual({ due: 1, sent: 0, failed: 0, skipped: 1 })
    expect(sendBrevoEmail).not.toHaveBeenCalled()
  })

  it('puts the link back on the schedule with a different, unsent token when the email fails', async () => {
    sendBrevoEmail.mockResolvedValue({ ok: false, code: 'brevo-error', status: 500 })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await run()).toEqual({ due: 1, sent: 0, failed: 1, skipped: 0 })
    const claimed = (claimScheduledForSend.mock.calls[0]?.[1] as Record<string, any>).tokenHash
    const retired = (returnToSchedule.mock.calls[0]?.[1] as Record<string, any>).tokenHash
    expect(retired).not.toBe(claimed)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('only runs for Vercel Cron', async () => {
    process.env.CRON_SECRET = 'cron-secret'
    try {
      expect((await cron()).status).toBe(401)
      expect((await cron('Bearer wrong-secret')).status).toBe(401)
      expect(payload.find).not.toHaveBeenCalled()

      vi.spyOn(console, 'info').mockImplementation(() => {})
      const response = await cron('Bearer cron-secret')
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ due: 1, sent: 1, failed: 0, skipped: 0 })
    } finally {
      delete process.env.CRON_SECRET
    }
  })

  it('greets by the client contact name when the link saved no name', async () => {
    firstSends = [
      payment({
        status: 'scheduled',
        scheduledSendAt: '2026-10-09T22:00:00.000Z',
        snapshot: { ...snapshot, recipientName: '' },
      }),
    ]
    payload.findByID.mockResolvedValue({ id: 8, name: 'We Can Quit', contactName: 'Peter Lee' })

    await run()

    const sent = sendBrevoEmail.mock.calls[0]?.[0]
    expect(sent.textContent.startsWith('Hi Peter,')).toBe(true)
    expect(sent.to).toEqual([{ email: 'billing@example.com', name: 'Peter Lee' }])
  })

  describe('scheduled resends', () => {
    beforeEach(() => {
      firstSends = []
      resends = [payment({ resendAt: '2026-10-09T22:00:00.000Z', sendAttempts: 0 })]
    })

    it('only picks up unpaid, uncancelled links whose resend is due', async () => {
      await run()

      expect(payload.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            and: [
              { status: { in: ['active', 'checkout_pending'] } },
              { resendAt: { less_than_equal: NOW.toISOString() } },
              { sendAttempts: { less_than: 5 } },
            ],
          },
        }),
      )
    })

    it('emails a new 14-day link and clears the schedule', async () => {
      expect(await run()).toEqual({ due: 1, sent: 1, failed: 0, skipped: 0 })

      const sent = sendBrevoEmail.mock.calls[0]?.[0]
      expect(sent.textContent).toMatch(/https:\/\/cms\.test\/hosting-pay\/once\/[\w-]{43}/)
      expect(sent.textContent.startsWith('Hi Sam,')).toBe(true)
      expect(payload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 31,
          data: { emailSentAt: NOW.toISOString(), resendAt: null, sendAttempts: 0 },
        }),
      )
    })

    it('closes a checkout left open on the old link first', async () => {
      resends = [
        payment({
          status: 'checkout_pending',
          stripeCheckoutSessionId: 'cs_open',
          resendAt: '2026-10-09T22:00:00.000Z',
        }),
      ]
      stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_open', status: 'open' })

      expect(await run()).toMatchObject({ sent: 1 })
      expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_open')
    })

    it('drops the resend without emailing when the client has just paid', async () => {
      resends = [
        payment({
          status: 'checkout_pending',
          stripeCheckoutSessionId: 'cs_done',
          resendAt: '2026-10-09T22:00:00.000Z',
        }),
      ]
      stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_done', status: 'complete' })

      expect(await run()).toMatchObject({ sent: 0, skipped: 1 })
      expect(sendBrevoEmail).not.toHaveBeenCalled()
      expect(payload.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 31, data: { resendAt: null } }),
      )
    })

    it('tries again next run when Stripe cannot be reached', async () => {
      resends = [
        payment({
          status: 'checkout_pending',
          stripeCheckoutSessionId: 'cs_x',
          resendAt: '2026-10-09T22:00:00.000Z',
        }),
      ]
      stripe.getHostingCheckoutSession.mockRejectedValue(new Error('network'))

      expect(await run()).toMatchObject({ sent: 0, skipped: 1 })
      expect(sendBrevoEmail).not.toHaveBeenCalled()
      expect(payload.update).not.toHaveBeenCalled()
    })

    it('counts a failed email so it stops retrying after five tries', async () => {
      sendBrevoEmail.mockResolvedValue({ ok: false, code: 'brevo-error' })
      vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(await run()).toMatchObject({ sent: 0, failed: 1 })
      expect(payload.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: 31, data: { sendAttempts: 1 } }),
      )
    })
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

describe('resending a one-off payment link', () => {
  const resend = async (paymentId = '31', clientId = '8', body?: unknown) => {
    const { POST } =
      await import('@/app/(frontend)/api/clients/[id]/hosting-one-off-payments/[paymentId]/resend/route')
    return POST(
      new NextRequest(
        `http://localhost/api/clients/${clientId}/hosting-one-off-payments/${paymentId}/resend`,
        {
          method: 'POST',
          ...(body === undefined
            ? {}
            : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        },
      ),
      { params: Promise.resolve({ id: clientId, paymentId }) },
    )
  }
  // The reissue rule itself runs against real SQLite in hosting-one-off-payment-status.test.ts.
  const run = payload.db.drizzle.run

  beforeEach(() => {
    run.mockResolvedValue({ rowsAffected: 1 })
    payload.findByID.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'clients'
        ? { id: 8, name: 'We Can Quit' }
        : payment({ expiresAt: '2020-01-01T00:00:00.000Z' }),
    )
  })

  it('emails a new link to the frozen recipient and returns it, even after the old one expired', async () => {
    const response = await resend()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.url).toMatch(/^https:\/\/cms\.test\/hosting-pay\/once\/[\w-]{43}$/)
    expect(body).toMatchObject({ emailSent: true, emailedTo: 'billing@example.com' })
    const sent = sendBrevoEmail.mock.calls[0]?.[0]
    expect(sent.to).toEqual([{ email: 'billing@example.com', name: 'Sam' }])
    expect(sent.subject).toBe('Payment request: Backdated hosting, July to September 2026')
    expect(sent.textContent).toContain(body.url)
    // Sending now also settles any resend that was scheduled for later.
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 31,
        data: { emailSentAt: expect.any(String), resendAt: null, sendAttempts: 0 },
      }),
    )
  })

  it('closes a checkout left open on the old link before reissuing', async () => {
    payload.findByID.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'clients'
        ? { id: 8, name: 'We Can Quit' }
        : payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_open' }),
    )
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_open', status: 'open' })

    expect((await resend()).status).toBe(200)
    expect(stripe.expireHostingCheckoutSession).toHaveBeenCalledWith('cs_open')
  })

  it('refuses when the client has just paid', async () => {
    payload.findByID.mockResolvedValue(
      payment({ status: 'checkout_pending', stripeCheckoutSessionId: 'cs_done' }),
    )
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_done', status: 'complete' })

    const response = await resend()

    expect(response.status).toBe(409)
    expect(run).not.toHaveBeenCalled()
    expect(sendBrevoEmail).not.toHaveBeenCalled()
  })

  it('does not email when a checkout started in the meantime', async () => {
    run.mockResolvedValue({ rowsAffected: 0 })

    const response = await resend()

    expect(response.status).toBe(409)
    expect(sendBrevoEmail).not.toHaveBeenCalled()
  })

  it('still returns the new link when the email fails', async () => {
    sendBrevoEmail.mockResolvedValue({ ok: false, code: 'brevo-error' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const body = await (await resend()).json()

    expect(body.emailSent).toBe(false)
    expect(body.url).toMatch(/^https:\/\/cms\.test\/hosting-pay\/once\//)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it.each([
    ['paid', 'This payment has already been made.'],
    ['revoked', 'This link was cancelled. Send a new payment link instead.'],
    ['scheduled', 'This link has not been emailed yet. It goes out on its scheduled date.'],
  ])('refuses a %s link', async (status, error) => {
    payload.findByID.mockResolvedValue(payment({ status }))

    const response = await resend()

    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe(error)
    expect(run).not.toHaveBeenCalled()
  })

  it("treats another client's link as not found", async () => {
    payload.findByID.mockResolvedValue(payment({ client: 99 }))

    expect((await resend()).status).toBe(404)
    expect(run).not.toHaveBeenCalled()
  })

  it('is limited to staff with hosting billing access', async () => {
    payload.auth.mockResolvedValue({ user: { id: 2, features: ['clients'] } })

    expect((await resend()).status).toBe(403)
    expect(run).not.toHaveBeenCalled()
  })

  it('greets by the client contact name when the link saved no name', async () => {
    payload.findByID.mockImplementation(async ({ collection }: { collection: string }) =>
      collection === 'clients'
        ? { id: 8, name: 'We Can Quit', contactName: 'Peter Lee' }
        : payment({ snapshot: { ...snapshot, recipientName: '' } }),
    )

    await resend()

    expect(sendBrevoEmail.mock.calls[0]?.[0].textContent.startsWith('Hi Peter,')).toBe(true)
  })

  it('schedules a resend for 9am Sydney without changing the current link', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T02:00:00.000Z'))
    try {
      const response = await resend('31', '8', { sendOn: '2026-10-10' })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ resendAt: '2026-10-09T22:00:00.000Z' })
      expect(payload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 31,
          data: { resendAt: '2026-10-09T22:00:00.000Z', sendAttempts: 0 },
        }),
      )
      expect(run).not.toHaveBeenCalled()
      expect(sendBrevoEmail).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a scheduled resend', async () => {
    const response = await resend('31', '8', { cancelSchedule: true })

    expect(await response.json()).toEqual({ resendAt: null })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 31, data: { resendAt: null, sendAttempts: 0 } }),
    )
    expect(sendBrevoEmail).not.toHaveBeenCalled()
  })

  it('rejects a resend date that is not after today', async () => {
    const response = await resend('31', '8', { sendOn: '2020-01-01' })

    expect(response.status).toBe(400)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('will not schedule a resend for a paid link', async () => {
    payload.findByID.mockResolvedValue(payment({ status: 'paid' }))
    const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

    expect((await resend('31', '8', { sendOn: nextMonth })).status).toBe(409)
    expect(payload.update).not.toHaveBeenCalled()
  })
})

describe('removing a cancelled one-off payment link from the list', () => {
  const hide = async (paymentId = '31', clientId = '8') => {
    const { POST } =
      await import('@/app/(frontend)/api/clients/[id]/hosting-one-off-payments/[paymentId]/hide/route')
    return POST(
      new NextRequest(
        `http://localhost/api/clients/${clientId}/hosting-one-off-payments/${paymentId}/hide`,
        { method: 'POST' },
      ),
      { params: Promise.resolve({ id: clientId, paymentId }) },
    )
  }

  it('hides a cancelled link but keeps the record', async () => {
    payload.findByID.mockResolvedValue(payment({ status: 'revoked' }))

    const response = await hide()

    expect(response.status).toBe(200)
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'hosting-one-off-payments',
        id: 31,
        data: { hiddenAt: expect.any(String) },
      }),
    )
    // Only the hidden flag changes; the status and history stay as they were.
    expect(payload.update).toHaveBeenCalledTimes(1)
  })

  it.each(['active', 'checkout_pending', 'scheduled', 'paid'])(
    'refuses to remove a %s link',
    async (status) => {
      payload.findByID.mockResolvedValue(payment({ status }))

      const response = await hide()

      expect(response.status).toBe(409)
      expect((await response.json()).error).toBe(
        'Only cancelled payment links can be removed. Cancel it first.',
      )
      expect(payload.update).not.toHaveBeenCalled()
    },
  )

  it('keeps a cancelled link visible while its Stripe checkout is still open', async () => {
    payload.findByID.mockResolvedValue(
      payment({ status: 'revoked', stripeCheckoutSessionId: 'cs_open' }),
    )
    stripe.getHostingCheckoutSession.mockResolvedValue({ id: 'cs_open', status: 'open' })

    const response = await hide()

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('Click Cancel link again')
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('removes a cancelled link whose checkout is closed or gone', async () => {
    payload.findByID.mockResolvedValue(
      payment({ status: 'revoked', stripeCheckoutSessionId: 'cs_gone' }),
    )
    stripe.getHostingCheckoutSession.mockRejectedValue(missing)

    expect((await hide()).status).toBe(200)
    expect(payload.update).toHaveBeenCalled()
  })

  it("treats another client's link as not found", async () => {
    payload.findByID.mockResolvedValue(payment({ status: 'revoked', client: 99 }))

    expect((await hide()).status).toBe(404)
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('leaves removed links out of the client page list', async () => {
    const { GET } = await import('@/app/(frontend)/api/clients/[id]/hosting-one-off-payments/route')
    payload.find.mockResolvedValue({ docs: [] })

    await GET(new NextRequest('http://localhost/api/clients/8/hosting-one-off-payments'), {
      params: Promise.resolve({ id: '8' }),
    })

    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { and: [{ client: { equals: 8 } }, { hiddenAt: { exists: false } }] },
      }),
    )
  })
})
