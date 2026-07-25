import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
async function run(db: MigrateUpArgs['db'], statement: string) {
  try {
    await db.run(sql.raw(statement))
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    if (
      error instanceof Error &&
      /(duplicate column name|already exists)/i.test(`${error.message} ${cause}`)
    )
      return
    throw error
  }
}
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const column of [
    '`hosting_subscription_plan_name` text',
    '`hosting_subscription_allowance` text',
    '`hosting_subscription_capacity_clause` text',
    '`hosting_subscription_monthly_base_cents` numeric',
    '`hosting_subscription_annual_base_cents` numeric',
    '`hosting_subscription_recipient_name` text',
    '`hosting_subscription_recipient_email` text',
    '`hosting_subscription_billing_interval` text',
    '`hosting_subscription_stripe_customer_id` text',
    '`hosting_subscription_stripe_subscription_id` text',
    '`hosting_subscription_stripe_hosting_item_id` text',
    '`hosting_subscription_stripe_surcharge_item_id` text',
    '`hosting_subscription_stripe_latest_invoice_id` text',
    '`hosting_subscription_subscription_status` text',
    '`hosting_subscription_current_period_end` text',
    '`hosting_subscription_cancel_at_period_end` boolean',
    '`hosting_subscription_provider_event_created_at` text',
    '`hosting_subscription_provider_event_id` text',
    '`hosting_subscription_offer_created_at` text',
    '`hosting_subscription_offer_expires_at` text',
    '`hosting_subscription_offer_completed_at` text',
    '`hosting_subscription_active_offer_id` integer',
  ])
    await run(db, `ALTER TABLE clients ADD COLUMN ${column};`)
  await run(
    db,
    "CREATE TABLE IF NOT EXISTS hosting_billing_settings (id integer PRIMARY KEY NOT NULL, currency text DEFAULT 'aud' NOT NULL, card_surcharge_percentage numeric DEFAULT 0 NOT NULL, card_surcharge_fixed_cents numeric DEFAULT 0 NOT NULL, surcharge_effective_from text, minimum_notice_days numeric DEFAULT 30 NOT NULL, capacity_change_clause text DEFAULT 'If hosting capacity exceeds the included allowance, we may propose a future price change with written notice. The change will take effect at a future renewal only.' NOT NULL, notice_email_subject text DEFAULT 'Hosting capacity price change notice for {{clientName}}' NOT NULL, notice_email_body text DEFAULT 'Hello {{clientName}},\\n\\nWe are proposing a hosting price change from {{currentPrice}} to {{newPrice}}, effective on {{effectiveDate}}. Reason: {{reason}}.' NOT NULL, updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));",
  )
  await run(
    db,
    'CREATE TABLE IF NOT EXISTS hosting_billing_settings_plans (_order integer NOT NULL, _parent_id integer NOT NULL, id text PRIMARY KEY NOT NULL, name text NOT NULL, description text, included_allowance text NOT NULL, monthly_base_cents numeric NOT NULL, annual_base_cents numeric NOT NULL, active boolean DEFAULT true, FOREIGN KEY (_parent_id) REFERENCES hosting_billing_settings(id) ON UPDATE no action ON DELETE cascade);',
  )
  await run(
    db,
    'CREATE INDEX IF NOT EXISTS hosting_billing_settings_plans_parent_idx ON hosting_billing_settings_plans(_parent_id);',
  )
  await run(
    db,
    'CREATE INDEX IF NOT EXISTS hosting_billing_settings_plans_order_idx ON hosting_billing_settings_plans(_order);',
  )
  await run(
    db,
    "CREATE TABLE IF NOT EXISTS hosting_payment_offers (id integer PRIMARY KEY NOT NULL, client_id integer NOT NULL, token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'active', expires_at text NOT NULL, selected_interval text, stripe_checkout_session_id text, snapshot text NOT NULL, created_at text NOT NULL, updated_at text NOT NULL);",
  )
  await run(
    db,
    'CREATE INDEX IF NOT EXISTS hosting_payment_offers_client_idx ON hosting_payment_offers(client_id);',
  )
  await run(
    db,
    'CREATE TABLE IF NOT EXISTS clients_hosting_subscription_price_changes (_order integer NOT NULL, _parent_id integer NOT NULL, id text PRIMARY KEY NOT NULL, status text, reason text, effective_at text, old_quote text, new_quote text, notice_sent_at text, notice_message_id text, applied_at text, stripe_reference text, last_error text, retry_count numeric, FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade);',
  )
  await run(
    db,
    'ALTER TABLE clients_hosting_subscription_price_changes ADD COLUMN applied_at text;',
  )
  await run(
    db,
    'CREATE INDEX IF NOT EXISTS clients_hosting_subscription_price_changes_parent_idx ON clients_hosting_subscription_price_changes(_parent_id);',
  )
  await run(
    db,
    'CREATE INDEX IF NOT EXISTS clients_hosting_subscription_price_changes_order_idx ON clients_hosting_subscription_price_changes(_order);',
  )
  await run(
    db,
    'ALTER TABLE payload_locked_documents_rels ADD COLUMN hosting_payment_offers_id integer REFERENCES hosting_payment_offers(id) ON UPDATE no action ON DELETE cascade;',
  )
}
export async function down(_args: MigrateDownArgs): Promise<void> {}
