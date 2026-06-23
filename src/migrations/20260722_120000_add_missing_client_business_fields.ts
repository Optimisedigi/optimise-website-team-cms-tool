import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function addColumn(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    if (error instanceof Error && /duplicate column name/i.test(error.message)) return
    throw error
  }
}

/**
 * Several Client fields were added while local schema push was available, but
 * production relies on migrations. Payload selects all client columns when the
 * Google dashboard resolves a client, so one missing column can blank the page.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `client_start_date` text;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `acquisition_channel` text;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `acquisition_detail` text;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `referred_by` text;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `referred_by_contact` text;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `setup_fee` numeric;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `revenue_share_percent` numeric DEFAULT 100;")
  await addColumn(db, "ALTER TABLE `clients` ADD COLUMN `retainer_start_date` text;")
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // SQLite/libSQL column drops are intentionally avoided for production safety.
}
