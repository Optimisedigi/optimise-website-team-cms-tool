import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds a task type discriminator to scheduled-agent-tasks so the scheduler can
 * run both normal OptiMate Gmail-draft jobs and system jobs such as monthly
 * Google Ads budget approval creation.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw("ALTER TABLE `scheduled_agent_tasks` ADD `task_type` text DEFAULT 'agent-gmail-draft' NOT NULL;"),
    );
  } catch {
    // Column may already exist on environments that were schema-pushed.
  }

  await db.run(
    sql.raw("UPDATE `scheduled_agent_tasks` SET `task_type` = 'agent-gmail-draft' WHERE `task_type` IS NULL OR `task_type` = '';"),
  );
  await db.run(
    sql.raw("CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_task_type_idx` ON `scheduled_agent_tasks` (`task_type`);"),
  );
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite column drops require a rebuild; harmless to leave the discriminator.
}
