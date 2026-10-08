import {
  annualSavingCents,
  formatMoney,
  type HostingInterval,
  type HostingQuote,
} from './hosting-billing'
import { formatBillingDate, planBillingStart } from './hosting-billing-schedule'
import { firstName } from './hosting-one-off-payment'
import { escapeHtml } from '@/lib/html-escape'

export type HostingOfferEmail = { subject: string; htmlContent: string; textContent: string }

/**
 * The sign-off block shared with the invoice statement emails (Email Templates
 * → Invoice Statement + Signature), so accounts emails all close the same way.
 */
export type AccountsSignOff = { signOff: string; senderName: string; signatureHtml: string }

/**
 * The email that delivers a hosting payment link to the client. A client set
 * up for annual billing sees only the annual price. Otherwise the email shows
 * both totals (surcharge included), monthly first.
 */
export function buildHostingOfferEmail(input: {
  clientName: string
  recipientName?: string | null
  monthly: HostingQuote
  annual: HostingQuote
  defaultInterval: HostingInterval
  /** Day hosting billing starts (YYYY-MM-DD); blank = the day they sign up. */
  billingStartDate?: string | null
  renewalNote: string
  now: Date
  url: string
  expiresAt: string
  signOff: AccountsSignOff
}): HostingOfferEmail {
  const { monthly, annual, signOff } = input
  const annualOnly = input.defaultInterval === 'year'
  // The recipient name is editable in the hosting section; greet by first name.
  const name = firstName(input.recipientName)
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const expires = new Date(input.expiresAt).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const savingCents = annualSavingCents(monthly, annual)
  const options = [
    {
      label: 'Monthly',
      value: `${formatMoney(monthly.totalCents, monthly.currency)} per month`,
      interval: 'month',
    },
    {
      label: 'Annual',
      value: `${formatMoney(annual.totalCents, annual.currency)} per year${
        savingCents > 0 ? ` (save ${formatMoney(savingCents, annual.currency)})` : ''
      }`,
      interval: 'year',
    },
  ].filter((option) => !annualOnly || option.interval === 'year')
  const shown = annualOnly ? [annual] : [monthly, annual]
  const surchargeNote = shown.some((quote) => quote.surchargeCents > 0)
    ? `${annualOnly ? 'Price includes' : 'Prices include'} a card processing surcharge, itemised on the payment page.`
    : ''
  const start = planBillingStart(input.billingStartDate, input.defaultInterval, input.now)
  const scheduleNote =
    start.kind === 'future'
      ? `No payment is taken until ${formatBillingDate(start.startDate)}, when your hosting starts. Payments then renew on that date each ${
          annualOnly ? 'year' : 'month or year, depending on the option you choose'
        }.`
      : ''

  const subject = `Set up your ${monthly.planName} payment for ${input.clientName}`
  const intro = annualOnly
    ? `Your ${monthly.planName} for ${input.clientName} is ready. Use the secure link below to set up your annual card payment.`
    : `Your ${monthly.planName} for ${input.clientName} is ready. Use the secure link below to choose monthly or annual billing and set up automatic card payments.`
  const footer = `This link expires on ${expires}. Payments are processed securely by Stripe; we never see or store your card details.`

  const textContent = [
    greeting,
    intro,
    options.map((option) => `${option.label}: ${option.value}`).join('\n'),
    ...(surchargeNote ? [surchargeNote] : []),
    ...(scheduleNote ? [scheduleNote] : []),
    input.renewalNote,
    `Set up payment: ${input.url}`,
    footer,
    `${signOff.signOff}\n${signOff.senderName}`,
  ].join('\n\n')

  const rows = options
    .map(
      (option) =>
        `<tr><td style="padding:4px 16px 4px 0;font-weight:600;">${escapeHtml(option.label)}</td>` +
        `<td style="padding:4px 0;">${escapeHtml(option.value)}</td></tr>`,
    )
    .join('')

  // The sign-off markup matches the invoice statement email exactly. The
  // signature is admin-authored HTML from Email Templates, inserted as-is
  // the same way the statement email does.
  const htmlContent = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2933;max-width:560px;">
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(intro)}</p>
<table role="presentation" style="border-collapse:collapse;margin:16px 0;">${rows}</table>
${surchargeNote ? `<p style="font-size:13px;color:#52606d;">${escapeHtml(surchargeNote)}</p>` : ''}
${scheduleNote ? `<p><strong>${escapeHtml(scheduleNote)}</strong></p>` : ''}
<p style="white-space:pre-line;">${escapeHtml(input.renewalNote)}</p>
<p style="margin:24px 0;"><a href="${escapeHtml(input.url)}" style="background:#1f6feb;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Set up payment</a></p>
<p style="font-size:13px;color:#52606d;">${escapeHtml(footer)}</p>
<p style="font-size:13px;color:#52606d;">If the button doesn't work, copy this link into your browser:<br>${escapeHtml(input.url)}</p>
<p style="margin:20px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${escapeHtml(signOff.signOff)}</p>
<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${escapeHtml(signOff.senderName)}</p>
<div style="margin-top:8px;">${signOff.signatureHtml}</div>
</div>`

  return { subject, htmlContent, textContent }
}
