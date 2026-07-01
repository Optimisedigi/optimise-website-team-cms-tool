import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`google_ads_audits\` ADD \`annual_budget_placeholders\` text`)
  } catch { /* already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`google_ads_audits\` DROP COLUMN \`annual_budget_placeholders\``)
  } catch { /* doesn't exist */ }
}
