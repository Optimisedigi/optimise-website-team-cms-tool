import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function addColumn(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    if (error instanceof Error && /duplicate column name/i.test(error.message)) return
    throw error
  }
}

// Scheduled retainer change on clients: from `retainer_change_date` the
// retainer ends or becomes `retainer_change_amount`. Additive only.
// Also applied by runMigrations() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `retainer_change_action` text;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `retainer_change_date` text;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `retainer_change_amount` numeric;")
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite/libSQL column drops are intentionally avoided for production safety.
}
