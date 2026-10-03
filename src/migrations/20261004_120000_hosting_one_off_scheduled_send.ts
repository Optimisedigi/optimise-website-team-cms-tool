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

/**
 * Lets a one-off payment link email go out on a scheduled date, and lets a
 * cancelled link be removed from the client page list.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await run(db, 'ALTER TABLE hosting_one_off_payments ADD COLUMN scheduled_send_at text;')
  await run(db, 'ALTER TABLE hosting_one_off_payments ADD COLUMN email_sent_at text;')
  await run(db, 'ALTER TABLE hosting_one_off_payments ADD COLUMN send_attempts numeric DEFAULT 0;')
  await run(db, 'ALTER TABLE hosting_one_off_payments ADD COLUMN hidden_at text;')
  await run(
    db,
    'CREATE INDEX IF NOT EXISTS hosting_one_off_payments_scheduled_send_at_idx ON hosting_one_off_payments(scheduled_send_at);',
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep the columns on rollback: they record when each payment email went out.
}
