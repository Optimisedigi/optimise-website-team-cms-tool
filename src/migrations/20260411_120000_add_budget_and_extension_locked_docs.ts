import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Add FK columns to payload_locked_documents_rels for new collections
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD COLUMN \`google_ads_campaign_budgets_id\` integer`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD COLUMN \`google_ads_ad_extensions_id\` integer`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`google_ads_campaign_budgets_id\``)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`google_ads_ad_extensions_id\``)
}
