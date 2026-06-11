import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the Dismissed-tab tracking fields to `match_type_violation_candidates`:
 *   - `added_as_keyword_at`: when a dismissed term was actioned
 *   - `added_as_keyword_outcome`: 'added' | 'already_exists' | 'skipped'
 *
 * The Match Type Variants Dismissed tab lists rejected candidates and lets the
 * team add the search term as an EXACT keyword to its ad group (via Growth
 * Tools, which skips server-side duplicates). Actioned rows are stamped here
 * so they stop appearing in the tab.
 *
 * Idempotent: ADD COLUMN wrapped in try/catch so re-running is safe.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `match_type_violation_candidates` ADD `added_as_keyword_at` text;",
      ),
    );
  } catch {
    /* column already exists */
  }
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `match_type_violation_candidates` ADD `added_as_keyword_outcome` text;",
      ),
    );
  } catch {
    /* column already exists */
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite can't drop columns cleanly without a table rebuild; the unused
  // columns are harmless if the feature is rolled back.
}
