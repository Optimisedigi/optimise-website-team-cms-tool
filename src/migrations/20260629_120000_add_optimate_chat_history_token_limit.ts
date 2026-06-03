import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the `chat_history_token_limit` column to the `optimate_settings` global
 * table.
 *
 * The `chatHistoryTokenLimit` field was added to `src/globals/OptiMateSettings.ts`
 * after the original global table was created
 * (20260607_120000_add_optimate_settings_global) but no migration ever added the
 * backing column. As a result, saving OptiMate Settings in production failed with
 * a 500 ("no such column: chat_history_token_limit") because Payload tried to
 * write a column that did not exist.
 *
 * Idempotent: the ADD is wrapped in a catch so re-running on an environment that
 * already has the column is a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`optimate_settings\` ADD \`chat_history_token_limit\` numeric DEFAULT 6000;`)
    .catch(() => undefined);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`optimate_settings\` DROP COLUMN \`chat_history_token_limit\`;`)
    .catch(() => undefined);
}
