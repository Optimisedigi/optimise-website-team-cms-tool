import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw("ALTER TABLE `activity_log` ADD `target_url` text;"));
  } catch {
    // The column already exists in this environment.
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql.raw("ALTER TABLE `activity_log` DROP COLUMN `target_url`;"));
  } catch {
    // SQLite versions without DROP COLUMN, or databases without the column.
  }
}
