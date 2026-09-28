import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { BlogPost } from '@/payload-types'
import { BlogPosts } from '@/collections/BlogPosts'
import { inThePictureSchema } from '@/lib/in-the-picture/schema'
import { applyReviewDecision, reviewDecisionSchema } from '@/lib/in-the-picture/review-decision'
import { deliverPending, enqueuePost, nextRevision, reconcilePosts } from '@/lib/in-the-picture/outbox'

const environment = { ...process.env }
afterEach(() => { process.env = { ...environment }; vi.unstubAllGlobals() })
const token = 'a'.repeat(40)
const revision = '2026-09-26T00:00:00.000Z'
const review = {
  id: 31, client: 1, clientConfirmed: true, status: 'review', websiteSyncRevision: revision,
  slug: 'brief', title: 'Brief', excerpt: 'Introduction', author: 'Jane Editor',
  publishedDate: '2026-09-25T00:00:00.000Z', readingTime: '5 min read',
  websiteCategory: 'tax-tips', websiteServiceSlug: 'accounting',
  markdownContent: '## Heading\n\nPlain text.',
} as BlogPost

function queue() {
  const events: Array<Record<string, unknown>> = []
  const payload = {
    findByID: vi.fn(async () => ({ id: 1, authors: [{ name: 'Jane Editor' }] })),
    find: vi.fn(async ({ collection, where }: { collection: string; where: { eventKey?: { equals: string } } }) => ({
      docs: collection === 'blog-sync-events' ? events.filter(event => event.eventKey === where.eventKey?.equals) : [],
    })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { events.push(data); return data }),
  }
  return { events, payload }
}

describe('private In The Picture article review', () => {
  it('queues only confirmed client reviews, edits and withdrawals without publishing', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const { events, payload } = queue()
    await enqueuePost(payload as never, review)
    await enqueuePost(payload as never, review)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'review_requested', state: 'pending', revision })
    expect(events[0].body).toMatchObject({ event: 'review_requested', postId: '31', revision, article: { title: 'Brief' } })
    const edited = { ...review, title: 'Edited', websiteSyncRevision: nextRevision(revision, Date.parse(revision)) }
    await enqueuePost(payload as never, edited, review)
    expect(events[1].body).toMatchObject({ event: 'review_requested', article: { title: 'Edited' } })
    const draft = { ...edited, status: 'draft' as const, websiteSyncRevision: nextRevision(edited.websiteSyncRevision, Date.parse(edited.websiteSyncRevision ?? '')) }
    await enqueuePost(payload as never, draft, edited)
    expect(events[2].body).toMatchObject({ event: 'review_withdrawn', postId: '31' })
    await enqueuePost(payload as never, { ...review, id: 32, clientConfirmed: false })
    await enqueuePost(payload as never, { ...review, id: 33, client: 2 })
    expect(events).toHaveLength(3)
  })

  it('unpublishes a live article before asking for private review at the same revision', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const { events, payload } = queue()
    const published = { ...review, status: 'published' as const, websiteSyncRevision: '2026-09-25T00:00:00.000Z' }
    await enqueuePost(payload as never, review, published)
    await enqueuePost(payload as never, review, published)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      eventKey: `31:${revision}:unpublished`, kind: 'unpublished',
      body: { event: 'unpublished', postId: '31', revision },
    })
    expect(events[1]).toMatchObject({
      eventKey: `31:${revision}`, kind: 'review_requested',
      body: { event: 'review_requested', postId: '31', revision },
    })
  })

  it('reconciles existing review drafts once without silently publishing them', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const events: Array<Record<string, unknown>> = []
    const payload = {
      findByID: vi.fn(async () => ({ id: 1, authors: [{ name: 'Jane Editor' }] })),
      find: vi.fn(async ({ collection, where }: { collection: string; where?: { eventKey?: { equals: string } } }) => {
        if (collection === 'blog-posts') return { docs: [review], hasNextPage: false }
        if (collection === 'blog-sync-events') return { docs: where?.eventKey ? events.filter(event => event.eventKey === where.eventKey?.equals) : events.slice(-1) }
        return { docs: [] }
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { events.push(data); return data }),
    }
    expect(await reconcilePosts(payload as never)).toEqual({ scanned: 1, queued: 1, errors: 0 })
    expect(events[0].kind).toBe('review_requested')
    expect(await reconcilePosts(payload as never)).toEqual({ scanned: 1, queued: 0, errors: 0 })
  })

  it('cannot publish a reviewed draft without approval of its current unchanged revision', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const beforeChange = BlogPosts.hooks?.beforeChange?.[2]
    expect(beforeChange).toBeDefined()
    const payload = { find: vi.fn(async () => ({ docs: [{ revision, kind: 'review_requested', state: 'delivered' }] })) }
    const attempt = (data: Record<string, unknown>, originalDoc: BlogPost = review) =>
      beforeChange?.({ data, originalDoc, req: { payload } } as never)
    await expect(attempt({ status: 'published' })).rejects.toThrow('needs approval')
    payload.find.mockResolvedValueOnce({ docs: [] })
    await expect(attempt({ status: 'published' })).rejects.toThrow('needs approval')
    payload.find.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] })
    await expect(attempt({ status: 'published' }, { ...review, status: 'draft' })).rejects.toThrow('needs approval')
    payload.find.mockResolvedValueOnce({ docs: [{ revision: nextRevision(revision), kind: 'review_withdrawn', state: 'pending' }] })
    await expect(attempt({ status: 'published' }, { ...review, status: 'draft', websiteSyncRevision: nextRevision(revision) })).rejects.toThrow('needs approval')
    payload.find.mockResolvedValue({ docs: [{ revision, kind: 'review_requested', state: 'approved' }] })
    await expect(attempt({ status: 'published', title: 'Different' })).rejects.toThrow('needs approval')
    await expect(attempt({ status: 'published' })).resolves.toMatchObject({ status: 'published' })
    payload.find.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [{ revision, kind: 'unpublished' }] })
    await expect(attempt({ status: 'published' }, { ...review, status: 'draft' })).resolves.toMatchObject({ status: 'published' })
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ where: { and: expect.arrayContaining([{ revision: { equals: revision } }]) } }))
    await expect(attempt({ status: 'published' }, { ...review, websiteSyncRevision: nextRevision(revision) })).rejects.toThrow('needs approval')
    delete process.env.IN_THE_PICTURE_REVIEW_SYNC_ENABLED
    await expect(attempt({ status: 'review' }, { ...review, status: 'published' })).rejects.toThrow('review receiver')
  })

  it('keeps Payload publication status aligned when Markdown frontmatter selects published', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const hooks = BlogPosts.hooks?.beforeChange ?? []
    const data: Record<string, unknown> = {
      ...review, status: 'draft', markdownSource: '---\nstatus: published\n---\n\n## Heading\n\nNew body.',
    }
    let current = data
    for (const hook of hooks) current = (await hook({ data: current, originalDoc: { ...review, status: 'draft', websiteSyncRevision: null }, req: { payload: { find: vi.fn(async () => ({ docs: [] })) } } } as never)) as Record<string, unknown>
    expect(current.status).toBe('published')
    expect(current._status).toBe('published')
  })

  it('waits for a successful public unpublish before sending a private review', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://website.example.com'
    process.env.CONTENT_CMS_SYNC_TOKEN = token
    process.env.IN_THE_PICTURE_REVIEW_SYNC_ENABLED = '1'
    const events = [
      { id: 1, eventKey: `31:${revision}:unpublished`, postId: '31', revision, kind: 'unpublished', state: 'pending', attempts: 0, body: { event: 'unpublished' } },
      { id: 2, eventKey: `31:${revision}`, postId: '31', revision, kind: 'review_requested', state: 'pending', attempts: 0, body: { event: 'review_requested' } },
    ]
    const payload = {
      db: { client: { execute: vi.fn(async ({ sql, args }: { sql: string; args: Array<string | number | null> }) => {
        if (sql.includes('SET state =')) {
          const event = events.find(item => item.id === args[6])
          if (event) { event.state = String(args[0]); event.attempts = Number(args[1]) }
        }
        return { rowsAffected: 1 }
      }) } },
      find: vi.fn(async ({ where }: { where: { eventKey?: { equals: string }; and?: Array<Record<string, unknown>> } }) => {
        if (where.eventKey) return { docs: events.filter(event => event.eventKey === where.eventKey?.equals) }
        if (where.and?.some(part => 'postId' in part)) return { docs: [] }
        return { docs: events.filter(event => ['pending', 'retry'].includes(event.state)) }
      }),
    }
    const sent: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push((JSON.parse(String(init.body)) as { event: string }).event)
      return new Response('{}', { status: sent.length === 1 ? 503 : 200 })
    }))
    expect((await deliverPending(payload as never)).retried).toBe(1)
    expect(sent).toEqual(['unpublished'])
    expect(events[1].state).toBe('pending')
    expect((await deliverPending(payload as never)).delivered).toBe(2)
    expect(sent).toEqual(['unpublished', 'unpublished', 'review_requested'])
  })

  it('holds review deliveries until opted in, then accepts only current decisions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'itp-review-'))
    const db = createClient({ url: `file:${join(dir, 'review.db')}` })
    try {
      await db.execute('CREATE TABLE clients (id integer PRIMARY KEY)')
      await db.execute('INSERT INTO clients(id) VALUES (1),(2)')
      await db.execute('CREATE TABLE blog_posts (id integer PRIMARY KEY, client_id integer, status text, website_sync_revision text)')
      await db.execute({ sql: 'INSERT INTO blog_posts VALUES (?,?,?,?)', args: [31, 1, 'review', revision] })
      await db.execute(inThePictureSchema.find(([name]) => name === 'blog_sync_events')?.[1] ?? '')
      const insert = async (clientId: number, id: number) => db.execute({
        sql: "INSERT INTO blog_sync_events(event_key,client_id,post_id,revision,kind,body,state,attempts) VALUES(?,?,?,?,?,?,'pending',0)",
        args: [`${id}:${revision}`, clientId, String(id), revision, 'review_requested', JSON.stringify({ version: 1, event: 'review_requested' })],
      })
      await insert(1, 31)
      await insert(2, 32)
      process.env.IN_THE_PICTURE_CLIENT_ID = '1'
      process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://website.example.com'
      process.env.CONTENT_CMS_SYNC_TOKEN = token
      const payload = {
        db: { client: db },
        find: vi.fn(async ({ where }: { where: { and?: Array<Record<string, unknown>>; eventKey?: { equals: string } } }) => {
          if (where.eventKey) return { docs: [] }
          if (where.and?.some(part => 'postId' in part)) return { docs: [] }
          const allowed = (where.and?.find(part => 'kind' in part) as { kind: { in: string[] } }).kind.in
          const rows = (await db.execute("SELECT * FROM blog_sync_events WHERE client_id = 1 AND state IN ('pending','retry')")).rows
          return { docs: rows.filter(row => allowed.includes(String(row.kind))).map(row => ({
            id: Number(row.id), postId: String(row.post_id), revision: String(row.revision),
            kind: String(row.kind), clientId: Number(row.client_id), body: JSON.parse(String(row.body)), attempts: Number(row.attempts),
          })) }
        }),
      }
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
      expect((await deliverPending(payload as never)).delivered).toBe(0)
      expect(fetch).not.toHaveBeenCalled()
      process.env.IN_THE_PICTURE_REVIEW_SYNC_ENABLED = '1'
      expect((await deliverPending(payload as never)).delivered).toBe(1)
      expect(fetch).toHaveBeenCalledTimes(1)
      const message = { version: 1, postId: '31', revision, decision: 'approved' as const }
      expect(reviewDecisionSchema.safeParse(message).success).toBe(true)
      expect(await applyReviewDecision(payload as never, message)).toBe('applied')
      expect(await applyReviewDecision(payload as never, message)).toBe('applied')
      expect(await applyReviewDecision(payload as never, { ...message, decision: 'changes_requested' })).toBe('conflict')
      expect(await applyReviewDecision(payload as never, { ...message, postId: '32' })).toBe('conflict')
      expect((await db.execute('SELECT state FROM blog_sync_events WHERE client_id = 2')).rows[0].state).toBe('pending')
      await db.execute("UPDATE blog_posts SET website_sync_revision = '2026-09-27T00:00:00.000Z' WHERE id = 31")
      expect(await applyReviewDecision(payload as never, message)).toBe('conflict')
    } finally { db.close(); await rm(dir, { recursive: true, force: true }) }
  })
})
