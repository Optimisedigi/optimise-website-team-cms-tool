import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { FOLLOW_UPS_SCHEMA, MAIL_AI_CLIENT_SCHEMA } from '../lib/mail/schema'

// Mail view: client id on the AI request log (opt-in client data for Write
// with AI) and the follow-up reminder table. Additive only.
// Also part of MAIL_SCHEMA, which runMigrations() applies for fresh databases.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of [...MAIL_AI_CLIENT_SCHEMA, ...FOLLOW_UPS_SCHEMA]) {
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
  // Additive; left in place on rollback so reminders and the audit log are kept.
}
