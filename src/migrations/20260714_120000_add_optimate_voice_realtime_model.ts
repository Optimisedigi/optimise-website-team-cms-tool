import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/** Add the OptiMate Settings voice model selector for Realtime calls. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`optimate_settings\` ADD \`voice_realtime_model\` text DEFAULT 'gpt-realtime-mini';`).catch(() => undefined);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`optimate_settings\` DROP COLUMN \`voice_realtime_model\`;`).catch(() => undefined);
}
