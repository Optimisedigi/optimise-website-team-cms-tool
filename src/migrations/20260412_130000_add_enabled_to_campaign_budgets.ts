import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` ADD \`enabled\` integer DEFAULT 1`)
  } catch { /* already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`google_ads_campaign_budgets\` DROP COLUMN \`enabled\``)
  } catch { /* doesn't exist */ }
}
