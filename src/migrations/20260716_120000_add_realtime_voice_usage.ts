import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw("CREATE TABLE IF NOT EXISTS `realtime_voice_usage` (`id` integer PRIMARY KEY NOT NULL, `session_id` text NOT NULL, `agent` text NOT NULL, `model` text NOT NULL, `rate_usd_per_hour` numeric NOT NULL, `duration_seconds` numeric NOT NULL, `estimated_cost_usd` numeric NOT NULL, `started_at` text NOT NULL, `ended_at` text NOT NULL, `user_id` integer, `metadata` text, `updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, `created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL, FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null);"));
  await db.run(sql.raw("CREATE UNIQUE INDEX IF NOT EXISTS `realtime_voice_usage_session_id_idx` ON `realtime_voice_usage` (`session_id`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `realtime_voice_usage_agent_idx` ON `realtime_voice_usage` (`agent`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `realtime_voice_usage_model_idx` ON `realtime_voice_usage` (`model`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `realtime_voice_usage_started_at_idx` ON `realtime_voice_usage` (`started_at`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `realtime_voice_usage_ended_at_idx` ON `realtime_voice_usage` (`ended_at`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `realtime_voice_usage_user_idx` ON `realtime_voice_usage` (`user_id`);"));
  try {
    await db.run(sql.raw("ALTER TABLE `payload_locked_documents_rels` ADD `realtime_voice_usage_id` integer REFERENCES `realtime_voice_usage`(`id`) ON DELETE CASCADE;"));
  } catch {
    // Column may already exist on dev databases where Payload pushed schema.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Keep the usage table on rollback to avoid losing cost history.
}
