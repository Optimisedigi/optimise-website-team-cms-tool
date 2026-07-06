import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the match-type-violation spend fields to
 * `match_type_violation_candidates`:
 *   - `cost`: spend (account currency) attributed to the violating search term
 *     over the scan window.
 *   - `ad_group_cost`: total spend for the candidate's ad group over the same
 *     window (all traffic, not just violations). Used as the denominator for
 *     the review UI's "Paid keywords in violation" percentage — what share of
 *     an ad group's spend is wasted on match-type violations.
 *
 * `cost` is present in the current CREATE TABLE, but databases created before
 * that line was added lack the column, so it is added idempotently here too.
 *
 * Idempotent: ADD COLUMN wrapped in try/catch so re-running is safe.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `match_type_violation_candidates` ADD `cost` numeric DEFAULT 0;",
      ),
    );
  } catch {
    /* column already exists */
  }
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `match_type_violation_candidates` ADD `ad_group_cost` numeric DEFAULT 0;",
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
