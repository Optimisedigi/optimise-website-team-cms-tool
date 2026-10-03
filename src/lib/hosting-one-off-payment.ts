import { calculateCardSurcharge, formatMoney, type SurchargeConfig } from './hosting-billing'

/**
 * One-off hosting payments: a single card charge (for example, backdated
 * hosting) paid through a private link, separate from the recurring
 * subscription. The same disclosed card surcharge applies.
 */

export const ONE_OFF_LINK_DAYS = 14
const MAX_DESCRIPTION_LENGTH = 200
/** Guards against a mistyped amount (an extra zero) reaching a client. */
const MAX_AMOUNT_CENTS = 5_000_000

export type OneOffQuote = Readonly<{
  currency: string
  baseCents: number
  surchargeCents: number
  totalCents: number
}>

/** Frozen when the link is issued; settings edits never change a sent link. */
export type OneOffSnapshot = Readonly<{
  description: string
  quote: OneOffQuote
  recipientEmail: string
  recipientName: string
}>

export type OneOffRequest = Readonly<{
  description: string
  baseCents: number
  /** When the email goes out (ISO); null sends it straight away. */
  scheduledSendAt: string | null
}>

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

/** Scheduled payment emails go out at this local time on the chosen day. */
export const SCHEDULED_SEND_HOUR = 9
export const SCHEDULE_TIME_ZONE = 'Australia/Sydney'
const MAX_SCHEDULE_DAYS = 365

/** The local calendar date (YYYY-MM-DD) in Sydney for an instant. */
export function sydneyDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** The instant it is `hour`:00 in Sydney on a YYYY-MM-DD date (daylight-saving aware). */
export function sydneyTimeOn(ymd: string, hour: number): Date {
  const [y = 0, m = 1, d = 1] = ymd.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: SCHEDULE_TIME_ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
    })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, Number(part.value)]),
  )
  const wall = Date.UTC(parts.year ?? y, (parts.month ?? m) - 1, parts.day ?? d, parts.hour ?? hour)
  return new Date(guess - (wall - guess))
}

/**
 * Validates an optional send date (YYYY-MM-DD, Sydney). Blank means send now;
 * otherwise it must be a real date after today and within a year.
 */
export function parseSendOn(value: unknown, now: Date): Result<string | null, string> {
  if (value === undefined || value === null || value === '') return { ok: true, value: null }
  const text = typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const real =
    match &&
    new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text &&
    Number(match[1]) >= 2000
  if (!real) return { ok: false, error: 'Enter the send date as a calendar date.' }
  if (text <= sydneyDate(now))
    return { ok: false, error: 'Pick a send date after today, or leave it blank to send now.' }
  const sendAt = sydneyTimeOn(text, SCHEDULED_SEND_HOUR)
  if (sendAt.getTime() - now.getTime() > MAX_SCHEDULE_DAYS * 86_400_000)
    return { ok: false, error: 'Schedule the email within the next 12 months.' }
  return { ok: true, value: sendAt.toISOString() }
}

/** Validates the admin's description, dollar amount and optional send date. */
export function parseOneOffRequest(
  body: unknown,
  now: Date = new Date(),
): Result<OneOffRequest, string> {
  const { description, amount, sendOn } = (body ?? {}) as {
    description?: unknown
    amount?: unknown
    sendOn?: unknown
  }
  const text = typeof description === 'string' ? description.trim() : ''
  if (!text) return { ok: false, error: 'Describe what the payment is for.' }
  if (text.length > MAX_DESCRIPTION_LENGTH)
    return { ok: false, error: `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.` }
  const dollars =
    typeof amount === 'number' ? amount : typeof amount === 'string' ? Number(amount) : NaN
  if (!Number.isFinite(dollars) || dollars <= 0)
    return { ok: false, error: 'Enter an amount above $0.' }
  const baseCents = Math.round(dollars * 100)
  if (Math.abs(baseCents - dollars * 100) > 1e-6)
    return { ok: false, error: 'Use at most two decimal places for the amount.' }
  if (baseCents > MAX_AMOUNT_CENTS)
    return { ok: false, error: `One-off payments are limited to ${formatMoney(MAX_AMOUNT_CENTS)}.` }
  const schedule = parseSendOn(sendOn, now)
  if (!schedule.ok) return schedule
  return { ok: true, value: { description: text, baseCents, scheduledSendAt: schedule.value } }
}

export function createOneOffQuote(
  baseCents: number,
  currency: string,
  surcharge: SurchargeConfig,
): OneOffQuote {
  const surchargeCents = calculateCardSurcharge(baseCents, surcharge)
  return {
    currency: currency.toLowerCase(),
    baseCents,
    surchargeCents,
    totalCents: baseCents + surchargeCents,
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const MONO = 'font-family:Menlo,Consolas,monospace;'

/**
 * Who a billing email greets: the name set in the hosting section, else the
 * client's main Contact Name.
 */
export function billingRecipientName(client: {
  contactName?: string | null
  hostingSubscription?: { recipientName?: string | null } | null
}): string {
  return String(client.hostingSubscription?.recipientName || client.contactName || '').trim()
}

/** The first name from a contact name ("Sam Lee" -> "Sam"), or '' when blank. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

/**
 * The email that delivers a one-off payment link. Layout follows the approved
 * design (export 3/email.html), without a sign-off or signature.
 */
export function buildOneOffPaymentEmail(input: {
  clientName: string
  snapshot: OneOffSnapshot
  url: string
  expiresAt: string
  /** Absolute URL of the Optimise Digital logo for the email header. */
  logoUrl: string
}): { subject: string; htmlContent: string; textContent: string } {
  const { snapshot } = input
  const { quote } = snapshot
  const name = firstName(snapshot.recipientName)
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const expires = new Date(input.expiresAt).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const total = formatMoney(quote.totalCents, quote.currency)
  const rows: Array<[string, string]> = [
    [snapshot.description, formatMoney(quote.baseCents, quote.currency)],
    ...(quote.surchargeCents > 0
      ? [
          ['Card processing surcharge', formatMoney(quote.surchargeCents, quote.currency)] as [
            string,
            string,
          ],
        ]
      : []),
    ['Total', total],
  ]

  const subject = `Payment request: ${snapshot.description}`
  const intro = `Please use the secure link below to pay ${total} for ${input.clientName}. This is a one-off card payment; it does not set up any recurring charge.`
  const footer = `This link expires on ${expires}. Payments are processed securely by Stripe; we never see or store your card details.`

  const payLabel = `Pay ${total} securely`
  const methods = 'One-off payment · Card, Apple Pay, Google Pay'

  const textContent = [
    greeting,
    intro,
    rows.map(([label, value]) => `${label}: ${value}`).join('\n'),
    `${payLabel}: ${input.url}`,
    methods,
    footer,
  ].join('\n\n')

  const url = escapeHtml(input.url)
  const tableRows = rows
    .map(([label, value], index) => {
      const isTotal = index === rows.length - 1
      const cell = isTotal
        ? 'padding:14px 18px;font-weight:bold;background:#faf9f7;'
        : 'padding:14px 18px;border-bottom:1px solid #eeece8;'
      return (
        `<tr><td style="${cell}${isTotal ? '' : 'color:#55534e;'}">${escapeHtml(label)}</td>` +
        `<td align="right" style="${cell}${MONO}">${escapeHtml(value)}</td></tr>`
      )
    })
    .join('\n')

  // Table layout keeps the design intact in Outlook and Gmail.
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f3f0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3f0;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;font-family:Helvetica,Arial,sans-serif;color:#141414;">
<tr><td style="background:#ffffff;border:1px solid #e4e2dd;border-radius:12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:28px 40px;border-bottom:1px solid #eeece8;">
<img src="${escapeHtml(input.logoUrl)}" alt="Optimise Digital" height="26" style="display:block;height:26px;border:0;">
</td></tr>
<tr><td style="padding:24px 40px 0;font-size:16px;line-height:1.6;color:#2a2926;">
<p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
<p style="margin:0;">${escapeHtml(intro)}</p>
</td></tr>
<tr><td style="padding:28px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #eeece8;border-radius:8px;font-size:15px;">
${tableRows}
</table>
</td></tr>
<tr><td style="padding:28px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="background:#141414;border-radius:8px;">
<a href="${url}" style="display:block;padding:16px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">${escapeHtml(payLabel)}</a>
</td></tr>
</table>
<p style="margin:12px 0 0;text-align:center;font-size:13px;color:#77756f;">${escapeHtml(methods)}</p>
</td></tr>
<tr><td style="padding:28px 40px 36px;font-size:13px;line-height:1.6;color:#77756f;">
<p style="margin:0 0 10px;">${escapeHtml(footer)}</p>
<p style="margin:0;">If the button doesn't work, copy this link into your browser:<br>
<a href="${url}" style="color:#141414;word-break:break-all;">${url}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, htmlContent, textContent }
}
