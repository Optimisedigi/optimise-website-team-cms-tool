import { calculateCardSurcharge, formatMoney, type SurchargeConfig } from './hosting-billing'
import type { AccountsSignOff } from './hosting-offer-email'

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

export type OneOffRequest = Readonly<{ description: string; baseCents: number }>

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

/** Validates the admin's description and dollar amount. */
export function parseOneOffRequest(body: unknown): Result<OneOffRequest, string> {
  const { description, amount } = (body ?? {}) as { description?: unknown; amount?: unknown }
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
  return { ok: true, value: { description: text, baseCents } }
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
 * The email that delivers a one-off payment link. Layout follows the approved
 * design (export 3/email.html). The signature HTML is supplied by the caller.
 */
export function buildOneOffPaymentEmail(input: {
  clientName: string
  snapshot: OneOffSnapshot
  url: string
  expiresAt: string
  signOff: AccountsSignOff
  /** Absolute URL of the Optimise Digital logo for the email header. */
  logoUrl: string
}): { subject: string; htmlContent: string; textContent: string } {
  const { snapshot, signOff } = input
  const { quote } = snapshot
  const greeting = snapshot.recipientName.trim() ? `Hi ${snapshot.recipientName.trim()},` : 'Hi,'
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

  const subject = `Payment request from Optimise Digital: ${snapshot.description}`
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
    `${signOff.signOff}\n${signOff.senderName}`,
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

  // Table layout keeps the design intact in Outlook and Gmail. The signature is
  // trusted HTML supplied by the route (the design's signature image).
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
<tr><td style="padding:40px 40px 0;font-size:16px;line-height:1.6;color:#2a2926;">
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
<tr><td style="padding:24px 8px 0;font-size:16px;line-height:1.6;color:#2a2926;">
<p style="margin:0;">${escapeHtml(signOff.signOff)}</p>
<p style="margin:0 0 14px;">${escapeHtml(signOff.senderName)}</p>
<div>${signOff.signatureHtml}</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, htmlContent, textContent }
}
