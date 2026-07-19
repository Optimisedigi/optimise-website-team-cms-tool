import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { down, up } from '@/migrations/20260807_120000_add_google_ads_private_evidence_storage'

async function columns(client: ReturnType<typeof createClient>, table: string) {
  const result = await client.execute(`PRAGMA table_info(${table})`)
  return result.rows.map((row) => ({ name: String(row.name), notnull: Number(row.notnull) }))
}

describe('Google Ads private evidence migration', () => {
  it('makes legacy rows nullable, preserves data, adds metadata, and reverses safely', async () => {
    const client = createClient({ url: 'file::memory:' })
    const db = drizzle(client)
    await db.run(sql.raw('CREATE TABLE google_ads_audit_snapshots (id integer PRIMARY KEY NOT NULL);'))
    await db.run(sql.raw('INSERT INTO google_ads_audit_snapshots (id) VALUES (9);'))
    await db.run(sql.raw(`CREATE TABLE google_ads_audit_snapshot_chunks (
      id integer PRIMARY KEY NOT NULL, identity text NOT NULL, snapshot_id integer NOT NULL, dataset_key text NOT NULL,
      chunk_index numeric NOT NULL, row_count numeric NOT NULL, checksum text NOT NULL, rows text NOT NULL,
      updated_at text NOT NULL, created_at text NOT NULL
    );`))
    await db.run(sql.raw(`INSERT INTO google_ads_audit_snapshot_chunks VALUES (1, '9:campaigns:0', 9, 'campaigns', 0, 1, '${'a'.repeat(64)}', '[{"id":1}]', 'now', 'now');`))

    await up({ db } as any)
    const migrated = await columns(client, 'google_ads_audit_snapshot_chunks')
    expect(migrated.find((column) => column.name === 'rows')?.notnull).toBe(0)
    expect(migrated.map((column) => column.name)).toEqual(expect.arrayContaining(['storage_mode', 'blob_pathname', 'compressed_bytes', 'uncompressed_bytes']))
    expect((await client.execute('SELECT storage_mode, rows FROM google_ads_audit_snapshot_chunks')).rows[0]).toMatchObject({ storage_mode: 'database_json', rows: '[{"id":1}]' })
    expect((await columns(client, 'google_ads_audit_snapshots')).map((column) => column.name)).toContain('analysis_blob_pathname')

    await client.execute("UPDATE google_ads_audit_snapshot_chunks SET rows = NULL, storage_mode = 'private_blob_gzip_v1'")
    await down({ db } as any)
    const reverted = await columns(client, 'google_ads_audit_snapshot_chunks')
    expect(reverted.find((column) => column.name === 'rows')?.notnull).toBe(1)
    expect(reverted.map((column) => column.name)).not.toContain('storage_mode')
    expect((await client.execute('SELECT rows FROM google_ads_audit_snapshot_chunks')).rows[0].rows).toBe('[]')
    await client.close()
  })
})
