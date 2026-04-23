import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`meeting_schedulers\` ADD \`day_schedule\` text;`)
  } catch {
    /* column exists */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite cannot drop columns cleanly; no-op.
}
