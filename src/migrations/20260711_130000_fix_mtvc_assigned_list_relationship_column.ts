import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Fix the `assignedListId` relationship column name on
 * `match_type_violation_candidates`.
 *
 * The original table-creation sweep (both the bundled `run-migrations` runner
 * used in production and the earlier `20260602` migration) named the column
 * `assigned_list_id`. Payload's SQLite adapter, however, derives the column
 * from the field name `assignedListId` plus the `_id` foreign-key suffix, i.e.
 * `assigned_list_id_id`. With the wrong name present, EVERY Payload ORM query
 * on this table (`find`, `findByID`, `update`) throws
 * `no such column: assigned_list_id_id`. That broke the Match Type Violations
 * review list and made Approve/Dismiss silently fail — the candidate's status
 * never changed, so it reappeared on the next refresh.
 *
 * This adds the correctly-named column, backfills it from the legacy one, and
 * indexes it. The legacy `assigned_list_id` column is left in place because
 * SQLite cannot drop it cleanly and Payload ignores unknown columns.
 *
 * Idempotent: the ADD COLUMN is wrapped in try/catch so re-running is safe.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `match_type_violation_candidates` ADD `assigned_list_id_id` integer REFERENCES `negative_keyword_lists`(`id`) ON UPDATE no action ON DELETE set null;",
      ),
    );
  } catch {
    /* column already exists */
  }

  await db.run(
    sql.raw(
      "UPDATE `match_type_violation_candidates` SET `assigned_list_id_id` = `assigned_list_id` WHERE `assigned_list_id_id` IS NULL AND `assigned_list_id` IS NOT NULL;",
    ),
  );

  await db.run(
    sql.raw(
      "CREATE INDEX IF NOT EXISTS `match_type_violation_candidates_assigned_list_idx` ON `match_type_violation_candidates` (`assigned_list_id_id`);",
    ),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Non-destructive up; nothing to reverse safely (dropping a column in SQLite
  // requires a table rebuild and the legacy column remains the source of truth).
  await db.run(
    sql.raw(
      "DROP INDEX IF EXISTS `match_type_violation_candidates_assigned_list_idx`;",
    ),
  );
}
