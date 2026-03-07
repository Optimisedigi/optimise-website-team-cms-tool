import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Main sales_leads table
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`sales_leads\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`business_name\` text NOT NULL,
    \`website_url\` text,
    \`contact_name\` text,
    \`contact_email\` text,
    \`contact_phone\` text,
    \`channel\` text NOT NULL,
    \`channel_detail\` text,
    \`estimated_value\` numeric,
    \`business_type\` text,
    \`notes\` text,
    \`lost_reason\` text,
    \`lost_notes\` text,
    \`proposal_id\` integer,
    \`contract_id\` integer,
    \`client_id\` integer,
    \`stage\` text DEFAULT 'new_lead' NOT NULL,
    \`first_contact_date\` text,
    \`expected_close_date\` text,
    \`priority\` text DEFAULT 'medium',
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  // Indexes for common queries
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_channel_idx\` ON \`sales_leads\` (\`channel\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_stage_idx\` ON \`sales_leads\` (\`stage\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_proposal_idx\` ON \`sales_leads\` (\`proposal_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_client_idx\` ON \`sales_leads\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_created_at_idx\` ON \`sales_leads\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_updated_at_idx\` ON \`sales_leads\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_first_contact_idx\` ON \`sales_leads\` (\`first_contact_date\`);`)

  // Stage history array table
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`sales_leads_stage_history\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`from_stage\` text,
    \`to_stage\` text,
    \`transition_date\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_stage_history_parent_idx\` ON \`sales_leads_stage_history\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_stage_history_order_idx\` ON \`sales_leads_stage_history\` (\`_order\`);`)

  // Services select (hasMany stored as separate table in Payload v3 SQLite)
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`sales_leads_services\` (
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`value\` text,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_services_parent_idx\` ON \`sales_leads_services\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_services_order_idx\` ON \`sales_leads_services\` (\`order\`);`)

  // Add sales_leads_id to payload_locked_documents_rels for Payload's document locking
  try { await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`sales_leads_id\` integer;`) } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`sales_leads_services\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`sales_leads_stage_history\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`sales_leads\`;`)
}
