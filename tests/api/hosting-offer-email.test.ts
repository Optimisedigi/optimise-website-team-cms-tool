import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createHostingQuote } from '@/lib/hosting-billing'
import { buildHostingOfferEmail } from '@/lib/hosting-offer-email'

/**
 * Creating a hosting offer emails the payment link to the billing contact. The
 * offer must still be returned when the email fails, so the admin can send the
 * link by hand.
 */

const payload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  findGlobal: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}
const sendBrevoEmail = vi.fn()

vi.mock('payload', () => ({ getPayload: vi.fn(async () => payload) }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/access', () => ({ userHasFeature: () => true }))
vi.mock('@/lib/brevo-email', () => ({
  sendBrevoEmail: (...args: unknown[]) => sendBrevoEmail(...args),
}))
vi.mock('@/lib/stripe', () => ({
  getCmsUrl: () => 'https://cms.test',
  isStripeMissingResource: () => false,
  getHostingCheckoutSession: vi.fn(),
  expireHostingCheckoutSession: vi.fn(),
}))

const surcharge = { percentage: 1.75, fixedCents: 30 }
const quote = (baseCents: number, interval: 'month' | 'year') =>
  createHostingQuote({
    currency: 'aud',
    allowance: '',
    clause: '',
    planName: 'Managed Website Hosting',
    surcharge,
    baseCents,
    interval,
  })

beforeEach(() => {
  vi.clearAllMocks()
  payload.auth.mockResolvedValue({ user: { id: 1, role: 'admin' } })
  payload.findGlobal.mockImplementation(async ({ slug }: { slug: string }) =>
    slug === 'email-templates'
      ? {
          statementFromEmail: 'accounts@optimisedigital.online',
          statementReplyToEmail: 'accounts-replies@optimisedigital.online',
          statementSignOff: 'Kind regards,',
          statementSenderName: 'Maria',
          signatureHtml: '<table><tr><td>Optimise Digital brand block</td></tr></table>',
        }
      : {
          currency: 'aud',
          cardSurchargePercentage: surcharge.percentage,
          cardSurchargeFixedCents: surcharge.fixedCents,
        },
  )
  payload.findByID.mockResolvedValue({
    id: 8,
    name: 'Cipher Health',
    hostingSubscription: {
      planName: 'Managed Website Hosting',
      recipientEmail: 'billing@example.com',
      recipientName: 'Sam',
      monthlyBaseCents: 9900,
      annualBaseCents: 106920,
      billingInterval: 'year',
    },
  })
  payload.create.mockResolvedValue({ id: 77 })
  payload.update.mockResolvedValue({})
})

const issue = async () => {
  const { POST } = await import('@/app/(frontend)/api/clients/[id]/hosting-offers/route')
  return POST(
    new NextRequest('http://localhost/api/clients/8/hosting-offers', { method: 'POST' }),
    {
      params: Promise.resolve({ id: '8' }),
    },
  )
}

describe('emailing the hosting payment link', () => {
  it('sends the link to the billing contact and reports it', async () => {
    sendBrevoEmail.mockResolvedValue({ ok: true, messageId: 'm1' })

    const response = await issue()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.emailSent).toBe(true)
    expect(body.emailedTo).toBe('billing@example.com')
    const sent = sendBrevoEmail.mock.calls[0]?.[0]
    expect(sent.to).toEqual([{ email: 'billing@example.com', name: 'Sam' }])
    expect(sent.htmlContent).toContain(body.url)
    expect(sent.textContent).toContain(body.url)
  })

  it('sends from accounts with the invoice statement reply-to and signature', async () => {
    sendBrevoEmail.mockResolvedValue({ ok: true })

    await issue()

    const sent = sendBrevoEmail.mock.calls[0]?.[0]
    expect(sent.sender).toEqual({
      email: 'accounts@optimisedigital.online',
      name: 'Optimise Digital',
    })
    expect(sent.replyTo).toEqual({ email: 'accounts-replies@optimisedigital.online' })
    expect(sent.htmlContent).toContain('Kind regards,')
    expect(sent.htmlContent).toContain('Maria')
    expect(sent.htmlContent).toContain(
      '<table><tr><td>Optimise Digital brand block</td></tr></table>',
    )
    expect(sent.textContent).toContain('Kind regards,\nMaria')
  })

  it('still returns the link when the email templates cannot be loaded', async () => {
    payload.findGlobal.mockImplementation(async ({ slug }: { slug: string }) => {
      if (slug === 'email-templates') throw new Error('db down')
      return { currency: 'aud', cardSurchargePercentage: 0, cardSurchargeFixedCents: 0 }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await issue()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.url).toMatch(/^https:\/\/cms\.test\/hosting-pay\//)
    expect(body.emailSent).toBe(false)
    expect(sendBrevoEmail).not.toHaveBeenCalled()
  })

  it('still returns the link when the email fails', async () => {
    sendBrevoEmail.mockResolvedValue({ ok: false, code: 'no-api-key' })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await issue()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.url).toMatch(/^https:\/\/cms\.test\/hosting-pay\//)
    expect(body.emailSent).toBe(false)
    expect(payload.create).toHaveBeenCalledOnce()
  })
})

describe('buildHostingOfferEmail', () => {
  const build = (
    defaultInterval: 'month' | 'year',
    annualBaseCents = 106920,
    billingStartDate: string | null = null,
  ) =>
    buildHostingOfferEmail({
      clientName: 'Cipher <Health>',
      recipientName: 'Sam',
      monthly: quote(9900, 'month'),
      annual: quote(annualBaseCents, 'year'),
      defaultInterval,
      billingStartDate,
      renewalNote: 'Renews automatically. Tell us to cancel & we stop straight away.',
      now: new Date('2026-10-02T00:00:00.000Z'),
      url: 'https://cms.test/hosting-pay/abc',
      expiresAt: '2026-10-09T00:00:00.000Z',
      signOff: { signOff: 'Thanks,', senderName: 'Maria', signatureHtml: '' },
    })

  it('shows no saving when the plan has no annual discount', () => {
    // 12 x $99 with no discount. One yearly card charge still carries less
    // fixed surcharge than twelve monthly ones, but that is not a discount.
    const { textContent, htmlContent } = build('month', 118800)

    expect(textContent).toContain('Annual: $1,209.47 per year')
    expect(textContent).not.toContain('save')
    expect(htmlContent).not.toContain('save')
  })

  it('shows both billing options with surcharge-inclusive totals and the annual discount as the saving', () => {
    // 10% off 12 x $99 = $118.80 off the hosting fee. The card fee difference
    // between one yearly and twelve monthly charges is not counted.
    const { textContent } = build('month')

    expect(textContent).toContain('Monthly: $101.07 per month')
    expect(textContent).toContain('Annual: $1,088.55 per year (save $118.80)')
    expect(textContent).toContain('card processing surcharge')
    expect(textContent).toContain('9 October 2026')
  })

  it('shows only the annual price to a client set up for annual billing', () => {
    const { textContent, htmlContent } = build('year')

    expect(textContent).toContain('Annual: $1,088.55 per year (save $118.80)')
    expect(textContent).not.toContain('Monthly')
    expect(textContent).not.toContain('$101.07')
    expect(htmlContent).not.toContain('Monthly')
    expect(textContent).toContain('set up your annual card payment')
    expect(textContent).toContain('Price includes a card processing surcharge')
  })

  it('includes the renewal and cancellation note', () => {
    const { textContent, htmlContent } = build('month')

    expect(textContent).toContain(
      'Renews automatically. Tell us to cancel & we stop straight away.',
    )
    expect(htmlContent).toContain(
      'Renews automatically. Tell us to cancel &amp; we stop straight away.',
    )
  })

  it('says no payment is taken until a future billing start date', () => {
    expect(build('year', 106920, '2026-11-15').textContent).toContain(
      'No payment is taken until 15 November 2026, when your hosting starts. Payments then renew on that date each year.',
    )
    expect(build('month').textContent).not.toContain('No payment is taken')
  })

  it('escapes client-supplied text in the HTML', () => {
    const { htmlContent } = build('month')

    expect(htmlContent).toContain('Cipher &lt;Health&gt;')
    expect(htmlContent).not.toContain('Cipher <Health>')
  })
})
