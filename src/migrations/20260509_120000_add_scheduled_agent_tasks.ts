import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Phase 5 — Scheduled Agent Tasks + Gmail Drafts.
 *
 * Adds:
 *  - scheduled_agent_tasks table.
 *  - gmail_* columns on users (per-user Gmail OAuth tokens).
 *  - payload_locked_documents_rels.scheduled_agent_tasks_id FK.
 *
 * All ALTER TABLE adds are wrapped in try/catch because SQLite has no
 * IF NOT EXISTS for ADD COLUMN and some envs may already have the
 * columns from an earlier dev push.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── scheduled_agent_tasks ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`scheduled_agent_tasks\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`agent_name\` text DEFAULT 'optimate-google-ads' NOT NULL,
    \`prompt\` text NOT NULL,
    \`audit_id\` integer NOT NULL,
    \`client_id\` integer NOT NULL,
    \`created_by_id\` integer NOT NULL,
    \`recipient_email\` text NOT NULL,
    \`schedule\` text NOT NULL,
    \`timezone\` text DEFAULT 'Australia/Brisbane' NOT NULL,
    \`next_run_at\` text NOT NULL,
    \`last_run_at\` text,
    \`last_run_status\` text,
    \`last_run_error\` text,
    \`last_draft_id\` text,
    \`is_active\` integer DEFAULT true NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_audit_idx\` ON \`scheduled_agent_tasks\` (\`audit_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_client_idx\` ON \`scheduled_agent_tasks\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_created_by_idx\` ON \`scheduled_agent_tasks\` (\`created_by_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_next_run_at_idx\` ON \`scheduled_agent_tasks\` (\`next_run_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_is_active_idx\` ON \`scheduled_agent_tasks\` (\`is_active\`);`,
  );

  // ── users: Gmail OAuth columns ──
  const userCols: Array<[string, string]> = [
    ["gmail_connected", "integer DEFAULT false"],
    ["gmail_email", "text"],
    ["gmail_access_token", "text"],
    ["gmail_refresh_token", "text"],
    ["gmail_token_expiry", "text"],
  ];
  for (const [col, type] of userCols) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`users\` ADD \`${col}\` ${type};`));
    } catch {
      /* column already present */
    }
  }

  // ── payload_locked_documents_rels FK column ──
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`scheduled_agent_tasks_id\` integer REFERENCES \`scheduled_agent_tasks\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite drop-column needs a table rebuild; we only drop the new table.
  await db.run(sql`DROP TABLE IF EXISTS \`scheduled_agent_tasks\`;`);
}
