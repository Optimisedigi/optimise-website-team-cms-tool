import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const stmt of [
    'ALTER TABLE `meeting_schedulers_attendees` ADD `delivery_status` text;',
    'ALTER TABLE `meeting_schedulers_attendees` ADD `delivery_detail` text;',
    'ALTER TABLE `meeting_schedulers_attendees` ADD `delivery_updated_at` text;',
  ]) {
    try {
      await db.run(sql.raw(stmt))
    } catch {
      // Column already exists.
    }
  }
}

export async function down({ _db }: MigrateDownArgs & { _db?: any }): Promise<void> {
  // No-op: safe additive columns.
}
