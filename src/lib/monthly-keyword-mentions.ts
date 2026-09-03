import type { Payload } from 'payload'
import { userHasFeature } from '@/lib/access'
import { MAX_MENTION_TAGS, parseTaggedUserIds, type MentionTeammate } from '@/lib/monthly-keyword-mention-text'

export { MAX_MENTION_TAGS, parseTaggedUserIds }
export type { MentionTeammate }

const NOTIFICATIONS = 'notifications' as never

export function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

export async function listMentionableTeammates(payload: Payload): Promise<MentionTeammate[]> {
  const usersResult = await payload.find({
    collection: 'users',
    limit: 500,
    depth: 0,
    overrideAccess: true,
    sort: 'name',
  })
  return (usersResult.docs as Array<{ id: number | string; name?: string; email?: string; role?: string }>).flatMap((user) => {
    if (!userHasFeature(user, 'negative-keyword-lists')) return []
    return [{ id: String(user.id), label: user.name || user.email || `User ${user.id}` }]
  })
}

export async function resolveMentionableUserIds(
  payload: Payload,
  requested: unknown,
  actorId: string,
): Promise<string[]> {
  const requestedIds = parseTaggedUserIds(requested).filter((id) => id !== String(actorId))
  if (requestedIds.length === 0) return []
  const allowed = new Set((await listMentionableTeammates(payload)).map((mate) => mate.id))
  return requestedIds.filter((id) => allowed.has(id))
}

export async function notifyTaggedUsers(
  payload: Payload,
  args: {
    recipientIds: string[]
    actorId: string
    authorName: string
    clientId: number
    yearMonth: string
    searchTerm: string
    comment: string
    kind?: 'negative-keywords-needs-review' | 'negative-keywords-removed'
    title?: string | ((clientName: string) => string)
  },
): Promise<number> {
  const recipientIds = Array.from(new Set(args.recipientIds.map(String)))
    .filter((id) => id && id !== String(args.actorId))
    .slice(0, MAX_MENTION_TAGS)
  if (recipientIds.length === 0) return 0

  const client = await payload
    .findByID({ collection: 'clients', id: args.clientId, depth: 0, overrideAccess: true })
    .catch(() => null) as { name?: string } | null
  const clientName = client?.name || `Client ${args.clientId}`
  const reason = args.comment.trim() ? `: ${args.comment.trim().slice(0, 140)}` : ''
  const title = typeof args.title === 'function'
    ? args.title(clientName)
    : args.title || `${args.authorName} tagged you on a negative keyword — ${clientName}`
  let notified = 0
  for (const recipientId of recipientIds) {
    try {
      await payload.create({
        collection: NOTIFICATIONS,
        data: {
          recipient: recipientId,
          kind: args.kind || 'negative-keywords-needs-review',
          title,
          body: `${monthLabel(args.yearMonth)} · "${args.searchTerm}"${reason}`,
          url: `/admin/monthly-keyword-selection?clientId=${args.clientId}`,
          relatedClient: args.clientId,
        } as never,
        overrideAccess: true,
      })
      notified += 1
    } catch (err) {
      payload.logger?.warn?.(`[monthly-keyword-mentions] notify failed for ${recipientId}: ${err}`)
    }
  }
  return notified
}
