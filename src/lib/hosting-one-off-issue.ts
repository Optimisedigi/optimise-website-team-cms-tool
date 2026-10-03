import crypto from 'node:crypto'
import type { Payload } from 'payload'
import { hashOfferToken } from './hosting-billing'
import {
  billingRecipientName,
  buildOneOffPaymentEmail,
  createOneOffQuote,
  ONE_OFF_LINK_DAYS,
  type OneOffRequest,
  type OneOffSnapshot,
  type Result,
} from './hosting-one-off-payment'
import {
  claimScheduledForSend,
  MAX_SCHEDULED_SEND_ATTEMPTS,
  reissuePayableLink,
  returnToSchedule,
} from './hosting-one-off-payment-status'
import { sendBrevoEmail } from './brevo-email'
import { loadStatementTemplates } from './invoice-statement-templates'
import {
  expireHostingCheckoutSession,
  getCmsUrl,
  getHostingCheckoutSession,
  isStripeMissingResource,
} from './stripe'

/**
 * Issuing and emailing one-off payment links. Shared by the client page, the
 * AdminMate confirm action and the scheduled-send cron so all three create
 * the same frozen snapshot and send the same email.
 */

type EmailOutcome = { ok: boolean; code?: string; status?: number }

export type IssuedOneOffPayment = {
  payment: any
  /** Only for links emailed now; a scheduled link's URL does not exist yet. */
  url?: string
  emailSent: boolean
  emailedTo?: string
}

const newToken = (): string => crypto.randomBytes(32).toString('base64url')
const linkExpiry = (from: Date): string =>
  new Date(from.getTime() + ONE_OFF_LINK_DAYS * 86_400_000).toISOString()

export async function sendOneOffPaymentEmail(
  payload: Payload,
  input: { clientName: string; snapshot: OneOffSnapshot; url: string; expiresAt: string },
): Promise<EmailOutcome> {
  try {
    const accounts = await loadStatementTemplates(payload)
    return await sendBrevoEmail({
      sender: { email: accounts.fromEmail, name: 'Optimise Digital' },
      replyTo: { email: accounts.replyToEmail },
      to: [
        {
          email: input.snapshot.recipientEmail,
          ...(input.snapshot.recipientName ? { name: input.snapshot.recipientName } : {}),
        },
      ],
      ...buildOneOffPaymentEmail({
        clientName: input.clientName,
        snapshot: input.snapshot,
        url: input.url,
        expiresAt: input.expiresAt,
        logoUrl: `${getCmsUrl()}/brand/optimise-digital-logo.png`,
      }),
    })
  } catch {
    return { ok: false, code: 'email-build-failed' }
  }
}

/**
 * Loads what a later send needs: the client's name, and the frozen snapshot
 * with a blank greeting name filled from the client's current name (links
 * made before names were captured, or before a name was entered).
 */
async function emailContext(
  payload: Payload,
  payment: any,
): Promise<{ clientName: string; snapshot: OneOffSnapshot }> {
  const frozen = payment.snapshot as OneOffSnapshot
  try {
    const client: any = await payload.findByID({
      collection: 'clients',
      id: typeof payment.client === 'object' ? payment.client.id : payment.client,
      depth: 0,
      overrideAccess: true,
    })
    const recipientName = frozen.recipientName?.trim() || billingRecipientName(client)
    return { clientName: client.name || '', snapshot: { ...frozen, recipientName } }
  } catch {
    // The email still reads correctly without the client's details.
    return { clientName: '', snapshot: frozen }
  }
}

async function markEmailed(payload: Payload, id: number | string, at: Date): Promise<void> {
  await payload.update({
    collection: 'hosting-one-off-payments',
    id,
    data: { emailSentAt: at.toISOString() },
    overrideAccess: true,
  })
}

/**
 * Creates a one-off payment link for a client and either emails it now or
 * schedules the email. A scheduled link holds a throwaway token that is never
 * shown to anyone, so it cannot be paid until its real email goes out.
 */
export async function issueOneOffPayment(
  payload: Payload,
  input: { clientId: number; request: OneOffRequest; now: Date },
): Promise<Result<IssuedOneOffPayment, { status: number; error: string }>> {
  let client: any
  try {
    client = await payload.findByID({
      collection: 'clients',
      id: input.clientId,
      depth: 0,
      overrideAccess: true,
    })
  } catch {
    return { ok: false, error: { status: 404, error: 'Client not found.' } }
  }
  const hosting = client.hostingSubscription || {}
  if (!hosting.recipientEmail)
    return {
      ok: false,
      error: { status: 422, error: 'Add a billing email in the hosting section first.' },
    }

  const settings: any = await payload.findGlobal({
    slug: 'hosting-billing-settings',
    overrideAccess: true,
  })
  const snapshot: OneOffSnapshot = {
    description: input.request.description,
    quote: createOneOffQuote(input.request.baseCents, settings.currency || 'aud', {
      percentage: Number(settings.cardSurchargePercentage),
      fixedCents: Number(settings.cardSurchargeFixedCents),
    }),
    recipientEmail: hosting.recipientEmail,
    recipientName: billingRecipientName(client),
  }
  const scheduledSendAt = input.request.scheduledSendAt
  const token = newToken()
  // A scheduled link's expiry is reset when its email goes out.
  const expiresAt = linkExpiry(scheduledSendAt ? new Date(scheduledSendAt) : input.now)
  const payment: any = await payload.create({
    collection: 'hosting-one-off-payments',
    data: {
      client: input.clientId,
      tokenHash: hashOfferToken(token),
      status: scheduledSendAt ? 'scheduled' : 'active',
      expiresAt,
      ...(scheduledSendAt ? { scheduledSendAt } : {}),
      sendAttempts: 0,
      snapshot: { ...snapshot, quote: { ...snapshot.quote } },
    },
    overrideAccess: true,
  })
  if (scheduledSendAt) return { ok: true, value: { payment, emailSent: false } }

  const url = `${getCmsUrl()}/hosting-pay/once/${token}`
  // The link is live once saved, so a failed email must not hide it: the
  // admin still gets the URL back and can send it by hand.
  const email = await sendOneOffPaymentEmail(payload, {
    clientName: client.name,
    snapshot,
    url,
    expiresAt,
  })
  if (email.ok) {
    await markEmailed(payload, payment.id, input.now)
    payment.emailSentAt = input.now.toISOString()
  } else {
    console.error('[hosting-one-off-payments] payment email failed', {
      clientId: input.clientId,
      paymentId: payment.id,
      code: email.code,
      status: email.status,
    })
  }
  return {
    ok: true,
    value: {
      payment,
      url,
      emailSent: email.ok,
      ...(email.ok ? { emailedTo: snapshot.recipientEmail } : {}),
    },
  }
}

/**
 * Before a link is reissued, closes any Stripe checkout the client left open
 * on the old link, so only the new link can be paid. 'paid' means the client
 * has just paid (nothing to resend); 'unreachable' means Stripe could not be
 * checked, so nothing should change yet.
 */
export async function closeOldCheckout(payment: any): Promise<'ok' | 'paid' | 'unreachable'> {
  const sessionId: string | null = payment.stripeCheckoutSessionId || null
  if (payment.status !== 'checkout_pending' || !sessionId) return 'ok'
  try {
    const session = await getHostingCheckoutSession(sessionId)
    if (session.status === 'complete') return 'paid'
    if (session.status === 'open') await expireHostingCheckoutSession(session.id)
    return 'ok'
  } catch (error) {
    return isStripeMissingResource(error) ? 'ok' : 'unreachable'
  }
}

/**
 * Emails a sent link again with a new token and a fresh 14 days. The link in
 * the earlier email stops working. Fails (returns null) if a checkout was
 * started since `seenSessionId` was read, so a client paying right now is
 * never cut off. The amount and recipient stay as they were frozen.
 */
export async function resendOneOffPayment(
  payload: Payload,
  input: { payment: any; seenSessionId: string | null; now: Date },
): Promise<{ url: string; emailSent: boolean; emailedTo?: string } | null> {
  const { payment, now } = input
  const token = newToken()
  const expiresAt = linkExpiry(now)
  const reissued = await reissuePayableLink((payload.db as any).drizzle, {
    id: payment.id,
    tokenHash: hashOfferToken(token),
    expiresAt,
    seenSessionId: input.seenSessionId,
    now,
  })
  if (!reissued) return null

  const { clientName, snapshot } = await emailContext(payload, payment)
  const url = `${getCmsUrl()}/hosting-pay/once/${token}`
  const email = await sendOneOffPaymentEmail(payload, { clientName, snapshot, url, expiresAt })
  if (email.ok)
    // A resend also settles any resend that was scheduled for later.
    await payload.update({
      collection: 'hosting-one-off-payments',
      id: payment.id,
      data: { emailSentAt: now.toISOString(), resendAt: null, sendAttempts: 0 },
      overrideAccess: true,
    })
  else
    console.error('[hosting-one-off-payments] resend email failed', {
      paymentId: payment.id,
      code: email.code,
      status: email.status,
    })
  return {
    url,
    emailSent: email.ok,
    ...(email.ok ? { emailedTo: snapshot.recipientEmail } : {}),
  }
}

export type ScheduledSendSummary = { due: number; sent: number; failed: number; skipped: number }

const MAX_PER_RUN = 25

/**
 * Emails every scheduled one-off payment link whose send time has passed.
 * Each link is claimed in one conditional update before its email goes out,
 * so overlapping runs never email a client twice and a cancelled link is
 * never sent. A failed email puts the link back on the schedule (with a new
 * throwaway token) to retry next run, up to MAX_SCHEDULED_SEND_ATTEMPTS.
 */
export async function sendDueScheduledOneOffPayments(
  payload: Payload,
  now: Date,
): Promise<ScheduledSendSummary> {
  const due = await payload.find({
    collection: 'hosting-one-off-payments',
    where: {
      and: [
        { status: { equals: 'scheduled' } },
        { scheduledSendAt: { less_than_equal: now.toISOString() } },
        { sendAttempts: { less_than: MAX_SCHEDULED_SEND_ATTEMPTS } },
      ],
    },
    sort: 'scheduledSendAt',
    limit: MAX_PER_RUN,
    depth: 0,
    overrideAccess: true,
  })
  const db = (payload.db as any).drizzle
  const summary: ScheduledSendSummary = { due: due.docs.length, sent: 0, failed: 0, skipped: 0 }

  for (const payment of due.docs as any[]) {
    const token = newToken()
    const expiresAt = linkExpiry(now)
    const claimed = await claimScheduledForSend(db, {
      id: payment.id,
      tokenHash: hashOfferToken(token),
      expiresAt,
      now,
    })
    if (!claimed) {
      summary.skipped += 1
      continue
    }

    const { clientName, snapshot } = await emailContext(payload, payment)
    const email = await sendOneOffPaymentEmail(payload, {
      clientName,
      snapshot,
      url: `${getCmsUrl()}/hosting-pay/once/${token}`,
      expiresAt,
    })
    if (email.ok) {
      await markEmailed(payload, payment.id, now)
      summary.sent += 1
      continue
    }
    // Nobody received this link, so retire its token before the retry.
    await returnToSchedule(db, { id: payment.id, tokenHash: hashOfferToken(newToken()), now })
    summary.failed += 1
    console.error('[hosting-one-off-payments] scheduled payment email failed', {
      paymentId: payment.id,
      attempt: Number(payment.sendAttempts ?? 0) + 1,
      code: email.code,
      status: email.status,
    })
  }

  const resends = await sendDueScheduledResends(payload, now)
  return {
    due: summary.due + resends.due,
    sent: summary.sent + resends.sent,
    failed: summary.failed + resends.failed,
    skipped: summary.skipped + resends.skipped,
  }
}

/**
 * Resends unpaid links whose scheduled resend date has passed, exactly like
 * the Resend link button: the client gets a new link valid for 14 days and
 * the old one stops working. The old link keeps working until then. Paid and
 * cancelled links are never picked up, so paying or cancelling stops it.
 */
async function sendDueScheduledResends(payload: Payload, now: Date): Promise<ScheduledSendSummary> {
  const due = await payload.find({
    collection: 'hosting-one-off-payments',
    where: {
      and: [
        { status: { in: ['active', 'checkout_pending'] } },
        { resendAt: { less_than_equal: now.toISOString() } },
        { sendAttempts: { less_than: MAX_SCHEDULED_SEND_ATTEMPTS } },
      ],
    },
    sort: 'resendAt',
    limit: MAX_PER_RUN,
    depth: 0,
    overrideAccess: true,
  })
  const summary: ScheduledSendSummary = { due: due.docs.length, sent: 0, failed: 0, skipped: 0 }

  for (const payment of due.docs as any[]) {
    const checkout = await closeOldCheckout(payment)
    if (checkout === 'paid') {
      // Stripe's webhook will mark it paid; nothing to resend.
      await payload.update({
        collection: 'hosting-one-off-payments',
        id: payment.id,
        data: { resendAt: null },
        overrideAccess: true,
      })
      summary.skipped += 1
      continue
    }
    if (checkout === 'unreachable') {
      summary.skipped += 1
      continue
    }
    const resent = await resendOneOffPayment(payload, {
      payment,
      seenSessionId: payment.stripeCheckoutSessionId || null,
      now,
    })
    if (!resent) {
      // The link changed since it was read (paid, cancelled or a new checkout); retry next run.
      summary.skipped += 1
      continue
    }
    if (resent.emailSent) {
      summary.sent += 1
      continue
    }
    await payload.update({
      collection: 'hosting-one-off-payments',
      id: payment.id,
      data: { sendAttempts: Number(payment.sendAttempts ?? 0) + 1 },
      overrideAccess: true,
    })
    summary.failed += 1
  }
  return summary
}
