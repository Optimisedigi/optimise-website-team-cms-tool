import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { MAIL_SCHEMA } from '../lib/mail/schema'

// Mail view: client emails, confirmed email summaries, AI request log and the
// per-user Gmail sync cursor. Additive only; no existing client data changes.
// Keep in sync with addMailSchema() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of MAIL_SCHEMA) {
    try {
      await db.run(sql.raw(statement))
    } catch (error) {
      // Local databases may already have these via schema push.
      if (error instanceof Error && /duplicate column name|already exists/i.test(error.message)) continue
      throw error
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so stored client emails are not lost.
}
