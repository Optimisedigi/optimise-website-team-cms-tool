import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` ADD \`standalone\` integer DEFAULT 0`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` ADD \`standalone_budget\` numeric`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` ADD \`standalone_start_date\` text`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` ADD \`standalone_end_date\` text`)
  } catch { /* already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` DROP COLUMN \`standalone\``)
  } catch { /* doesn't exist */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` DROP COLUMN \`standalone_budget\``)
  } catch { /* doesn't exist */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` DROP COLUMN \`standalone_start_date\``)
  } catch { /* doesn't exist */ }
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` DROP COLUMN \`standalone_end_date\``)
  } catch { /* doesn't exist */ }
}
