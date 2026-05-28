import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * OptiMate Settings global — backs the `optimate-settings` global which stores
 * the default chat / autonomous models for the Optimate-Google-Ads agent.
 *
 * See `src/globals/OptiMateSettings.ts`. Payload stores a global in a single
 * one-row table named after the slug with underscores (`optimate_settings`).
 *
 * Per CLAUDE.md, every new table requires a manual migration (push: false).
 * Globals do not get a `payload_locked_documents_rels` FK column (those are
 * for collections), so this migration only creates the global table.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`optimate_settings\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`default_chat_model\` text DEFAULT 'claude-sonnet-4.6',
    \`default_autonomous_model\` text DEFAULT 'kimi-k2.6',
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_settings\`;`);
}
