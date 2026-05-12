import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Persistent OptiMate chat history.
 *
 * Adds:
 *  - `optimate_chat_turns` table (one row per user/assistant message).
 *  - Indexes on the columns the chat history API queries.
 *  - `payload_locked_documents_rels.optimate_chat_turns_id` FK (required or
 *    locked-document views in admin crash for this collection).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── optimate_chat_turns ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`optimate_chat_turns\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`session_id\` text NOT NULL,
    \`audit_id\` integer NOT NULL,
    \`user_id\` integer NOT NULL,
    \`client_id\` integer,
    \`role\` text NOT NULL,
    \`content\` text NOT NULL,
    \`preview\` text,
    \`run_id\` text,
    \`model_used\` text,
    \`proposal_ids\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_session_id_idx\` ON \`optimate_chat_turns\` (\`session_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_audit_idx\` ON \`optimate_chat_turns\` (\`audit_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_user_idx\` ON \`optimate_chat_turns\` (\`user_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_client_idx\` ON \`optimate_chat_turns\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_created_at_idx\` ON \`optimate_chat_turns\` (\`created_at\`);`,
  );
  // Composite for the most common read: list a thread in chronological order.
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_session_created_idx\` ON \`optimate_chat_turns\` (\`session_id\`, \`created_at\`);`,
  );

  // ── payload_locked_documents_rels FK column ──
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`optimate_chat_turns_id\` integer REFERENCES \`optimate_chat_turns\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_chat_turns\`;`);
}
