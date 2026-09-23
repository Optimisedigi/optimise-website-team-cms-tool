import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw("ALTER TABLE `optimate_settings` ADD `voice_auth_method` text DEFAULT 'api-key';"));
  } catch {
    // Column may already exist on dev databases where Payload pushed schema.
  }
  // Backfill any NULL or unrecognised values so the Payload select field can
  // map the stored value to its label (otherwise the raw column name shows).
  await db.run(sql.raw("UPDATE `optimate_settings` SET `voice_auth_method` = 'api-key' WHERE `voice_auth_method` IS NULL OR `voice_auth_method` NOT IN ('api-key', 'codex-oauth');"));
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Column is informational; keep on rollback to avoid losing billing config.
}
