import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds `meta_ad_account_id` to the `clients` table — the agency-shared Meta
 * Ads account ID (format: act_XXXXXXXXX) used by the new per-client Tools
 * tab. Plain text, nullable; no data backfill needed.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`meta_ad_account_id\` text`)
  } catch { /* already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` DROP COLUMN \`meta_ad_account_id\``)
  } catch { /* doesn't exist */ }
}
