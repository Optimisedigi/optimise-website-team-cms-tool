import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds `last_pushed_source` column to `google_ads_campaign_budgets`.
 *
 * Purpose: track what triggered the most recent push to Google Ads
 * ('manual' / 'cron-monthly-reset' / 'cron-mid-month' / 'agent'). The
 * Optimate-Google-Ads agent reads this to skip work the cron has already
 * handled within a recent window, and to maintain a clean audit trail of
 * who/what changed budgets when.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`google_ads_campaign_budgets\` ADD \`last_pushed_source\` text;`,
    )
  } catch {
    /* column already exists */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // No-op. SQLite doesn't easily support dropping columns.
}
