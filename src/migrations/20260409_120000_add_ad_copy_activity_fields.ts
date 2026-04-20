import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`google_ads_audits\` ADD COLUMN \`ad_copy_published_at\` text`)
  } catch { /* column may already exist (applied out-of-band on dev) */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_audits\` ADD COLUMN \`ad_copy_approved_at\` text`)
  } catch { /* column may already exist */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_audits\` ADD COLUMN \`ad_copy_original_copy\` text`)
  } catch { /* column may already exist */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`google_ads_audits\` DROP COLUMN \`ad_copy_published_at\``)
  } catch { /* doesn't exist */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_audits\` DROP COLUMN \`ad_copy_approved_at\``)
  } catch { /* doesn't exist */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_audits\` DROP COLUMN \`ad_copy_original_copy\``)
  } catch { /* doesn't exist */ }
}
