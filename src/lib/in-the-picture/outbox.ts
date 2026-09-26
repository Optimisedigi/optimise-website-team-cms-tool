import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import type { BlogPost } from '@/payload-types'
import { configuredClientId, websiteUrl } from './config'
import { publishedEvent } from './article'

async function hydratedPost(
  payload: Payload,
  post: BlogPost,
  req?: PayloadRequest,
): Promise<BlogPost> {
  let featuredImage = post.featuredImage
  if (typeof featuredImage === 'number')
    featuredImage = await payload.findByID({
      collection: 'media',
      id: featuredImage,
      overrideAccess: true,
      ...(req ? { req } : {}),
    })
  const content = post.content ? structuredClone(post.content) : null
  if (content?.root?.children) {
    const visit = async (nodes: Record<string, unknown>[]): Promise<void> => {
      for (const node of nodes) {
        if (node.type === 'upload' && typeof node.value === 'number')
          node.value = await payload.findByID({
            collection: 'media',
            id: node.value,
            overrideAccess: true,
            ...(req ? { req } : {}),
          })
        if (Array.isArray(node.children)) await visit(node.children as Record<string, unknown>[])
      }
    }
    await visit(content.root.children)
  }
  return { ...post, featuredImage, content }
}

async function checkedPublishedEvent(
  payload: Payload,
  post: BlogPost,
  req?: PayloadRequest,
): Promise<Record<string, unknown>> {
  const clientId = configuredClientId()
  if (!clientId) throw new Error('Sync client not configured')
  const ideaId = post.websiteBlogIdeaId || undefined
  if (ideaId) {
    const idea = await payload.find({
      collection: 'blog-ideas',
      where: { and: [{ blogId: { equals: ideaId } }, { client: { equals: clientId } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      ...(req ? { req } : {}),
    })
    if (!idea.docs.length)
      throw new Error('The linked website Blog ID does not belong to this client')
  }
  const client = await payload.findByID({
    collection: 'clients',
    id: clientId,
    depth: 0,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  if (!client.authors?.some((author) => author.name === post.author))
    throw new Error('Byline does not match this client’s public blog-author profile')
  return publishedEvent(await hydratedPost(payload, post, req), ideaId)
}

function clientOf(post: BlogPost): number | null {
  return typeof post.client === 'number' ? post.client : post.client?.id || null
}
export function nextRevision(previous?: string | null, now = Date.now()): string {
  const prior = previous ? Date.parse(previous) : 0
  return new Date(Math.max(now, Number.isFinite(prior) ? prior + 1 : now)).toISOString()
}
export async function enqueuePost(
  payload: Payload,
  post: BlogPost,
  previous?: BlogPost | null,
  req?: PayloadRequest,
  deleted = false,
): Promise<void> {
  const clientId = configuredClientId()
  if (!clientId || (clientOf(post) !== clientId && (!previous || clientOf(previous) !== clientId)))
    return
  const wasPublished =
    previous?.status === 'published' && previous.clientConfirmed && clientOf(previous) === clientId
  const isPublished =
    !deleted && post.status === 'published' && post.clientConfirmed && clientOf(post) === clientId
  if (!isPublished && !wasPublished) return
  const postId = String(post.id)
  const revision = post.websiteSyncRevision || nextRevision(previous?.websiteSyncRevision)
  let body: Record<string, unknown>
  if (isPublished) {
    body = await checkedPublishedEvent(payload, { ...post, websiteSyncRevision: revision }, req)
  } else body = { version: 1, event: 'unpublished', postId, revision }
  const encoded = JSON.stringify(body)
  if (Buffer.byteLength(encoded) > 2_000_000) throw new Error('Article event exceeds 2 MB')
  const eventKey = `${postId}:${revision}`
  const found = await payload.find({
    collection: 'blog-sync-events',
    where: { eventKey: { equals: eventKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  if (found.docs.length) {
    if (found.docs[0].clientId !== clientId) throw new Error('Sync event belongs to another client')
    if (JSON.stringify(found.docs[0].body) !== encoded) throw new Error('Conflicting sync revision')
    return
  }
  await payload.create({
    collection: 'blog-sync-events',
    data: {
      eventKey,
      clientId,
      postId,
      revision,
      kind: isPublished ? 'published' : 'unpublished',
      body,
      state: 'pending',
      attempts: 0,
    },
    depth: 0,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
}

type DbClient = {
  execute: (statement: {
    sql: string
    args: Array<string | number | null>
  }) => Promise<{ rowsAffected: number }>
}
/** SQL conditional update is the lease; Payload's read-then-update alone cannot claim across cron instances. */
async function claim(
  payload: Payload,
  id: number,
  clientId: number,
  now: string,
  token: string,
): Promise<boolean> {
  const db = (payload.db as unknown as { client?: DbClient }).client
  if (!db) throw new Error('LibSQL client unavailable')
  const result = await db.execute({
    sql: "UPDATE blog_sync_events SET lease_token = ?, lease_until = ? WHERE id = ? AND client_id = ? AND (lease_until IS NULL OR lease_until < ?) AND state IN ('pending','retry') AND (next_attempt IS NULL OR next_attempt <= ?)",
    args: [token, new Date(Date.now() + 90000).toISOString(), id, clientId, now, now],
  })
  return result.rowsAffected === 1
}
export async function reconcilePosts(
  payload: Payload,
): Promise<{ scanned: number; queued: number; errors: number }> {
  const client = configuredClientId()
  if (!client) throw new Error('Sync client not configured')
  let page = 1
  const result = { scanned: 0, queued: 0, errors: 0 }
  while (true) {
    const posts = await payload.find({
      collection: 'blog-posts',
      where: {
        and: [
          { client: { equals: client } },
          { clientConfirmed: { equals: true } },
          { status: { equals: 'published' } },
        ],
      },
      page,
      limit: 50,
      depth: 1,
      overrideAccess: true,
    })
    for (const post of posts.docs) {
      result.scanned++
      try {
        const latest = await payload.find({
          collection: 'blog-sync-events',
          where: {
            and: [{ postId: { equals: String(post.id) } }, { clientId: { equals: client } }],
          },
          sort: '-revision',
          limit: 1,
          depth: 0,
          overrideAccess: true,
        })
        const previous = latest.docs[0]
        const snapshot = await checkedPublishedEvent(payload, {
          ...post,
          websiteSyncRevision: previous?.revision ?? post.websiteSyncRevision,
        })
        if (
          previous?.kind === 'published' &&
          JSON.stringify(previous.body) === JSON.stringify(snapshot)
        )
          continue
        const lastRevision = [previous?.revision, post.websiteSyncRevision]
          .filter((value): value is string => typeof value === 'string')
          .sort()
          .at(-1)
        const revision = nextRevision(lastRevision)
        await enqueuePost(payload, { ...post, websiteSyncRevision: revision })
        result.queued++
      } catch (error) {
        result.errors++
        console.error('[itp-sync] backfill rejected', {
          postId: post.id,
          reason: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }
    if (!posts.hasNextPage) break
    page++
  }
  return result
}

export async function deliverPending(
  payload: Payload,
): Promise<{ delivered: number; reviewed: number; retried: number }> {
  const url = websiteUrl('/api/content-sync/articles')
  const token = process.env.CONTENT_CMS_SYNC_TOKEN
  if (!url || !token || token.length < 32 || !configuredClientId())
    throw new Error('Delivery not configured')
  const clientId = configuredClientId()
  if (!clientId) throw new Error('Sync client not configured')
  const now = new Date().toISOString()
  const pending = await payload.find({
    collection: 'blog-sync-events',
    where: {
      and: [
        { clientId: { equals: clientId } },
        { state: { in: ['pending', 'retry'] } },
        { or: [{ nextAttempt: { exists: false } }, { nextAttempt: { less_than_equal: now } }] },
      ],
    },
    sort: 'createdAt',
    limit: 8,
    depth: 0,
    overrideAccess: true,
  })
  const result = { delivered: 0, reviewed: 0, retried: 0 }
  for (const event of pending.docs) {
    const lease = randomUUID()
    if (!(await claim(payload, event.id, clientId, now, lease))) continue
    const started = Date.now()
    let state: 'delivered' | 'retry' | 'review' | 'superseded' = 'retry'
    let error = ''
    try {
      const newer = await payload.find({
        collection: 'blog-sync-events',
        where: {
          and: [
            { postId: { equals: event.postId } },
            { clientId: { equals: clientId } },
            { revision: { greater_than: event.revision } },
          ],
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (newer.docs.length && event.kind === 'published') {
        state = 'superseded'
        error = 'Superseded by newer event'
      } else {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event.body),
          signal: AbortSignal.timeout(12000),
          redirect: 'error',
          cache: 'no-store',
        })
        await response.body?.cancel()
        if (response.status === 200) state = 'delivered'
        else if (response.status === 409 || response.status === 422) {
          state = 'review'
          error = `Website rejected event (${response.status})`
        } else error = `Website unavailable (${response.status})`
      }
    } catch {
      error = 'Website request failed or timed out'
    }
    const attempts = event.attempts + 1
    const db = (payload.db as unknown as { client?: DbClient }).client
    if (!db) throw new Error('LibSQL client unavailable')
    // A stale worker cannot acknowledge an event whose lease has been claimed elsewhere.
    await db.execute({
      sql: 'UPDATE blog_sync_events SET state = ?, attempts = ?, last_error = ?, next_attempt = ?, acknowledged_at = ?, lease_token = NULL, lease_until = NULL, updated_at = ? WHERE id = ? AND lease_token = ?',
      args: [
        state,
        attempts,
        error,
        state === 'retry'
          ? new Date(
              Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(attempts, 12)),
            ).toISOString()
          : null,
        state === 'delivered' ? new Date().toISOString() : null,
        new Date().toISOString(),
        event.id,
        lease,
      ],
    })
    if (state === 'delivered') result.delivered++
    if (state === 'review') result.reviewed++
    if (state === 'retry') result.retried++
    console.info('[itp-sync] article delivery', {
      postId: event.postId,
      state,
      attempts,
      elapsedMs: Date.now() - started,
    })
  }
  return result
}
