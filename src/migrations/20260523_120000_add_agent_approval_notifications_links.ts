import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Wires the agent-approval bell-notification fan-out:
 *   - adds `triggered_by_id` to `agent_approval_queue` so each queued
 *     proposal records the CMS user whose chat turn / scheduled action
 *     triggered the agent run (informational; the fan-out separately looks
 *     the caller up via agentRunId for older rows).
 *   - adds `related_approval_id` to `notifications` so the bell fan-out can
 *     bulk-clear every per-user row when any admin actions the approval.
 *
 * Both ADDs are wrapped in try/catch because SQLite has no IF NOT EXISTS for
 * ALTER TABLE ADD COLUMN and some environments may already have pushed these
 * columns via dev push:true.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // agent_approval_queue.triggered_by_id → users.id
  try {
    await db.run(
      sql`ALTER TABLE \`agent_approval_queue\` ADD \`triggered_by_id\` integer REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
    );
  } catch {
    /* column already present */
  }
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`agent_approval_queue_triggered_by_idx\` ON \`agent_approval_queue\` (\`triggered_by_id\`);`,
    );
  } catch {
    /* index already present or column missing */
  }

  // notifications.related_approval_id → agent_approval_queue.id
  try {
    await db.run(
      sql`ALTER TABLE \`notifications\` ADD \`related_approval_id\` integer REFERENCES \`agent_approval_queue\`(\`id\`) ON UPDATE no action ON DELETE set null;`,
    );
  } catch {
    /* column already present */
  }
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`notifications_related_approval_idx\` ON \`notifications\` (\`related_approval_id\`);`,
    );
  } catch {
    /* index already present or column missing */
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite can't DROP COLUMN without a full table rebuild; left as a no-op
  // because no production path exercises down migrations.
}
