import type { Payload } from 'payload'
import { cmsMailThreadPath } from './drafts'

/**
 * "Client email – please read" alerts.
 *
 * When a mailbox sync stores a NEW inbound email from a known client, one
 * `notifications` row is created for the mailbox owner (and nobody else).
 * They are listed in the top-bar bell like any notification; one that
 * arrives while the CMS is open also drops down once under the bell
 * (ClientEmailAlert). Opening it sets `readAt`.
 *
 * Noise limits (all plain code, no model):
 *  - Only inbound mail whose SENDER is a client (an email that only copies a
 *    client in does not count), after the sync's hidden-sender and
 *    automated-mail filters.
 *  - Only the user's main Gmail; extra accounts in Mail never alert.
 *  - Only during incremental syncs (never the 14-day first sync or a
 *    history-expired re-sync, which would flood the user with old mail).
 *  - Only emails dated within ALERT_MAX_AGE_MS.
 *  - At most MAX_ALERTS_PER_SYNC rows per sync; the rest stay in Mail.
 *  - One row per Gmail message (deduped on recipient + kind + url).
 */

export const CLIENT_EMAIL_ALERT_KIND = 'client-email-received'
export const ALERT_MAX_AGE_MS = 24 * 60 * 60 * 1000
export const MAX_ALERTS_PER_SYNC = 5

type PayloadLike = Pick<Payload, 'find' | 'create'>

export interface ClientEmailAlertInput {
  ownerId: number
  clientId: number
  clientName: string
  from: string
  subject: string
  gmailThreadId: string
  gmailMessageId: string
  /** Email date (ISO or RFC 2822). Unknown dates count as fresh. */
  date: string
  /** Extra Gmail account the email arrived in, so the alert opens Mail on it; omitted = main Gmail. */
  account?: string
}

/** Display name from a From header: `Jo Smith <jo@x.com>` -> `Jo Smith`. */
export function senderLabel(from: string): string {
  const trimmed = (from ?? '').trim()
  const named = trimmed.match(/^"?([^"<]+?)"?\s*<[^>]+>$/)
  if (named?.[1]) return named[1].trim()
  return trimmed.replace(/^<|>$/g, '')
}

export function isFreshEmail(date: string, now: Date): boolean {
  if (!date) return true
  const time = new Date(date).getTime()
  if (Number.isNaN(time)) return true
  return now.getTime() - time <= ALERT_MAX_AGE_MS
}

export function alertUrl(input: Pick<ClientEmailAlertInput, 'gmailThreadId' | 'account'>): string {
  return cmsMailThreadPath(input.gmailThreadId, input.account)
}

/**
 * Create the alert row for one stored inbound client email.
 * Returns true when a row was created.
 */
export async function createClientEmailAlert(
  payload: PayloadLike,
  input: ClientEmailAlertInput,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isFreshEmail(input.date, now)) return false
  const url = alertUrl(input)

  const existing = await payload.find({
    collection: 'notifications',
    where: {
      and: [
        { recipient: { equals: input.ownerId } },
        { kind: { equals: CLIENT_EMAIL_ALERT_KIND } },
        { url: { equals: url } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never)
  if ((existing as { docs: unknown[] }).docs.length > 0) return false

  const sender = senderLabel(input.from) || 'Unknown sender'
  const subject = (input.subject || '(no subject)').slice(0, 200)
  await payload.create({
    collection: 'notifications',
    overrideAccess: true,
    data: {
      recipient: input.ownerId,
      kind: CLIENT_EMAIL_ALERT_KIND,
      title: `Client email – please read: ${input.clientName || 'Client'}`.slice(0, 200),
      body: `${sender.slice(0, 120)} · ${subject}`,
      url,
      relatedClient: input.clientId,
    },
  } as never)
  return true
}
