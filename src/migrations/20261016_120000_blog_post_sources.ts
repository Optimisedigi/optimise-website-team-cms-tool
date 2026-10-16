import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { BLOG_POST_SOURCES_SCHEMA } from '../lib/in-the-picture/sources-schema'

// Blog post Sources, shown below the author profile on the In The Picture site.
// Additive only. Keep in sync with addBlogPostSources() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of BLOG_POST_SOURCES_SCHEMA) {
    try {
      await db.run(sql.raw(statement))
    } catch (error) {
      // Local databases may already have this via schema push.
      if (error instanceof Error && /duplicate column name|already exists/i.test(error.message)) continue
      throw error
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so entered sources are not lost.
}
