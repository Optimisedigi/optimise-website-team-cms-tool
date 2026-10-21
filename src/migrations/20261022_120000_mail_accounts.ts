import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { FOLLOW_UPS_ACCOUNT_SCHEMA, MAIL_ACCOUNTS_SCHEMA, SCHEDULED_EMAILS_ACCOUNT_SCHEMA } from '../lib/mail/schema'

// Mail view: extra Gmail accounts per user, plus the account column on
// scheduled emails and follow-up reminders. Additive only.
// Also part of MAIL_SCHEMA, which runMigrations() applies for fresh databases.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of [...MAIL_ACCOUNTS_SCHEMA, ...SCHEDULED_EMAILS_ACCOUNT_SCHEMA, ...FOLLOW_UPS_ACCOUNT_SCHEMA]) {
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
  // Additive; left in place on rollback so connected accounts are kept.
}
