import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Add negativeListBuilder JSON column to google_ads_audits
  await db.run(sql`ALTER TABLE \`google_ads_audits\` ADD COLUMN \`negative_list_builder\` text`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite doesn't support DROP COLUMN before 3.35.0, but Turso does
  await db.run(sql`ALTER TABLE \`google_ads_audits\` DROP COLUMN \`negative_list_builder\``)
}
