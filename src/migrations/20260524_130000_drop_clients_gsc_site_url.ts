import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Drops the orphan top-level `gsc_site_url` column from the `clients` table.
 *
 * Background
 * ----------
 * `clients` had three GSC URL fields:
 *   - `gsc_property_url` — OAuth-derived, source of truth, READ by every
 *     real GSC consumer (gsc-monitor, gsc-indexing, agent config, etc.)
 *   - `gsc_site_url` — operator-set, originally intended for the AI Search
 *     Erosion Detector. No code actually reads it; only fallbacks did.
 *   - `seo_auto_gsc_site_url` — site-health-monitor-specific override,
 *     read by the monthly health cron. Kept.
 *
 * The orphan `gsc_site_url` is removed. Any data in it is backfilled into
 * `gsc_property_url` (the canonical column) first, so we don't lose anything
 * if an operator had typed a URL there before OAuth ran. Once OAuth runs,
 * `gsc_property_url` will be overwritten with the real Google-side value.
 *
 * SQLite 3.35+ supports `ALTER TABLE ... DROP COLUMN`. Turso runs a recent
 * libSQL with this support.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Backfill: copy gsc_site_url into gsc_property_url where the latter is
  // empty. This preserves any operator-typed URLs that were stored on the
  // orphan column before OAuth populated the canonical one.
  try {
    await db.run(sql`UPDATE \`clients\`
      SET \`gsc_property_url\` = \`gsc_site_url\`
      WHERE (\`gsc_property_url\` IS NULL OR \`gsc_property_url\` = '')
        AND \`gsc_site_url\` IS NOT NULL
        AND \`gsc_site_url\` != '';`)
  } catch {
    // If the column doesn't exist locally (never been migrated up), the
    // UPDATE fails — that's fine, nothing to backfill.
  }

  try {
    await db.run(sql`ALTER TABLE \`clients\` DROP COLUMN \`gsc_site_url\`;`)
  } catch {
    // Column may not exist (e.g. fresh dev DB where 20260511 never ran).
    // Idempotent: safe to ignore.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Backfill is one-way and the column is genuinely orphaned. No rollback.
}
