import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { matchesBearer, websiteUrl, boundedJson } from '@/lib/in-the-picture/config'
import { lexicalBlocks, markdownBlocks, publishedEvent } from '@/lib/in-the-picture/article'
import { batchSchema, applyIdeas, deleteIdeas, pullIdeas } from '@/lib/in-the-picture/ideas'
import { inThePictureSchema } from '@/lib/in-the-picture/schema'
import {
  deliverPending,
  enqueuePost,
  nextRevision,
  reconcilePosts,
} from '@/lib/in-the-picture/outbox'
import type { BlogPost } from '@/payload-types'
import { BlogIdeas } from '@/collections/BlogIdeas'
import { BlogPosts } from '@/collections/BlogPosts'

const env = { ...process.env }
afterEach(() => {
  process.env = { ...env }
  vi.unstubAllGlobals()
})
const token = 'a'.repeat(40)

describe('In The Picture boundary', () => {
  it('denies missing, short, or wrong bearer credentials', () => {
    expect(matchesBearer(new Request('https://cms.test'), token)).toBe(false)
    expect(
      matchesBearer(
        new Request('https://cms.test', { headers: { Authorization: 'Bearer wrong' } }),
        token,
      ),
    ).toBe(false)
    expect(
      matchesBearer(
        new Request('https://cms.test', { headers: { Authorization: `Bearer ${token}` } }),
        token,
      ),
    ).toBe(true)
    expect(
      matchesBearer(
        new Request('https://cms.test', { headers: { Authorization: `Bearer ${token}` } }),
        'short',
      ),
    ).toBe(false)
  })
  it('rejects outbound host credentials and production HTTP', () => {
    process.env.NODE_ENV = 'production'
    process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'http://example.com'
    expect(websiteUrl('/api/content-sync/articles')).toBeNull()
    process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://example.com/evil'
    expect(websiteUrl('/api/content-sync/articles')).toBeNull()
    process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://example.com'
    expect(websiteUrl('/api/content-sync/articles')?.pathname).toBe('/api/content-sync/articles')
  })
  it('bounds batch bytes and rejects repeated IDs', async () => {
    await expect(
      boundedJson(new Request('https://cms.test', { method: 'POST', body: 'hello' }), 3),
    ).rejects.toThrow('Payload too large')
    expect(batchSchema.safeParse({ version: 1, ideas: [{ blogId: 'not-a-uuid' }] }).success).toBe(
      false,
    )
  })
  it('converts supported rich blocks; rejects silent loss and invalid images', () => {
    expect(
      lexicalBlocks({
        root: {
          children: [
            {
              type: 'heading',
              tag: 'h2',
              children: [{ type: 'text', text: 'Heading', format: 0 }],
            },
            { type: 'paragraph', children: [{ type: 'text', text: 'Link', format: 1 }] },
          ],
        },
      }),
    ).toEqual([
      { type: 'heading', level: 2, children: [{ text: 'Heading' }] },
      { type: 'paragraph', children: [{ text: 'Link', bold: true }] },
    ])
    expect(() => lexicalBlocks({ root: { children: [{ type: 'table', children: [] }] } })).toThrow(
      'Unsupported',
    )
    expect(() => markdownBlocks('## Head\n\n```code```')).toThrow('Unsupported')
    expect(() => markdownBlocks('![missing-close](')).toThrow('Unsupported')
    expect(() => markdownBlocks('- ')).toThrow('Unsupported')
    expect(
      markdownBlocks('## Head\n\nRead [the guide](https://example.com) and **learn**.')[1],
    ).toEqual({
      type: 'paragraph',
      children: [
        { text: 'Read ' },
        { text: 'the guide', link: 'https://example.com/' },
        { text: ' and ' },
        { text: 'learn', bold: true },
        { text: '.' },
      ],
    })
    expect(() => markdownBlocks('[unsafe](javascript:alert(1))')).toThrow('Invalid link')
    process.env.CONTENT_CMS_PUBLIC_ORIGIN = 'https://cms.example.com'
    expect(() => publishedEvent({ id: 1, client: 2, status: 'published' } as BlogPost)).toThrow(
      'not approved',
    )
    expect(() => markdownBlocks('![alt](https://evil.example.com/image.jpg)')).toThrow(
      'public CMS media',
    )
  })
  it('scopes editor reads and updates to the configured client at the data layer', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    expect(await BlogIdeas.access.update?.({ req: { user: { role: 'admin' } } } as never)).toEqual({
      client: { equals: 1 },
    })
    expect(await BlogIdeas.access.read?.({ req: { user: null } } as never)).toBe(false)
  })
  it('fails an invalid feed offset before persisting any ideas', async () => {
    process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://website.example.com'
    process.env.IN_THE_PICTURE_CLIENT_ID = '2'
    process.env.CONTENT_CMS_SYNC_TOKEN = token
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              version: 1,
              ideas: [],
              total: 1,
              nextOffset: 100,
              snapshotRevision: 1,
              orderRevision: 1,
            }),
          ),
      ),
    )
    const payload = { find: vi.fn() }
    await expect(pullIdeas(payload as never)).rejects.toThrow('Invalid idea feed offset')
    expect(payload.find).not.toHaveBeenCalled()
  })
  it('restarts changing feed snapshots without applying partial ranks', async () => {
    process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://website.example.com'
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    process.env.CONTENT_CMS_SYNC_TOKEN = token
    const idea = {
      blogId: '12345678-1234-4234-8234-123456789abc',
      priority: 1,
      blogIdea: 'Idea',
      suggestedTitle: '',
      mainPoint: '',
      keyPoints: '',
      pointsToAvoid: '',
      supportingContent: '',
      contributor: '',
      idealAuthor: '',
      status: 'open',
      publishedSlug: '',
      updatedAt: '2026-09-26T00:00:00.000Z',
      recordRevision: 1,
      orderRevision: 1,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: URL) =>
          new Response(
            JSON.stringify({
              version: 1,
              ideas: url.searchParams.get('offset') === '0' ? [idea] : [],
              total: 2,
              nextOffset: url.searchParams.get('offset') === '0' ? 1 : null,
              snapshotRevision: url.searchParams.get('offset') === '0' ? 1 : 2,
              orderRevision: 1,
            }),
          ),
      ),
    )
    const payload = { db: { client: { transaction: vi.fn() } } }
    await expect(pullIdeas(payload as never)).rejects.toThrow('changed during traversal')
    expect(payload.db.client.transaction).not.toHaveBeenCalled()
  })
  it('queues publication, edit and unpublish before delivery without publishing other clients', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const events: Array<Record<string, unknown>> = []
    const payload = {
      findByID: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'clients' ? { id: 1, authors: [{ name: 'Jane Editor' }] } : null,
      ),
      find: vi.fn(
        async ({
          collection,
          where,
        }: {
          collection: string
          where: { eventKey?: { equals: string } }
        }) => ({
          docs:
            collection === 'blog-sync-events'
              ? events.filter((event) => event.eventKey === where.eventKey?.equals)
              : [],
        }),
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data)
        return data
      }),
    }
    const base = {
      id: 31,
      client: 1,
      clientConfirmed: true,
      status: 'published',
      slug: 'brief',
      title: 'Brief',
      excerpt: 'Introduction',
      author: 'Jane Editor',
      publishedDate: '2026-09-25T00:00:00.000Z',
      readingTime: '5 min read',
      websiteCategory: 'tax-tips',
      websiteServiceSlug: 'accounting',
      markdownContent: '## Heading\n\nPlain text.',
    } as BlogPost
    const first = { ...base, websiteSyncRevision: '2026-09-26T00:00:00.000Z' }
    await enqueuePost(payload as never, first)
    await enqueuePost(payload as never, first)
    expect(events).toHaveLength(1)
    expect((events[0].body as { event: string }).event).toBe('published')
    const edit = {
      ...first,
      title: 'Revised brief',
      websiteSyncRevision: nextRevision(
        first.websiteSyncRevision,
        Date.parse(first.websiteSyncRevision ?? ''),
      ),
    }
    await enqueuePost(payload as never, edit, first)
    expect(events).toHaveLength(2)
    await enqueuePost(
      payload as never,
      {
        ...edit,
        status: 'draft',
        websiteSyncRevision: nextRevision(
          edit.websiteSyncRevision,
          Date.parse(edit.websiteSyncRevision ?? ''),
        ),
      },
      edit,
    )
    expect((events[2].body as { event: string }).event).toBe('unpublished')
    await enqueuePost(payload as never, { ...first, client: 2 })
    expect(events).toHaveLength(3)
    await enqueuePost(payload as never, { ...base, id: 32, websiteSyncRevision: null })
    expect((events[3].body as { revision: string }).revision).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(events[3].revision).toBe((events[3].body as { revision: string }).revision)
  })
  it('retains a newer unpublish tombstone after deleting a published post', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const queued: Array<Record<string, unknown>> = []
    const payload = {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        queued.push(data)
      }),
      find: vi.fn(async () => ({ docs: [] })),
    }
    const doc = {
      id: 42,
      client: 1,
      clientConfirmed: true,
      status: 'published',
      websiteSyncRevision: '2026-09-26T00:00:00.000Z',
    } as BlogPost
    await BlogPosts.hooks?.afterDelete?.[0]?.({ doc, req: { payload } } as never)
    expect(queued).toHaveLength(1)
    expect((queued[0].body as { event: string }).event).toBe('unpublished')
    expect(Date.parse(String(queued[0].revision))).toBeGreaterThan(
      Date.parse(doc.websiteSyncRevision ?? ''),
    )
  })
  it('does not re-enqueue an unchanged linked post during reconciliation', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const post = {
      id: 31,
      client: 1,
      clientConfirmed: true,
      status: 'published',
      slug: 'brief',
      title: 'Brief',
      excerpt: 'Introduction',
      author: 'Jane Editor',
      publishedDate: '2026-09-25T00:00:00.000Z',
      readingTime: '5 min read',
      websiteCategory: 'tax-tips',
      websiteServiceSlug: 'accounting',
      websiteBlogIdeaId: '12345678-1234-4234-8234-123456789abc',
      websiteSyncRevision: '2026-09-26T00:00:00.000Z',
      markdownContent: '## Heading\n\nPlain text.',
    } as BlogPost
    const event = {
      kind: 'published',
      revision: post.websiteSyncRevision,
      body: publishedEvent(post, post.websiteBlogIdeaId ?? undefined),
    }
    const payload = {
      findByID: vi.fn(async () => ({ authors: [{ name: 'Jane Editor' }] })),
      find: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'blog-posts'
          ? { docs: [post], hasNextPage: false }
          : {
              docs:
                collection === 'blog-ideas'
                  ? [{ client: 1, blogId: post.websiteBlogIdeaId }]
                  : [event],
            },
      ),
      create: vi.fn(),
    }
    expect(await reconcilePosts(payload as never)).toEqual({ scanned: 1, queued: 0, errors: 0 })
    expect(payload.create).not.toHaveBeenCalled()
  })
  it('queues changed content once across repeated reconciliation ticks', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    let post = {
      id: 31,
      client: 1,
      clientConfirmed: true,
      status: 'published',
      slug: 'brief',
      title: 'Brief',
      excerpt: 'Introduction',
      author: 'Jane Editor',
      publishedDate: '2026-09-25T00:00:00.000Z',
      readingTime: '5 min read',
      websiteCategory: 'tax-tips',
      websiteServiceSlug: 'accounting',
      websiteSyncRevision: '2026-09-26T00:00:00.000Z',
      markdownContent: '## Heading\n\nPlain text.',
    } as BlogPost
    const events: Array<Record<string, unknown>> = []
    const payload = {
      findByID: vi.fn(async () => ({ authors: [{ name: 'Jane Editor' }] })),
      find: vi.fn(
        async ({
          collection,
          where,
        }: {
          collection: string
          where: { eventKey?: { equals: string } }
        }) => {
          if (collection === 'blog-posts') return { docs: [post], hasNextPage: false }
          return {
            docs: where.eventKey
              ? events.filter((event) => event.eventKey === where.eventKey?.equals)
              : events.slice(-1),
          }
        },
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data)
        return data
      }),
    }
    expect(await reconcilePosts(payload as never)).toEqual({ scanned: 1, queued: 1, errors: 0 })
    expect(events[0].revision).not.toBe(post.websiteSyncRevision)
    expect(await reconcilePosts(payload as never)).toEqual({ scanned: 1, queued: 0, errors: 0 })
    post = { ...post, title: 'Updated brief' }
    expect(await reconcilePosts(payload as never)).toEqual({ scanned: 1, queued: 1, errors: 0 })
    expect(await reconcilePosts(payload as never)).toEqual({ scanned: 1, queued: 0, errors: 0 })
    expect(events).toHaveLength(2)
  })
  it('rejects an invalid linked idea even when the latest reconciliation snapshot is unchanged', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    const post = {
      id: 31,
      client: 1,
      clientConfirmed: true,
      status: 'published',
      slug: 'brief',
      title: 'Brief',
      excerpt: 'Introduction',
      author: 'Jane Editor',
      publishedDate: '2026-09-25T00:00:00.000Z',
      readingTime: '5 min read',
      websiteCategory: 'tax-tips',
      websiteServiceSlug: 'accounting',
      websiteBlogIdeaId: '12345678-1234-4234-8234-123456789abc',
      websiteSyncRevision: '2026-09-26T00:00:00.000Z',
      markdownContent: '## Heading\n\nPlain text.',
    } as BlogPost
    const event = {
      kind: 'published',
      revision: post.websiteSyncRevision,
      body: publishedEvent(post, post.websiteBlogIdeaId ?? undefined),
    }
    const payload = {
      findByID: vi.fn(async () => ({ authors: [{ name: 'Jane Editor' }] })),
      find: vi.fn(async ({ collection }: { collection: string }) =>
        collection === 'blog-posts'
          ? { docs: [post], hasNextPage: false }
          : { docs: collection === 'blog-ideas' ? [] : [event] },
      ),
      create: vi.fn(),
    }
    expect(await reconcilePosts(payload as never)).toEqual({ scanned: 1, queued: 0, errors: 1 })
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'blog-ideas',
        where: { and: [{ blogId: { equals: post.websiteBlogIdeaId } }, { client: { equals: 1 } }] },
      }),
    )
    expect(payload.create).not.toHaveBeenCalled()
  })
  it('retains outages for retry and holds 409 conflicts for human review', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'itp-outbox-'))
    const db = createClient({ url: `file:${join(dir, 'queue.db')}` })
    try {
      await db.execute('CREATE TABLE clients (id integer PRIMARY KEY)')
      await db.execute('INSERT INTO clients(id) VALUES (1)')
      await db.execute(inThePictureSchema.find(([name]) => name === 'blog_sync_events')?.[1] ?? '')
      await db.execute({
        sql: "INSERT INTO blog_sync_events(event_key,client_id,post_id,revision,kind,body,state,attempts) VALUES(?,1,?,?,?,?,'pending',0)",
        args: [
          '31:2026-09-26T00:00:00.000Z',
          '31',
          '2026-09-26T00:00:00.000Z',
          'unpublished',
          JSON.stringify({ event: 'unpublished' }),
        ],
      })
      await db.execute('INSERT INTO clients(id) VALUES (2)')
      await db.execute({
        sql: "INSERT INTO blog_sync_events(event_key,client_id,post_id,revision,kind,body,state,attempts) VALUES(?,2,?,?,?,?,'pending',0)",
        args: [
          '32:2026-09-26T00:00:00.000Z',
          '32',
          '2026-09-26T00:00:00.000Z',
          'unpublished',
          JSON.stringify({ event: 'unpublished' }),
        ],
      })
      process.env.IN_THE_PICTURE_CLIENT_ID = '1'
      process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://website.example.com'
      process.env.CONTENT_CMS_SYNC_TOKEN = token
      const payload = {
        db: { client: db },
        find: vi.fn(async ({ where }: { where: { and: Array<Record<string, unknown>> } }) => {
          if (where.and.some((part) => 'postId' in part)) return { docs: [] }
          const rows = (
            await db.execute(
              "SELECT * FROM blog_sync_events WHERE state IN ('pending','retry') AND (next_attempt IS NULL OR next_attempt <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
          ).rows
          return {
            docs: rows.map((row) => ({
              id: Number(row.id),
              postId: String(row.post_id),
              revision: String(row.revision),
              kind: row.kind,
              clientId: Number(row.client_id),
              body: JSON.parse(String(row.body)),
              attempts: Number(row.attempts),
            })),
          }
        }),
      }
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', { status: 503 })),
      )
      expect((await deliverPending(payload as never)).retried).toBe(1)
      expect(
        (await db.execute('SELECT state FROM blog_sync_events WHERE client_id = 1')).rows[0].state,
      ).toBe('retry')
      expect(
        (await db.execute('SELECT state FROM blog_sync_events WHERE client_id = 2')).rows[0].state,
      ).toBe('pending')
      expect(fetch).toHaveBeenCalledTimes(1)
      await db.execute('UPDATE blog_sync_events SET state = ?, next_attempt = NULL WHERE id = 1', [
        'pending',
      ])
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', { status: 409 })),
      )
      expect((await deliverPending(payload as never)).reviewed).toBe(1)
      expect(
        (await db.execute('SELECT state,acknowledged_at FROM blog_sync_events WHERE client_id = 1'))
          .rows[0],
      ).toMatchObject({ state: 'review', acknowledged_at: null })
      expect(fetch).toHaveBeenCalledTimes(1)
      await db.execute('UPDATE blog_sync_events SET state = ?, next_attempt = NULL WHERE id = 1', [
        'pending',
      ])
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(null, { status: 204 })),
      )
      expect((await deliverPending(payload as never)).retried).toBe(1)
      expect(
        (await db.execute('SELECT acknowledged_at FROM blog_sync_events WHERE client_id = 1'))
          .rows[0].acknowledged_at,
      ).toBeNull()
      await db.execute('UPDATE blog_sync_events SET state = ?, next_attempt = NULL WHERE id = 1', [
        'pending',
      ])
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', { status: 200 })),
      )
      expect((await deliverPending(payload as never)).delivered).toBe(1)
      expect(
        (await db.execute('SELECT acknowledged_at FROM blog_sync_events WHERE client_id = 1'))
          .rows[0].acknowledged_at,
      ).toBeTruthy()
    } finally {
      db.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('applies the additive schema to a test SQLite copy, without touching existing rows', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'itp-migration-'))
    const db = createClient({ url: `file:${join(dir, 'test.db')}` })
    try {
      for (const table of [
        'clients',
        'blog_posts',
        '_blog_posts_v',
        'payload_locked_documents_rels',
      ])
        await db.execute(`CREATE TABLE ${table} (id integer PRIMARY KEY)`)
      await db.execute('INSERT INTO clients(id) VALUES (1)')
      await db.execute('INSERT INTO blog_posts(id) VALUES (42)')
      for (const [, statement] of inThePictureSchema) await db.execute(statement)
      expect((await db.execute('SELECT id FROM blog_posts WHERE id = 42')).rows.length).toBe(1)
      expect(
        (await db.execute("SELECT name FROM sqlite_master WHERE name = 'blog_ideas'")).rows.length,
      ).toBe(1)
      await db.execute(
        "INSERT INTO blog_ideas(client_id,blog_id,priority,blog_idea,status,record_revision,order_revision) VALUES (1,'id',1,'Brief','open',1,1)",
      )
      await expect(
        db.execute(
          "INSERT INTO blog_ideas(client_id,blog_id,priority,blog_idea,status,record_revision,order_revision) VALUES (1,'id',2,'Brief','open',2,2)",
        ),
      ).rejects.toThrow()
      process.env.IN_THE_PICTURE_CLIENT_ID = '1'
      const makeIdea = (
        recordRevision: number,
        orderRevision: number,
        priority: number,
        blogIdea = 'Fresh brief',
      ) => ({
        blogId: '12345678-1234-4234-8234-123456789abc',
        recordRevision,
        orderRevision,
        priority,
        blogIdea,
        suggestedTitle: '',
        mainPoint: '',
        keyPoints: '',
        pointsToAvoid: '',
        supportingContent: '',
        contributor: '',
        idealAuthor: '',
        status: 'open' as const,
        publishedSlug: '',
        updatedAt: '2026-09-26T00:00:00.000Z',
      })
      const payload = { db: { client: db } } as never
      expect(await applyIdeas(payload, [makeIdea(2, 2, 1)])).toEqual({ applied: 1, ignored: 0 })
      expect(await applyIdeas(payload, [makeIdea(1, 3, 2, 'Old brief')])).toEqual({
        applied: 1,
        ignored: 0,
      })
      const updated = (
        await db.execute(
          'SELECT blog_idea,priority,record_revision,order_revision FROM blog_ideas WHERE blog_id = ?',
          ['12345678-1234-4234-8234-123456789abc'],
        )
      ).rows[0]
      expect(updated).toMatchObject({
        blog_idea: 'Fresh brief',
        priority: 2,
        record_revision: 2,
        order_revision: 3,
      })
      await expect(applyIdeas(payload, [makeIdea(2, 3, 2, 'Conflicting brief')])).rejects.toThrow(
        'Conflicting record revision',
      )
      await db.execute('INSERT INTO clients(id) VALUES (2)')
      await db.execute(
        "INSERT INTO blog_ideas(client_id,blog_id,priority,blog_idea,status,record_revision,order_revision) VALUES (2,'12345678-1234-4234-8234-123456789abd',1,'Other','open',1,1)",
      )
      await expect(
        applyIdeas(payload, [
          makeIdea(3, 4, 1),
          { ...makeIdea(1, 1, 1), blogId: '12345678-1234-4234-8234-123456789abd' },
        ]),
      ).rejects.toThrow('another client')
      expect(
        (
          await db.execute('SELECT record_revision FROM blog_ideas WHERE blog_id = ?', [
            '12345678-1234-4234-8234-123456789abc',
          ])
        ).rows[0].record_revision,
      ).toBe(2)
    } finally {
      db.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('mirrors website deletions and prunes ideas missing from a complete snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'itp-deletion-'))
    const db = createClient({ url: `file:${join(dir, 'test.db')}` })
    try {
      for (const table of ['clients', 'blog_posts', '_blog_posts_v', 'payload_locked_documents_rels'])
        await db.execute(`CREATE TABLE ${table} (id integer PRIMARY KEY)`)
      await db.execute('INSERT INTO clients(id) VALUES (1)')
      await db.execute('INSERT INTO clients(id) VALUES (2)')
      for (const [, statement] of inThePictureSchema) await db.execute(statement)
      process.env.IN_THE_PICTURE_CLIENT_ID = '1'
      process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://website.example.com'
      process.env.CONTENT_CMS_SYNC_TOKEN = token
      const payload = { db: { client: db } } as never
      const ideaA = '12345678-1234-4234-8234-123456789aaa'
      const ideaB = '12345678-1234-4234-8234-123456789bbb'
      const ideaC = '12345678-1234-4234-8234-123456789ccc'
      const otherClientIdea = '12345678-1234-4234-8234-123456789ddd'
      const record = (blogId: string, priority: number, orderRevision = 1) => ({
        blogId,
        priority,
        orderRevision,
        recordRevision: 1,
        blogIdea: 'Brief',
        suggestedTitle: '',
        mainPoint: '',
        keyPoints: '',
        pointsToAvoid: '',
        supportingContent: '',
        contributor: '',
        idealAuthor: '',
        status: 'open' as const,
        publishedSlug: '',
        updatedAt: '2026-09-26T00:00:00.000Z',
      })
      await applyIdeas(payload, [record(ideaA, 1), record(ideaB, 2)])
      await db.execute(
        "INSERT INTO blog_ideas(client_id,blog_id,priority,blog_idea,status,record_revision,order_revision) VALUES (2,?,1,'Other','open',1,1)",
        [otherClientIdea],
      )
      expect(await deleteIdeas(payload, ['12345678-1234-4234-8234-123456789fff'])).toEqual({
        deleted: 0,
      })
      await expect(deleteIdeas(payload, [otherClientIdea])).rejects.toThrow('another client')
      expect(
        (await db.execute('SELECT id FROM blog_ideas WHERE blog_id = ?', [otherClientIdea])).rows,
      ).toHaveLength(1)
      // A complete snapshot is authoritative: ideaB was deleted on the website.
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                version: 1,
                ideas: [record(ideaA, 1, 2), record(ideaC, 2, 2)],
                total: 2,
                nextOffset: null,
                snapshotRevision: 3,
                orderRevision: 2,
              }),
            ),
        ),
      )
      expect(await pullIdeas(payload)).toEqual({ applied: 2, count: 2, deleted: 1 })
      const remaining = (
        await db.execute('SELECT blog_id FROM blog_ideas WHERE client_id = 1 ORDER BY priority')
      ).rows.map((row) => String(row.blog_id))
      expect(remaining).toEqual([ideaA, ideaC])
      expect(
        (await db.execute('SELECT id FROM blog_ideas WHERE blog_id = ?', [otherClientIdea])).rows,
      ).toHaveLength(1)
    } finally {
      db.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('prunes large deletions in bounded batches so a repair pull cannot get stuck', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'itp-prune-'))
    const db = createClient({ url: `file:${join(dir, 'test.db')}` })
    try {
      for (const table of ['clients', 'blog_posts', '_blog_posts_v', 'payload_locked_documents_rels'])
        await db.execute(`CREATE TABLE ${table} (id integer PRIMARY KEY)`)
      await db.execute('INSERT INTO clients(id) VALUES (1)')
      for (const [, statement] of inThePictureSchema) await db.execute(statement)
      process.env.IN_THE_PICTURE_CLIENT_ID = '1'
      process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://website.example.com'
      process.env.CONTENT_CMS_SYNC_TOKEN = token
      const payload = { db: { client: db } } as never
      const ideaA = '12345678-1234-4234-8234-123456789aaa'
      const ideaB = '12345678-1234-4234-8234-123456789bbb'
      const record = (blogId: string, priority: number) => ({
        blogId,
        priority,
        orderRevision: 1,
        recordRevision: 1,
        blogIdea: 'Brief',
        suggestedTitle: '',
        mainPoint: '',
        keyPoints: '',
        pointsToAvoid: '',
        supportingContent: '',
        contributor: '',
        idealAuthor: '',
        status: 'open' as const,
        publishedSlug: '',
        updatedAt: '2026-09-26T00:00:00.000Z',
      })
      await applyIdeas(payload, [record(ideaA, 1), record(ideaB, 2)])
      // 150 ideas deleted on the website at once: more than one deletion batch.
      for (let i = 0; i < 150; i += 1) {
        await db.execute(
          "INSERT INTO blog_ideas(client_id,blog_id,priority,blog_idea,status,record_revision,order_revision) VALUES (1,?,?,'Stale','open',1,1)",
          [`12345678-1234-4234-8234-${String(i).padStart(12, '0')}`, i + 3],
        )
      }
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                version: 1,
                ideas: [record(ideaA, 1), record(ideaB, 2)],
                total: 2,
                nextOffset: null,
                snapshotRevision: 2,
                orderRevision: 1,
              }),
            ),
        ),
      )
      expect(await pullIdeas(payload)).toEqual({ applied: 0, count: 2, deleted: 150 })
      const remaining = (
        await db.execute('SELECT blog_id FROM blog_ideas WHERE client_id = 1')
      ).rows.map((row) => String(row.blog_id))
      expect(remaining.sort()).toEqual([ideaA, ideaB].sort())
    } finally {
      db.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('applies rank-only website updates that advance updatedAt without a record revision', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'itp-rank-drift-'))
    const db = createClient({ url: `file:${join(dir, 'test.db')}` })
    try {
      for (const table of ['clients', 'blog_posts', '_blog_posts_v', 'payload_locked_documents_rels'])
        await db.execute(`CREATE TABLE ${table} (id integer PRIMARY KEY)`)
      await db.execute('INSERT INTO clients(id) VALUES (1)')
      for (const [, statement] of inThePictureSchema) await db.execute(statement)
      process.env.IN_THE_PICTURE_CLIENT_ID = '1'
      process.env.IN_THE_PICTURE_WEBSITE_ORIGIN = 'https://website.example.com'
      process.env.CONTENT_CMS_SYNC_TOKEN = token
      const payload = { db: { client: db } } as never
      const ideaA = '12345678-1234-4234-8234-123456789aaa'
      const stale = '12345678-1234-4234-8234-123456789bbb'
      const record = (blogId: string, priority: number, orderRevision: number, updatedAt: string) => ({
        blogId,
        priority,
        orderRevision,
        recordRevision: 2,
        blogIdea: 'Brief',
        suggestedTitle: '',
        mainPoint: '',
        keyPoints: '',
        pointsToAvoid: '',
        supportingContent: '',
        contributor: '',
        idealAuthor: '',
        status: 'open' as const,
        publishedSlug: '',
        updatedAt,
      })
      await applyIdeas(payload, [
        record(ideaA, 1, 1, '2026-09-28T02:43:38.563Z'),
        record(stale, 2, 2, '2026-09-28T02:43:38.563Z'),
      ])
      // The website reordered (bumping updatedAt and order revision, not record revision) and deleted `stale`.
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                version: 1,
                ideas: [record(ideaA, 1, 6, '2026-09-29T02:19:23.427Z')],
                total: 1,
                nextOffset: null,
                snapshotRevision: 8,
                orderRevision: 6,
              }),
            ),
        ),
      )
      expect(await pullIdeas(payload)).toEqual({ applied: 1, count: 1, deleted: 1 })
      const rows = (
        await db.execute(
          'SELECT blog_id, record_revision, order_revision, source_updated_at FROM blog_ideas WHERE client_id = 1',
        )
      ).rows
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        blog_id: ideaA,
        record_revision: 2,
        order_revision: 6,
        source_updated_at: '2026-09-29T02:19:23.427Z',
      })
      // Genuine content drift at an equal record revision is still rejected.
      await expect(
        applyIdeas(payload, [record(ideaA, 1, 6, '2026-09-29T02:19:23.427Z')]),
      ).resolves.toEqual({ applied: 0, ignored: 1 })
      await expect(
        applyIdeas(payload, [
          { ...record(ideaA, 1, 6, '2026-09-29T02:19:23.427Z'), blogIdea: 'Tampered' },
        ]),
      ).rejects.toThrow('Conflicting record revision')
    } finally {
      db.close()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
