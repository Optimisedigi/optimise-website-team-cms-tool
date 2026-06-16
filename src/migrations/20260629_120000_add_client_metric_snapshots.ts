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
  await db.run(sql.raw(
    'CREATE TABLE IF NOT EXISTS `client_metric_snapshots` (' +
      '`id` integer PRIMARY KEY NOT NULL,' +
      '`client_id` integer NOT NULL REFERENCES `clients`(`id`) ON DELETE cascade,' +
      '`source` text DEFAULT \'website-we-can-quit\' NOT NULL,' +
      '`date` text NOT NULL,' +
      '`tracking_start_date` text NOT NULL,' +
      '`assessments_completed` numeric DEFAULT 0 NOT NULL,' +
      '`prescriptions` numeric DEFAULT 0 NOT NULL,' +
      '`assessment_target` numeric DEFAULT 500 NOT NULL,' +
      '`prescription_target` numeric DEFAULT 500 NOT NULL,' +
      '`as_of` text NOT NULL,' +
      '`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,' +
      '`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL' +
    ');',
  ))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_metric_snapshots_client_idx` ON `client_metric_snapshots` (`client_id`);'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_metric_snapshots_source_idx` ON `client_metric_snapshots` (`source`);'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_metric_snapshots_date_idx` ON `client_metric_snapshots` (`date`);'))
  await db.run(sql.raw('CREATE UNIQUE INDEX IF NOT EXISTS `client_metric_snapshots_client_source_date_idx` ON `client_metric_snapshots` (`client_id`, `source`, `date`);'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_metric_snapshots_updated_at_idx` ON `client_metric_snapshots` (`updated_at`);'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_metric_snapshots_created_at_idx` ON `client_metric_snapshots` (`created_at`);'))

  await addColumn(db, 'ALTER TABLE `clients` ADD `wcq_tracking_start_date` text DEFAULT \'2026-05-01\';')
  await addColumn(db, 'ALTER TABLE `clients` ADD `wcq_assessments_completed` numeric DEFAULT 0;')
  await addColumn(db, 'ALTER TABLE `clients` ADD `wcq_prescription_count` numeric DEFAULT 0;')
  await addColumn(db, 'ALTER TABLE `clients` ADD `wcq_assessment_target` numeric DEFAULT 500;')
  await addColumn(db, 'ALTER TABLE `clients` ADD `wcq_prescription_target` numeric DEFAULT 500;')
  await addColumn(db, 'ALTER TABLE `clients` ADD `wcq_metrics_last_synced_at` text;')
  await addColumn(db, 'ALTER TABLE `payload_locked_documents_rels` ADD `client_metric_snapshots_id` integer REFERENCES `client_metric_snapshots`(`id`) ON DELETE CASCADE;')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('DROP TABLE IF EXISTS `client_metric_snapshots`;'))
}
