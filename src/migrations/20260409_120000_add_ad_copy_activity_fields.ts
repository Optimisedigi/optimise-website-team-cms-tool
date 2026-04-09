import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`google_ads_audits\` ADD COLUMN \`ad_copy_published_at\` text`)
  await db.run(sql`ALTER TABLE \`google_ads_audits\` ADD COLUMN \`ad_copy_approved_at\` text`)
  await db.run(sql`ALTER TABLE \`google_ads_audits\` ADD COLUMN \`ad_copy_original_copy\` text`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`google_ads_audits\` DROP COLUMN \`ad_copy_published_at\``)
  await db.run(sql`ALTER TABLE \`google_ads_audits\` DROP COLUMN \`ad_copy_approved_at\``)
  await db.run(sql`ALTER TABLE \`google_ads_audits\` DROP COLUMN \`ad_copy_original_copy\``)
}
