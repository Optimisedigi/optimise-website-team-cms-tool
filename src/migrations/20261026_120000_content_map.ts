import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { CONTENT_MAP_SCHEMA } from '../lib/content-map/schema'

// Content Map: client opt-in + topic authorities, analysis snapshots, link
// suggestion origin/client, blog-prompt recommendation id. Additive only.
// Keep in sync with addContentMapSchema() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of CONTENT_MAP_SCHEMA) {
    try {
      await db.run(sql.raw(statement))
    } catch (error) {
      // Local databases may already have it via schema push.
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
      if (error instanceof Error && /duplicate column name|already exists/i.test(`${error.message} ${cause}`)) continue
      throw error
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so snapshots and decisions are not lost.
}
