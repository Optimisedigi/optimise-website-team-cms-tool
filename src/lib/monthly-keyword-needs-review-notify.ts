import type { Payload } from 'payload'
import { getEffectiveFeatures } from './access'
import { logActivity } from './activity-log'

const NOTIFICATIONS = 'notifications' as never
const USERS = 'users' as never
const NEGATIVE_KEYWORDS_FEATURE = 'negative-keyword-lists'
const NOTIFICATION_KIND = 'negative-keywords-needs-review'

type UserRow = { id: number | string; role?: string }

/**
 * Bell notifications when a month of monthly negative-keyword review is
 * marked complete.
 *
 *  - Staff (non-admins who can use the negatives tool) get the "N terms need
 *    review" alert, only when the month still has terms flagged "needs review".
 *  - Admins get one "ready for your review" alert every time a month is marked
 *    complete, except the admin who marked it complete themselves.
 *
 * Also logs an activity entry when terms still need review.
 */
export async function notifyMonthlyNegativesComplete(
  payload: Payload,
  args: {
    clientId: number
    clientName: string
    yearMonth: string
    needsReviewCount: number
    triggeredByUserId?: number | string | null
    triggeredByName?: string | null
  },
): Promise<void> {
  const { clientId, clientName, yearMonth, needsReviewCount } = args
  const month = monthLabel(yearMonth)
  const url = `/admin/monthly-keyword-selection?clientId=${clientId}`
  const flagged = `${needsReviewCount} term${needsReviewCount === 1 ? '' : 's'} flagged "needs review"`
  const needsReviewTitle = `${needsReviewCount} monthly negative${needsReviewCount === 1 ? '' : 's'} need review — ${clientName}`
  const needsReviewBody = `${month} review completed with ${flagged}.`
  const triggeredBy = args.triggeredByUserId == null ? '' : String(args.triggeredByUserId)

  try {
    const usersResult = await payload.find({
      collection: USERS,
      where: {},
      limit: 500,
      depth: 1,
      overrideAccess: true,
    })
    const users = usersResult.docs as UserRow[]
    const admins = users.filter((u) => u?.role === 'admin' && String(u.id) !== triggeredBy)
    const staff = needsReviewCount > 0
      ? users.filter((u) => u?.role !== 'admin' && getEffectiveFeatures(u).has(NEGATIVE_KEYWORDS_FEATURE))
      : []

    const completedBy = args.triggeredByName?.trim()
    const adminBody = [
      `${month} marked complete${completedBy ? ` by ${completedBy}` : ''}.`,
      needsReviewCount > 0 ? `${flagged}.` : 'No terms flagged "needs review".',
    ].join(' ')

    for (const admin of admins) {
      await payload.create({
        collection: NOTIFICATIONS,
        data: {
          recipient: admin.id,
          kind: NOTIFICATION_KIND,
          title: `${month} negatives ready for your review — ${clientName}`,
          body: adminBody,
          url,
          relatedClient: clientId,
        } as never,
        overrideAccess: true,
      })
    }
    for (const member of staff) {
      await payload.create({
        collection: NOTIFICATIONS,
        data: {
          recipient: member.id,
          kind: NOTIFICATION_KIND,
          title: needsReviewTitle,
          body: needsReviewBody,
          url,
          relatedClient: clientId,
        } as never,
        overrideAccess: true,
      })
    }
  } catch (err) {
    payload.logger?.warn?.(`[monthly-negatives-notify] notification fan-out failed: ${err}`)
  }

  if (needsReviewCount <= 0) return
  try {
    await logActivity(payload, {
      type: 'monthly_negative_needs_review',
      title: needsReviewTitle,
      description: needsReviewBody,
      client: clientId,
      ...(args.triggeredByUserId ? { user: args.triggeredByUserId } : {}),
    })
  } catch (err) {
    payload.logger?.warn?.(`[monthly-negatives-notify] activity log failed: ${err}`)
  }
}

function monthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  return new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, 1)))
}
