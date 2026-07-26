import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function run(db: MigrateUpArgs['db'], statement: string) {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    if (
      error instanceof Error &&
      /(duplicate column name|already exists|no such column)/i.test(`${error.message} ${cause}`)
    )
      return
    throw error
  }
}

/**
 * Hosting plans are authored by finance staff, so the global now stores plan
 * prices in dollars instead of cents. Client records and Stripe still use cents;
 * the admin field converts on read.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await run(
    db,
    'ALTER TABLE hosting_billing_settings_plans ADD COLUMN monthly_price numeric;',
  )
  await run(db, 'ALTER TABLE hosting_billing_settings_plans ADD COLUMN annual_price numeric;')
  await run(
    db,
    'UPDATE hosting_billing_settings_plans SET monthly_price = monthly_base_cents / 100.0 WHERE monthly_price IS NULL AND monthly_base_cents IS NOT NULL;',
  )
  await run(
    db,
    'UPDATE hosting_billing_settings_plans SET annual_price = annual_base_cents / 100.0 WHERE annual_price IS NULL AND annual_base_cents IS NOT NULL;',
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await run(
    db,
    'UPDATE hosting_billing_settings_plans SET monthly_base_cents = CAST(ROUND(monthly_price * 100) AS INTEGER) WHERE monthly_price IS NOT NULL;',
  )
  await run(
    db,
    'UPDATE hosting_billing_settings_plans SET annual_base_cents = CAST(ROUND(annual_price * 100) AS INTEGER) WHERE annual_price IS NOT NULL;',
  )
  await run(db, 'ALTER TABLE hosting_billing_settings_plans DROP COLUMN monthly_price;')
  await run(db, 'ALTER TABLE hosting_billing_settings_plans DROP COLUMN annual_price;')
}
