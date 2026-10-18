import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { SCHEDULED_EMAILS_SCHEMA } from '../lib/mail/schema'

// Mail view: emails queued to send later. Additive only (one new table).
// Also part of MAIL_SCHEMA, which runMigrations() applies for fresh databases.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of SCHEDULED_EMAILS_SCHEMA) {
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
  // Additive; left in place on rollback so queued emails are not lost.
}
