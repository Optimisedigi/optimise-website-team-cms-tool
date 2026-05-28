import { createClient } from '@libsql/client';

const databaseUrl = process.env.DATABASE_URL || 'file:./content.db';
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;
const db = createClient({ url: databaseUrl, authToken });

async function run(statement) {
  try {
    await db.execute(statement);
    console.log(`ok: ${statement.replace(/\s+/g, ' ').trim().slice(0, 90)}...`);
  } catch (error) {
    if (String(error?.message || error).includes('duplicate column name')) {
      console.log(`skip duplicate column: ${statement}`);
      return;
    }
    throw error;
  }
}

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS clients_additional_contacts (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    name text,
    email text,
    job_title text,
    responsibilities text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_additional_contacts_order_idx ON clients_additional_contacts (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_additional_contacts_parent_id_idx ON clients_additional_contacts (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_yearly_targets (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    year numeric,
    target numeric,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_yearly_targets_order_idx ON clients_yearly_targets (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_yearly_targets_parent_id_idx ON clients_yearly_targets (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_one_off_projects (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    project_name text NOT NULL,
    amount numeric NOT NULL,
    date text NOT NULL,
    count_towards_retainer integer DEFAULT false,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_one_off_projects_order_idx ON clients_one_off_projects (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_one_off_projects_parent_id_idx ON clients_one_off_projects (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_referral_commissions (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    payee_name text,
    payee_contact text,
    frequency text,
    commission_type text,
    percentage numeric,
    monthly_amount numeric,
    one_off_amount numeric,
    start_date text,
    end_date text,
    notes text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_referral_commissions_order_idx ON clients_referral_commissions (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_referral_commissions_parent_id_idx ON clients_referral_commissions (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_historical_revenue_by_year (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    year numeric,
    amount numeric,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_historical_revenue_by_year_order_idx ON clients_historical_revenue_by_year (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_historical_revenue_by_year_parent_id_idx ON clients_historical_revenue_by_year (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_retainer_history (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    amount numeric,
    previous_amount numeric,
    effective_date text,
    changed_by text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_retainer_history_order_idx ON clients_retainer_history (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_retainer_history_parent_id_idx ON clients_retainer_history (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS client_notes (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    category text,
    date text,
    author text,
    content text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS client_notes_order_idx ON client_notes (_order)`,
  `CREATE INDEX IF NOT EXISTS client_notes_parent_id_idx ON client_notes (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS client_account_timeline (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    date text,
    service_area text,
    action_type text,
    description text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS client_account_timeline_order_idx ON client_account_timeline (_order)`,
  `CREATE INDEX IF NOT EXISTS client_account_timeline_parent_id_idx ON client_account_timeline (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_conversion_action_categories (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    label text,
    color text,
    actions text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_conversion_action_categories_order_idx ON clients_conversion_action_categories (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_conversion_action_categories_parent_id_idx ON clients_conversion_action_categories (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS gads_report_emails (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    email text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS gads_report_emails_order_idx ON gads_report_emails (_order)`,
  `CREATE INDEX IF NOT EXISTS gads_report_emails_parent_id_idx ON gads_report_emails (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS gads_weekly_emails (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    email text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS gads_weekly_emails_order_idx ON gads_weekly_emails (_order)`,
  `CREATE INDEX IF NOT EXISTS gads_weekly_emails_parent_id_idx ON gads_weekly_emails (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_protected_campaign_ids (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    campaign_id text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_protected_campaign_ids_order_idx ON clients_protected_campaign_ids (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_protected_campaign_ids_parent_id_idx ON clients_protected_campaign_ids (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_brand_campaign_ids (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    campaign_id text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_brand_campaign_ids_order_idx ON clients_brand_campaign_ids (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_brand_campaign_ids_parent_id_idx ON clients_brand_campaign_ids (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_serp_monitor_keywords (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    keyword text,
    location text,
    device text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_serp_monitor_keywords_order_idx ON clients_serp_monitor_keywords (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_serp_monitor_keywords_parent_id_idx ON clients_serp_monitor_keywords (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_serp_monitor_alert_recipient_emails (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    email text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_serp_monitor_alert_recipient_emails_order_idx ON clients_serp_monitor_alert_recipient_emails (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_serp_monitor_alert_recipient_emails_parent_id_idx ON clients_serp_monitor_alert_recipient_emails (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_ai_visibility_recipient_emails (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    email text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_ai_visibility_recipient_emails_order_idx ON clients_ai_visibility_recipient_emails (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_ai_visibility_recipient_emails_parent_id_idx ON clients_ai_visibility_recipient_emails (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_ai_visibility_probe_prompts (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    prompt text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS clients_ai_visibility_probe_prompts_order_idx ON clients_ai_visibility_probe_prompts (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_ai_visibility_probe_prompts_parent_id_idx ON clients_ai_visibility_probe_prompts (_parent_id)`,

  `CREATE TABLE IF NOT EXISTS clients_presentations (
    _order integer NOT NULL,
    _parent_id integer NOT NULL,
    id text PRIMARY KEY NOT NULL,
    title text,
    deck_url text,
    deck_slug text,
    presented_on text,
    kind text,
    is_public integer,
    notes text,
    template_slug_id integer,
    deck_payload text,
    FOREIGN KEY (_parent_id) REFERENCES clients(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (template_slug_id) REFERENCES deck_templates(id) ON UPDATE no action ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS clients_presentations_order_idx ON clients_presentations (_order)`,
  `CREATE INDEX IF NOT EXISTS clients_presentations_parent_id_idx ON clients_presentations (_parent_id)`,
  `CREATE INDEX IF NOT EXISTS clients_presentations_template_slug_idx ON clients_presentations (template_slug_id)`,
];

for (const statement of tableStatements) {
  await run(statement);
}

const tables = await db.execute("select name from sqlite_master where type='table' and (name like 'clients_%' or name in ('client_notes','client_account_timeline','gads_report_emails','gads_weekly_emails')) order by name");
console.log('\nclient-related tables now present:');
console.log(tables.rows.map((row) => row.name).join('\n'));
