import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Portfolio OptiMate chat support.
 *
 * Portfolio conversations are not tied to a single Google Ads audit, so chat
 * turns need a `mode` discriminator and `audit_id` must be nullable. SQLite
 * cannot drop a NOT NULL constraint in place, so rebuild the table while
 * preserving existing rows and indexes.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`PRAGMA foreign_keys = OFF;`));
  await db.run(sql`ALTER TABLE \`optimate_chat_turns\` ADD \`mode\` text DEFAULT 'audit' NOT NULL;`).catch(() => undefined);
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_chat_turns_next\`;`);

  await db.run(sql`CREATE TABLE \`optimate_chat_turns_next\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`session_id\` text NOT NULL,
    \`mode\` text DEFAULT 'audit' NOT NULL,
    \`audit_id\` integer,
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

  await db.run(sql`INSERT OR REPLACE INTO \`optimate_chat_turns_next\` (
    \`id\`, \`session_id\`, \`mode\`, \`audit_id\`, \`user_id\`, \`client_id\`, \`role\`, \`content\`,
    \`preview\`, \`run_id\`, \`model_used\`, \`proposal_ids\`, \`updated_at\`, \`created_at\`
  )
  SELECT
    \`id\`, \`session_id\`, COALESCE(\`mode\`, 'audit'), \`audit_id\`, \`user_id\`, \`client_id\`, \`role\`, \`content\`,
    \`preview\`, \`run_id\`, \`model_used\`, \`proposal_ids\`, \`updated_at\`, \`created_at\`
  FROM \`optimate_chat_turns\`;`);

  await db.run(sql`DROP TABLE \`optimate_chat_turns\`;`);
  await db.run(sql`ALTER TABLE \`optimate_chat_turns_next\` RENAME TO \`optimate_chat_turns\`;`);

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_session_id_idx\` ON \`optimate_chat_turns\` (\`session_id\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_mode_idx\` ON \`optimate_chat_turns\` (\`mode\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_audit_idx\` ON \`optimate_chat_turns\` (\`audit_id\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_user_idx\` ON \`optimate_chat_turns\` (\`user_id\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_client_idx\` ON \`optimate_chat_turns\` (\`client_id\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_created_at_idx\` ON \`optimate_chat_turns\` (\`created_at\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`optimate_chat_turns_session_created_idx\` ON \`optimate_chat_turns\` (\`session_id\`, \`created_at\`);`);
  await db.run(sql.raw(`PRAGMA foreign_keys = ON;`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`UPDATE \`optimate_chat_turns\` SET \`audit_id\` = 0 WHERE \`audit_id\` IS NULL;`).catch(() => undefined);
}
