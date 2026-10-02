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

/** The email that delivers a one-off payment link, signed like the invoice statements. */
export function buildOneOffPaymentEmail(input: {
  clientName: string
  snapshot: OneOffSnapshot
  url: string
  expiresAt: string
  signOff: AccountsSignOff
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

  const textContent = [
    greeting,
    intro,
    rows.map(([label, value]) => `${label}: ${value}`).join('\n'),
    `Pay now: ${input.url}`,
    footer,
    `${signOff.signOff}\n${signOff.senderName}`,
  ].join('\n\n')

  const tableRows = rows
    .map(
      ([label, value], index) =>
        `<tr><td style="padding:4px 16px 4px 0;${index === rows.length - 1 ? 'font-weight:600;' : ''}">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;text-align:right;${index === rows.length - 1 ? 'font-weight:600;' : ''}">${escapeHtml(value)}</td></tr>`,
    )
    .join('')

  // Sign-off markup matches the invoice statement email. The signature is
  // admin-authored HTML from Email Templates, inserted as-is like the statement.
  const htmlContent = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2933;max-width:560px;">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(intro)}</p>
<table role="presentation" style="border-collapse:collapse;margin:16px 0;">${tableRows}</table>
<p style="margin:24px 0;"><a href="${escapeHtml(input.url)}" style="background:#1f6feb;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Pay now</a></p>
<p style="font-size:13px;color:#52606d;">${escapeHtml(footer)}</p>
<p style="font-size:13px;color:#52606d;">If the button doesn't work, copy this link into your browser:<br>${escapeHtml(input.url)}</p>
<p style="margin:20px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${escapeHtml(signOff.signOff)}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${escapeHtml(signOff.senderName)}</p>
<div style="margin-top:8px;">${signOff.signatureHtml}</div>
</div>`

  return { subject, htmlContent, textContent }
}
