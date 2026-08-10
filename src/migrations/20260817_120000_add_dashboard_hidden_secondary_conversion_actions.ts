import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `clients` ADD `dashboard_hidden_secondary_conversion_actions` text;",
      ),
    );
  } catch {
    // The column already exists in this environment.
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `clients` DROP COLUMN `dashboard_hidden_secondary_conversion_actions`;",
      ),
    );
  } catch {
    // SQLite versions without DROP COLUMN, or databases without the column.
  }
}
