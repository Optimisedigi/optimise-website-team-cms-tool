import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Add FK columns to payload_locked_documents_rels for new collections
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_campaign_budgets_id\` integer;`)
  } catch { /* exists */ }
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_ad_extensions_id\` integer;`)
  } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`google_ads_campaign_budgets_id\`;`)
  } catch { /* doesn't exist */ }
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`google_ads_ad_extensions_id\`;`)
  } catch { /* doesn't exist */ }
}
