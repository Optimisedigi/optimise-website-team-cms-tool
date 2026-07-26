import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function run(db: MigrateUpArgs['db'], statement: string) {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    if (
      error instanceof Error &&
      /(duplicate column name|already exists|no such column|no such table)/i.test(
        `${error.message} ${cause}`,
      )
    )
      return
    throw error
  }
}

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS hosting_billing_settings_plans_parent_idx ON hosting_billing_settings_plans(_parent_id);',
  'CREATE INDEX IF NOT EXISTS hosting_billing_settings_plans_order_idx ON hosting_billing_settings_plans(_order);',
]

/**
 * Hosting plans now store a monthly price in dollars plus an optional annual
 * discount; the annual price is always monthly x 12 less that discount, so the
 * separate annual column is gone. The table is rebuilt because the original
 * cents columns are NOT NULL and would reject inserts once Payload stops
 * writing them.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Guarantee both legacy shapes exist so the copy below can reference them.
  await run(db, 'ALTER TABLE hosting_billing_settings_plans ADD COLUMN monthly_price numeric;')
  await run(db, 'ALTER TABLE hosting_billing_settings_plans ADD COLUMN annual_price numeric;')
  await run(
    db,
    'ALTER TABLE hosting_billing_settings_plans ADD COLUMN monthly_base_cents numeric;',
  )
  await run(db, 'ALTER TABLE hosting_billing_settings_plans ADD COLUMN annual_base_cents numeric;')

  await run(
    db,
    'CREATE TABLE IF NOT EXISTS hosting_billing_settings_plans_new (_order integer NOT NULL, _parent_id integer NOT NULL, id text PRIMARY KEY NOT NULL, name text NOT NULL, description text, included_allowance text NOT NULL, monthly_price numeric NOT NULL, annual_discount_percentage numeric, active boolean DEFAULT true, FOREIGN KEY (_parent_id) REFERENCES hosting_billing_settings(id) ON UPDATE no action ON DELETE cascade);',
  )
  await run(
    db,
    `INSERT INTO hosting_billing_settings_plans_new (_order, _parent_id, id, name, description, included_allowance, monthly_price, annual_discount_percentage, active)
     SELECT _order, _parent_id, id, name, description, included_allowance,
       COALESCE(monthly_price, monthly_base_cents / 100.0, 0),
       NULLIF(
         ROUND(
           (1 - (
             COALESCE(annual_price, annual_base_cents / 100.0, 0)
             / NULLIF(COALESCE(monthly_price, monthly_base_cents / 100.0, 0) * 12, 0)
           )) * 100
         , 2)
       , 0),
       active
     FROM hosting_billing_settings_plans;`,
  )
  await run(db, 'DROP TABLE hosting_billing_settings_plans;')
  await run(
    db,
    'ALTER TABLE hosting_billing_settings_plans_new RENAME TO hosting_billing_settings_plans;',
  )
  for (const statement of INDEXES) await run(db, statement)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await run(
    db,
    'CREATE TABLE IF NOT EXISTS hosting_billing_settings_plans_old (_order integer NOT NULL, _parent_id integer NOT NULL, id text PRIMARY KEY NOT NULL, name text NOT NULL, description text, included_allowance text NOT NULL, monthly_base_cents numeric NOT NULL, annual_base_cents numeric NOT NULL, active boolean DEFAULT true, FOREIGN KEY (_parent_id) REFERENCES hosting_billing_settings(id) ON UPDATE no action ON DELETE cascade);',
  )
  await run(
    db,
    `INSERT INTO hosting_billing_settings_plans_old (_order, _parent_id, id, name, description, included_allowance, monthly_base_cents, annual_base_cents, active)
     SELECT _order, _parent_id, id, name, description, included_allowance,
       CAST(ROUND(monthly_price * 100) AS INTEGER),
       CAST(ROUND(monthly_price * 100 * 12 * (1 - COALESCE(annual_discount_percentage, 0) / 100.0)) AS INTEGER),
       active
     FROM hosting_billing_settings_plans;`,
  )
  await run(db, 'DROP TABLE hosting_billing_settings_plans;')
  await run(
    db,
    'ALTER TABLE hosting_billing_settings_plans_old RENAME TO hosting_billing_settings_plans;',
  )
  for (const statement of INDEXES) await run(db, statement)
}
