import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function addColumn(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    // Local development may already have the column because schema push is enabled there.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    if (error instanceof Error && /duplicate column name/i.test(`${error.message} ${cause}`)) return
    throw error
  }
}

/**
 * Per-client hosting billing start date (first charge and renewal day), and
 * the client-facing renewal/cancellation note in Hosting Billing Settings.
 * Both nullable: a blank start date bills from sign-up, a blank note uses the
 * standard wording.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumn(
    db,
    'ALTER TABLE `clients` ADD COLUMN `hosting_subscription_billing_start_date` text',
  )
  await addColumn(db, 'ALTER TABLE `hosting_billing_settings` ADD COLUMN `renewal_note` text')
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep the nullable columns on rollback so reverting code cannot destroy entered data.
}
