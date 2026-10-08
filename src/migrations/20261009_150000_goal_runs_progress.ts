import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the daily `progress` JSON series column to `goal_runs`.
 *
 * Appended once a day by the Google Ads snapshots cron (see
 * src/lib/goal-agents/progress.ts) so the Goal Baseline page can chart CPA
 * since the run started. Additive and nullable. Keep in sync with
 * addGoalRunsProgress() in src/lib/run-migrations.ts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columns = await db.all<{ name: string }>(sql.raw("PRAGMA table_info(`goal_runs`)"));
  if (!columns.some((column) => column.name === "progress")) {
    await db.run(sql.raw("ALTER TABLE `goal_runs` ADD `progress` text;"));
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Additive nullable column; left in place so a rollback loses no history.
}
