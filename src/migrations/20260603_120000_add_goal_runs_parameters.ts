import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the `parameters` JSON column to `goal_runs`.
 *
 * The Account Efficiency goal type (and future configurable goal types) need
 * to persist per-run knobs at create time so the handler can read them on
 * every tick. Payload generates JSON columns as `text` in SQLite; the typed
 * surface in `payload-types.ts` is `unknown`-shaped JSON.
 *
 * Wrapped in try/catch for idempotency on dev DBs where the column may have
 * been pushed by `payload migrate:fresh` / dev autosync.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`goal_runs\` ADD \`parameters\` text;`);
  } catch {
    // Column may already exist on a freshly-pushed dev DB.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite DROP COLUMN is supported on 3.35+, but leaving the column is
  // harmless and avoids breaking already-deployed environments. Intentional
  // no-op to match the convention used by recent migrations in this repo.
}
