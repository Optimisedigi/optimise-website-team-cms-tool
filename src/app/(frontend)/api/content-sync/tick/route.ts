import { getPayload } from 'payload'
import config from '@/payload.config'
import { matchesBearer, configuredClientId } from '@/lib/in-the-picture/config'
import { pullIdeas } from '@/lib/in-the-picture/ideas'
import { deliverPending, reconcilePosts } from '@/lib/in-the-picture/outbox'
import { isAdmin, userHasFeature } from '@/lib/access'

export const runtime = 'nodejs'
export const maxDuration = 300
async function tick(): Promise<Response> {
  if (!configuredClientId()) return Response.json({ error: 'Not configured' }, { status: 503 })
  try {
    const payload = await getPayload({ config })
    let ideas: Awaited<ReturnType<typeof pullIdeas>> | null = null
    let posts: Awaited<ReturnType<typeof reconcilePosts>> | null = null
    let deliveries: Awaited<ReturnType<typeof deliverPending>> | null = null
    const errors: string[] = []
    try { ideas = await pullIdeas(payload) } catch { errors.push('idea pull'); console.error('[itp-sync] idea pull failed') }
    try { posts = await reconcilePosts(payload); if (posts.errors) errors.push(`${posts.errors} post(s) need editorial review`) } catch { errors.push('post reconciliation'); console.error('[itp-sync] post reconciliation failed') }
    try { deliveries = await deliverPending(payload) } catch { errors.push('delivery'); console.error('[itp-sync] delivery failed') }
    return Response.json({ ideas, posts, deliveries, errors }, { status: errors.length ? 503 : 200 })
  } catch (error) {
    console.error('[itp-sync] tick failed', { reason: error instanceof Error ? error.message : 'Unknown' })
    return Response.json({ error: 'Sync failed; retry later' }, { status: 503 })
  }
}
export async function GET(request: Request): Promise<Response> {
  if (!matchesBearer(request, process.env.CRON_SECRET)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return tick()
}
export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin' }, { status: 403 })
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!isAdmin(user) || !userHasFeature(user, 'blog-posts')) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json()
    if (body && typeof body === 'object' && 'eventKey' in body && typeof body.eventKey === 'string') {
      const event = await payload.find({ collection: 'blog-sync-events', where: { and: [{ eventKey: { equals: body.eventKey } }, { clientId: { equals: configuredClientId() } }] }, limit: 1, overrideAccess: true })
      if (!event.docs.length) return Response.json({ error: 'Event not found' }, { status: 404 })
      if (!['review', 'retry', 'pending'].includes(event.docs[0].state) || (event.docs[0].leaseUntil && Date.parse(event.docs[0].leaseUntil) > Date.now())) return Response.json({ error: 'Event cannot be retried' }, { status: 409 })
      await payload.update({ collection: 'blog-sync-events', id: event.docs[0].id, data: { state: 'pending', nextAttempt: null, lastError: null, leaseToken: null, leaseUntil: null }, overrideAccess: true })
    } else if (body && typeof body === 'object' && Object.keys(body).length) return Response.json({ error: 'Invalid request' }, { status: 400 })
    return tick()
  } catch (error) {
    console.error('[itp-sync] manual tick failed', { reason: error instanceof Error ? error.message : 'Unknown' })
    return Response.json({ error: 'Sync failed; retry later' }, { status: 503 })
  }
}
