import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Renames the `desc` column on `client_proposals_roadmap_cells` to `body`.
 * `desc` is a SQL reserved keyword that caused 400 errors on queries against
 * the client_proposals collection.
 *
 * SQLite does not support RENAME COLUMN in older versions but does since 3.25.
 * Turso (libSQL) is based on SQLite 3.45+ so this is safe.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`
      ALTER TABLE \`client_proposals_roadmap_cells\`
      RENAME COLUMN \`desc\` TO \`body\`
    `)
  } catch {
    // Column may already have been renamed — safe to ignore.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op.
}
