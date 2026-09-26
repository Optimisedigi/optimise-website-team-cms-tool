import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { runMigrations } from '@/lib/run-migrations'
import { inThePictureSchema } from '@/lib/in-the-picture/schema'

const migration = '20260926_120000_in_the_picture_sync'
const bases = [
  'clients',
  'blog_posts',
  '_blog_posts_v',
  'payload_locked_documents_rels',
  'payload_migrations',
  'landing_events',
  'landing_domains',
]
function existingDatabase(marker: string, failLabel?: string) {
  const execute = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT 1 FROM `payload_migrations`'))
      return { rows: sql.includes(marker) ? [{ exists: 1 }] : [] }
    if (sql.startsWith('SELECT 1 FROM `sqlite_master`'))
      return { rows: bases.some((table) => sql.includes(`'${table}'`)) ? [{ exists: 1 }] : [] }
    if (sql === 'PRAGMA table_info(`landing_events`)') return { rows: [{ name: 'market' }] }
    if (failLabel && sql === inThePictureSchema.find(([label]) => label === failLabel)?.[1])
      throw new Error('Simulated database write failure')
    return { rows: [] }
  })
  return { execute, payload: { db: { client: { execute } } } as unknown as Payload }
}

describe('In The Picture migration production fast paths', () => {
  it.each(['20260814_133000_add_landing_lock_relations', '20260814_120000_add_hosting_billing'])(
    'adds the shared blog schema before returning for %s',
    async (marker) => {
      const { execute, payload } = existingDatabase(marker)
      const results = await runMigrations(payload)
      for (const [label, statement] of inThePictureSchema) {
        expect(execute).toHaveBeenCalledWith(statement)
        expect(results).toContainEqual({ label: `in_the_picture.${label}`, status: 'ok' })
      }
      expect(results).toContainEqual({ label: `mark_migration:${migration}`, status: 'ok' })
      expect(results.every((result) => result.status !== 'error')).toBe(true)
    },
  )

  it('does not mark the migration complete when a required statement fails', async () => {
    const { execute, payload } = existingDatabase(
      '20260814_133000_add_landing_lock_relations',
      'blog_posts.website_blog_idea_id',
    )
    const results = await runMigrations(payload)
    expect(results).toContainEqual(
      expect.objectContaining({
        label: 'in_the_picture.blog_posts.website_blog_idea_id',
        status: 'error',
      }),
    )
    expect(
      execute.mock.calls.some(([sql]) => sql.startsWith('INSERT') && sql.includes(migration)),
    ).toBe(false)
  })
})
