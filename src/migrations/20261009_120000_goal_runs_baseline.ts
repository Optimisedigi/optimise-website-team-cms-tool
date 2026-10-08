import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the frozen performance `baseline` JSON column to `goal_runs`.
 *
 * Captured once per run (three 7-day windows before the run started, with
 * per-campaign spend allocation) so progress is measured against a fixed
 * anchor. Additive and nullable: runs without a baseline get one lazily the
 * first time the Goal Baseline page is opened. Keep in sync with
 * addGoalRunsBaseline() in src/lib/run-migrations.ts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columns = await db.all<{ name: string }>(sql.raw("PRAGMA table_info(`goal_runs`)"));
  if (!columns.some((column) => column.name === "baseline")) {
    await db.run(sql.raw("ALTER TABLE `goal_runs` ADD `baseline` text;"));
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Additive nullable column; left in place so a rollback loses no baselines.
}
