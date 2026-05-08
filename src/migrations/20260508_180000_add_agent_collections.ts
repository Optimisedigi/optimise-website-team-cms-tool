import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the two new agent-fleet tables (agent_credentials,
 * agent_approval_queue), backfills the new agent step columns on
 * activity_log, and registers FK columns on payload_locked_documents_rels so
 * record views don't crash.
 *
 * The activity_log column adds and locked-rels FK adds are wrapped in try/catch
 * so this migration is idempotent — it has to be safe to re-run on a database
 * where the columns already exist (some have been pushed via dev push:true).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── agent_credentials ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`agent_credentials\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`provider\` text NOT NULL,
    \`kind\` text NOT NULL,
    \`data\` text NOT NULL,
    \`force_fallback\` integer DEFAULT false,
    \`last_refreshed_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`);
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS \`agent_credentials_provider_idx\` ON \`agent_credentials\` (\`provider\`);`,
  );

  // ── agent_approval_queue ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`agent_approval_queue\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`agent_name\` text NOT NULL,
    \`client_id\` integer,
    \`proposal_type\` text NOT NULL,
    \`agent_run_id\` text NOT NULL,
    \`proposal_payload\` text NOT NULL,
    \`rendered_client_html\` text,
    \`rendered_internal_markdown\` text,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`reviewed_by_id\` integer,
    \`reviewed_at\` text,
    \`applied_at\` text,
    \`apply_error\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`reviewed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_approval_queue_agent_name_idx\` ON \`agent_approval_queue\` (\`agent_name\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_approval_queue_proposal_type_idx\` ON \`agent_approval_queue\` (\`proposal_type\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_approval_queue_agent_run_id_idx\` ON \`agent_approval_queue\` (\`agent_run_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_approval_queue_client_idx\` ON \`agent_approval_queue\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_approval_queue_status_idx\` ON \`agent_approval_queue\` (\`status\`);`,
  );

  // ── activity_log new columns ──
  // Each wrapped because some installations may already have pushed them via
  // dev push:true, and SQLite has no IF NOT EXISTS for ADD COLUMN.
  const activityCols: Array<[string, string]> = [
    ["agent_run_id", "text"],
    ["agent_name", "text"],
    ["step", "integer"],
    ["tool_name", "text"],
    ["input", "text"],
    ["output", "text"],
    ["reasoning", "text"],
    ["model", "text"],
    ["source", "text"],
    ["duration_ms", "integer"],
  ];
  for (const [col, type] of activityCols) {
    try {
      await db.run(
        sql.raw(`ALTER TABLE \`activity_log\` ADD \`${col}\` ${type};`),
      );
    } catch {
      /* column already present */
    }
  }
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`activity_log_agent_run_id_idx\` ON \`activity_log\` (\`agent_run_id\`);`,
    );
  } catch {
    /* index might fail if column wasn't added; ignore */
  }
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`activity_log_agent_name_idx\` ON \`activity_log\` (\`agent_name\`);`,
    );
  } catch {
    /* same */
  }

  // ── payload_locked_documents_rels FK columns ──
  for (const col of ["agent_credentials_id", "agent_approval_queue_id"]) {
    try {
      const fkTable = col.replace(/_id$/, "");
      await db.run(
        sql.raw(
          `ALTER TABLE \`payload_locked_documents_rels\` ADD \`${col}\` integer REFERENCES \`${fkTable}\`(\`id\`) ON DELETE CASCADE;`,
        ),
      );
    } catch {
      /* column already present */
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite drop column needs a table rebuild; not worth the complexity for a
  // down path nobody runs in production. We drop the two new tables only.
  await db.run(sql`DROP TABLE IF EXISTS \`agent_approval_queue\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`agent_credentials\`;`);
}
