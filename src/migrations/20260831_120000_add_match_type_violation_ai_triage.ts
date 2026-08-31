import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Weekly AI triage columns on match_type_violation_candidates.
 *
 * The triage cron pre-decides phrase-match violations (relevant keyword /
 * competitor / irrelevant / unclear) so the review is a few clicks. `ai_decided_at`
 * is also the idempotency marker, so a NULL there means "never triaged, retry".
 * Production runs with push disabled, so the columns must be added here.
 */
const COLUMNS = [
  ["ai_decision", "text"],
  ["ai_reason", "text"],
  ["ai_summary", "text"],
  ["ai_source_title", "text"],
  ["ai_source_link", "text"],
  ["ai_confidence", "numeric"],
  ["ai_decided_at", "text"],
] as const;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [column, type] of COLUMNS) {
    // Tolerate an existing column: local dev pushes the schema automatically.
    await db
      .run(sql.raw(`ALTER TABLE \`match_type_violation_candidates\` ADD \`${column}\` ${type};`))
      .catch(() => undefined);
  }
  await db
    .run(
      sql.raw(
        "CREATE INDEX IF NOT EXISTS `match_type_violation_candidates_ai_decision_idx` ON `match_type_violation_candidates` (`client_id`, `ai_decision`);",
      ),
    )
    .catch(() => undefined);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db
    .run(sql.raw("DROP INDEX IF EXISTS `match_type_violation_candidates_ai_decision_idx`;"))
    .catch(() => undefined);
  for (const [column] of COLUMNS) {
    await db
      .run(sql.raw(`ALTER TABLE \`match_type_violation_candidates\` DROP COLUMN \`${column}\`;`))
      .catch(() => undefined);
  }
}
