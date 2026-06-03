import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw("ALTER TABLE `clients` ADD COLUMN `client_type` text DEFAULT 'recurring';"))
  } catch (error) {
    if (error instanceof Error && /duplicate column name/i.test(error.message)) return
    throw error
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite cannot reliably drop columns in-place across libSQL versions.
}
