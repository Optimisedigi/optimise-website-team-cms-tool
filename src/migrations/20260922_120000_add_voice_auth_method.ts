import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw("ALTER TABLE `optimate_settings` ADD `voice_auth_method` text DEFAULT 'api-key';"));
  } catch {
    // Column may already exist on dev databases where Payload pushed schema.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Column is informational; keep on rollback to avoid losing billing config.
}
