import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@libsql/client'
import { inThePictureSchema } from '@/lib/in-the-picture/schema'

/** A real Payload adapter smoke test on a fresh, disposable local SQLite file. */
describe('In The Picture Payload registration', () => {
  it('creates and reads the new collections on a test DB', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'itp-payload-'))
    const oldUrl = process.env.DATABASE_URL
    const oldPush = process.env.DISABLE_DB_PUSH
    process.env.DATABASE_URL = `file:${join(dir, 'cms.db')}`
    delete process.env.DISABLE_DB_PUSH
    try {
      const { default: config } = await import('@/payload.config')
      const { getPayload } = await import('payload')
      const payload = await getPayload({ config })
      expect((await payload.count({ collection: 'blog-ideas', overrideAccess: true })).totalDocs).toBe(0)
      expect((await payload.count({ collection: 'blog-sync-events', overrideAccess: true })).totalDocs).toBe(0)
      const actual = (payload.db as unknown as { client: ReturnType<typeof createClient> }).client
      const versionColumns = (await actual.execute('PRAGMA table_info(_blog_posts_v)')).rows.map(row => row.name)
      expect(versionColumns).toEqual(expect.arrayContaining(['version_website_blog_idea_id', 'version_website_category', 'version_website_service_slug', 'version_website_sync_revision']))
      const manual = createClient({ url: `file:${join(dir, 'manual.db')}` })
      try {
        for (const table of ['blog_ideas', 'blog_sync_events']) {
          const statement = inThePictureSchema.find(([label]) => label === table)?.[1]
          expect(statement).toBeDefined()
          await manual.execute(statement ?? '')
          const columns = async (db: ReturnType<typeof createClient>) => (await db.execute(`PRAGMA table_info(${table})`)).rows.map(row => `${row.name}:${row.type}`).sort()
          expect(await columns(actual)).toEqual(await columns(manual))
        }
      } finally { manual.close() }
      await payload.destroy()
    } finally {
      if (oldUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = oldUrl
      if (oldPush === undefined) delete process.env.DISABLE_DB_PUSH
      else process.env.DISABLE_DB_PUSH = oldPush
      await rm(dir, { recursive: true, force: true })
    }
  }, 90000)
})
