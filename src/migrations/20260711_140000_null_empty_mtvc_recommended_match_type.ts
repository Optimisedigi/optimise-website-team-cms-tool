import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * NULL out empty-string `recommended_match_type` values on
 * `match_type_violation_candidates`.
 *
 * The cron's raw-SQL upsert wrote `''` when the detector returned no
 * recommended match type. `recommendedMatchType` is a Payload select field
 * ('exact' | 'phrase'), so `''` fails validation — and Payload validates the
 * WHOLE document on update, meaning every `payload.update()` on such a row
 * threw "This field has an invalid selection." That made Approve/Dismiss
 * silently fail: the status never changed and the row reappeared in the
 * Match Type Violations review list on the next refetch.
 *
 * Idempotent: re-running matches zero rows.
 * Rollback: none needed — '' and NULL are semantically identical here, and
 * restoring '' would only re-break validation.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(
      "UPDATE `match_type_violation_candidates` SET `recommended_match_type` = NULL WHERE `recommended_match_type` = '';",
    ),
  );
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Intentionally a no-op: '' was invalid data; there is nothing to restore.
}
