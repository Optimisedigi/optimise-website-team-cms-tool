import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds `gsc_site_url` to the `clients` table.
 *
 * This is the operator-set Google Search Console property URL surfaced on the
 * Search Console tab. Read by the AI Search Erosion Detector to query GSC; a
 * fallback to the Business tab's `website_url` applies when this is empty.
 *
 * Distinct from `gsc_property_url` (read-only, populated by the OAuth flow)
 * and `seo_auto_gsc_site_url` (Monthly Site Health tab's GSC pointer).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`gsc_site_url\` text;`)
  } catch {
    // Column already exists — safe to ignore on re-runs.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite DROP COLUMN support varies — leave column in place on rollback.
}
