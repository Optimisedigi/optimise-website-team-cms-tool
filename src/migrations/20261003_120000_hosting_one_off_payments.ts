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

/** One-off hosting payment links (e.g. backdated hosting), separate from subscriptions. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await run(
    db,
    "CREATE TABLE IF NOT EXISTS hosting_one_off_payments (id integer PRIMARY KEY NOT NULL, client_id integer NOT NULL, token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active', expires_at text NOT NULL, stripe_checkout_session_id text, paid_at text, snapshot text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL, FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade);",
  )
  await run(
    db,
    'CREATE INDEX IF NOT EXISTS hosting_one_off_payments_client_idx ON hosting_one_off_payments(client_id);',
  )
  await run(
    db,
    'ALTER TABLE payload_locked_documents_rels ADD COLUMN hosting_one_off_payments_id integer REFERENCES hosting_one_off_payments(id) ON UPDATE no action ON DELETE cascade;',
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep payment records on rollback: they are the audit trail of what clients were asked to pay.
}
