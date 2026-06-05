import type { Payload } from 'payload'
import { getEffectiveFeatures } from './access'
import { logActivity } from './activity-log'

const NOTIFICATIONS = 'notifications' as never
const USERS = 'users' as never
const NEGATIVE_KEYWORDS_FEATURE = 'negative-keyword-lists'
const NOTIFICATION_KIND = 'negative-keywords-needs-review'

/**
 * Fan out a bell notification + activity-log entry when a month of monthly
 * negative-keyword review is marked complete while it still contains terms
 * flagged "needs review".
 *
 * Recipients: every user with role `admin` OR whose effective feature set
 * includes `negative-keyword-lists` (the people who can use the tool).
 */
export async function notifyMonthlyNegativesNeedReview(
  payload: Payload,
  args: {
    clientId: number
    clientName: string
    clientSlug: string
    yearMonth: string
    needsReviewCount: number
    triggeredByUserId?: number | string | null
  },
): Promise<void> {
  const { clientId, clientName, clientSlug, yearMonth, needsReviewCount } = args
  if (needsReviewCount <= 0) return

  const url = `/admin/collections/clients/${clientId}`
  const title = `${needsReviewCount} monthly negative${needsReviewCount === 1 ? '' : 's'} need review — ${clientName}`
  const body = `${monthLabel(yearMonth)} review completed with ${needsReviewCount} term${needsReviewCount === 1 ? '' : 's'} flagged "needs review".`

  try {
    const usersResult = await payload.find({
      collection: USERS,
      where: {},
      limit: 500,
      depth: 1,
      overrideAccess: true,
    })

    const recipients = (usersResult.docs as Array<{ id: number | string; role?: string }>).filter((u) => {
      if (u?.role === 'admin') return true
      return getEffectiveFeatures(u).has(NEGATIVE_KEYWORDS_FEATURE)
    })

    for (const recipient of recipients) {
      await payload.create({
        collection: NOTIFICATIONS,
        data: {
          recipient: recipient.id,
          kind: NOTIFICATION_KIND,
          title,
          body,
          url,
          relatedClient: clientId,
        } as never,
        overrideAccess: true,
      })
    }
  } catch (err) {
    payload.logger?.warn?.(`[monthly-negatives-notify] notification fan-out failed: ${err}`)
  }

  try {
    await logActivity(payload, {
      type: 'monthly_negative_needs_review',
      title,
      description: body,
      client: clientId,
      ...(args.triggeredByUserId ? { user: args.triggeredByUserId } : {}),
    })
  } catch (err) {
    payload.logger?.warn?.(`[monthly-negatives-notify] activity log failed: ${err}`)
  }

  void clientSlug
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}
