import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function addLockedDocsColumn(db: MigrateUpArgs['db']): Promise<void> {
  try {
    await db.run(
      sql.raw(
        'ALTER TABLE `payload_locked_documents_rels` ADD `agency_kpi_snapshots_id` integer REFERENCES `agency_kpi_snapshots`(`id`) ON DELETE CASCADE;',
      ),
    )
  } catch (error) {
    if (error instanceof Error && /duplicate column name/i.test(error.message)) return
    throw error
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(
    'CREATE TABLE IF NOT EXISTS `agency_kpi_snapshots` (' +
      '`id` integer PRIMARY KEY NOT NULL,' +
      '`month` text NOT NULL,' +
      '`active_clients` numeric DEFAULT 0 NOT NULL,' +
      '`active_leads` numeric DEFAULT 0 NOT NULL,' +
      '`arr` numeric DEFAULT 0 NOT NULL,' +
      '`monthly_retainer` numeric DEFAULT 0 NOT NULL,' +
      '`retainer_ytd` numeric DEFAULT 0 NOT NULL,' +
      '`one_off_ytd` numeric DEFAULT 0 NOT NULL,' +
      '`lead_conversion` numeric DEFAULT 0 NOT NULL,' +
      '`mtd_costs` numeric DEFAULT 0 NOT NULL,' +
      '`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,' +
      '`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL' +
    ');',
  ))
  await db.run(sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS `agency_kpi_snapshots_month_idx` ON `agency_kpi_snapshots` (`month`);'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `agency_kpi_snapshots_updated_at_idx` ON `agency_kpi_snapshots` (`updated_at`);'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `agency_kpi_snapshots_created_at_idx` ON `agency_kpi_snapshots` (`created_at`);'))
  await addLockedDocsColumn(db)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('DROP TABLE IF EXISTS `agency_kpi_snapshots`;'))
}
