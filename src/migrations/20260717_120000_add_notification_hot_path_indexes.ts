import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Speeds up the admin bell hot path:
 *   - unread count by recipient/read_at
 *   - recent notification dropdown by recipient/created_at
 *   - synthetic approval notification lookups by status/updated_at
 *   - recent approval activity rows by type/created_at
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const statements = [
    sql`CREATE INDEX IF NOT EXISTS \`notifications_recipient_read_at_created_at_idx\` ON \`notifications\` (\`recipient_id\`, \`read_at\`, \`created_at\`);`,
    sql`CREATE INDEX IF NOT EXISTS \`notifications_recipient_created_at_idx\` ON \`notifications\` (\`recipient_id\`, \`created_at\`);`,
    sql`CREATE INDEX IF NOT EXISTS \`notifications_kind_related_approval_idx\` ON \`notifications\` (\`kind\`, \`related_approval_id\`);`,
    sql`CREATE INDEX IF NOT EXISTS \`agent_approval_queue_status_updated_at_idx\` ON \`agent_approval_queue\` (\`status\`, \`updated_at\`);`,
    sql`CREATE INDEX IF NOT EXISTS \`activity_log_type_created_at_idx\` ON \`activity_log\` (\`type\`, \`created_at\`);`,
  ];

  for (const statement of statements) {
    try {
      await db.run(statement);
    } catch {
      // Some prod DBs may not have every optional table/column yet; keep the
      // migration idempotent and let the indexes apply where the schema exists.
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op: production migrations are forward-only for this project.
}
