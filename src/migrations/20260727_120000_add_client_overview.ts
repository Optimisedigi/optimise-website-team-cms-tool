import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function addColumn(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    if (error instanceof Error && /duplicate column name/i.test(error.message)) return
    throw error
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `client_overview` text;")
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite/libSQL column drops are intentionally avoided for production safety.
}
