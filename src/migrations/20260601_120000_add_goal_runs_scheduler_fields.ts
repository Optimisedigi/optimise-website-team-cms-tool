import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds Phase 3 scheduler lifecycle columns to the `goal_runs` table:
 *
 * - `next_check_at` (text/nullable) — when the scheduler should next process
 *   this run. Null = no scheduled check.
 * - `cooling_off_until` (text/nullable) — earliest time the next mutation is
 *   allowed after the most recent action. Used by the scheduler to enforce
 *   cadence cooldowns.
 * - `iterations_count` (integer, NOT NULL DEFAULT 0) — how many full
 *   observe→act→measure cycles this run has completed.
 *
 * All three are surfaced on the `goal-runs` collection (see
 * `src/collections/GoalRuns.ts`). Each ALTER is wrapped in try/catch so the
 * migration is idempotent on dev DBs where columns may have been pushed by
 * `payload migrate:fresh` / dev autosync.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`goal_runs\` ADD \`next_check_at\` text;`,
    );
  } catch {
    // Column may already exist on a freshly-pushed dev DB.
  }

  try {
    await db.run(
      sql`ALTER TABLE \`goal_runs\` ADD \`cooling_off_until\` text;`,
    );
  } catch {
    // Column may already exist on a freshly-pushed dev DB.
  }

  try {
    await db.run(
      sql`ALTER TABLE \`goal_runs\` ADD \`iterations_count\` integer NOT NULL DEFAULT 0;`,
    );
  } catch {
    // Column may already exist on a freshly-pushed dev DB.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite DROP COLUMN is supported on 3.35+, but leaving these columns is
  // harmless and avoids breaking already-deployed environments. Intentional
  // no-op to match the convention used by other recent migrations in this
  // repo (e.g. 20260530_120000_add_discovery_briefing_require_pin).
}
