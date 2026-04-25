import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`meeting_schedulers\` ADD \`date_overrides\` text;`)
  } catch {
    /* column exists */
  }
}

export async function down({ _db }: MigrateDownArgs & { _db?: any }): Promise<void> {
  // No-op
}
