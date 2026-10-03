import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function run(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    // Local development may already have these because schema push is enabled there.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    if (
      error instanceof Error &&
      /duplicate column name|already exists/i.test(`${error.message} ${cause}`)
    )
      return
    throw error
  }
}

/** Lets an unpaid one-off payment link be emailed again on a chosen date. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await run(db, 'ALTER TABLE hosting_one_off_payments ADD COLUMN resend_at text;')
  await run(
    db,
    'CREATE INDEX IF NOT EXISTS hosting_one_off_payments_resend_at_idx ON hosting_one_off_payments(resend_at);',
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep the column on rollback: it records when a resend was due.
}
