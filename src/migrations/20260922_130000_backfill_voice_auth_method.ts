import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw("UPDATE `optimate_settings` SET `voice_auth_method` = 'api-key' WHERE `voice_auth_method` IS NULL OR `voice_auth_method` NOT IN ('api-key', 'codex-oauth');"));
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Backfill only; nothing to undo.
}
