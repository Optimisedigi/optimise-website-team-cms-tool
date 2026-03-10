import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── process_templates main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`process_templates\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`slug\` text NOT NULL,
    \`retainer_type\` text NOT NULL,
    \`description\` text,
    \`is_default\` integer DEFAULT false,
    \`is_active\` integer DEFAULT true,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`process_templates_slug_idx\` ON \`process_templates\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`process_templates_created_at_idx\` ON \`process_templates\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`process_templates_updated_at_idx\` ON \`process_templates\` (\`updated_at\`);`)

  // ── process_templates_phases array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`process_templates_phases\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`phase_name\` text NOT NULL,
    \`phase_order\` numeric NOT NULL,
    \`phase_description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`process_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`process_templates_phases_order_idx\` ON \`process_templates_phases\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`process_templates_phases_parent_idx\` ON \`process_templates_phases\` (\`_parent_id\`);`)

  // ── process_templates_phases_steps nested array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`process_templates_phases_steps\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`step_name\` text NOT NULL,
    \`step_order\` numeric NOT NULL,
    \`step_description\` text,
    \`step_type\` text,
    \`is_automatable\` integer DEFAULT false,
    \`automation_notes\` text,
    \`default_assignee\` text,
    \`estimated_duration\` text,
    \`email_template_subject\` text,
    \`email_template_body\` text,
    \`reminder_days\` numeric,
    \`required_before_next\` integer DEFAULT false,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`process_templates_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`process_templates_phases_steps_order_idx\` ON \`process_templates_phases_steps\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`process_templates_phases_steps_parent_idx\` ON \`process_templates_phases_steps\` (\`_parent_id\`);`)

  // ── client_processes main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_processes\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`process_title\` text NOT NULL,
    \`template_id\` integer,
    \`retainer_type\` text,
    \`client_id\` integer,
    \`sales_lead_id\` integer,
    \`proposal_id\` integer,
    \`assigned_to_id\` integer,
    \`overall_status\` text DEFAULT 'not_started' NOT NULL,
    \`started_at\` text,
    \`completed_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`template_id\`) REFERENCES \`process_templates\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`sales_lead_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`assigned_to_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_template_idx\` ON \`client_processes\` (\`template_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_client_idx\` ON \`client_processes\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_sales_lead_idx\` ON \`client_processes\` (\`sales_lead_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_proposal_idx\` ON \`client_processes\` (\`proposal_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_assigned_to_idx\` ON \`client_processes\` (\`assigned_to_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_overall_status_idx\` ON \`client_processes\` (\`overall_status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_created_at_idx\` ON \`client_processes\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_updated_at_idx\` ON \`client_processes\` (\`updated_at\`);`)

  // ── client_processes_phases array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_processes_phases\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`phase_name\` text NOT NULL,
    \`phase_order\` numeric NOT NULL,
    \`phase_description\` text,
    \`phase_status\` text DEFAULT 'not_started',
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_processes\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_phases_order_idx\` ON \`client_processes_phases\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_phases_parent_idx\` ON \`client_processes_phases\` (\`_parent_id\`);`)

  // ── client_processes_phases_steps nested array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_processes_phases_steps\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`step_name\` text NOT NULL,
    \`step_order\` numeric NOT NULL,
    \`step_description\` text,
    \`step_type\` text,
    \`step_status\` text DEFAULT 'not_started',
    \`completed_at\` text,
    \`default_assignee\` text,
    \`estimated_duration\` text,
    \`is_automatable\` integer DEFAULT false,
    \`automation_notes\` text,
    \`email_template_subject\` text,
    \`email_template_body\` text,
    \`reminder_days\` numeric,
    \`required_before_next\` integer DEFAULT false,
    \`notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_processes_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_phases_steps_order_idx\` ON \`client_processes_phases_steps\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_phases_steps_parent_idx\` ON \`client_processes_phases_steps\` (\`_parent_id\`);`)

  // ── client_processes_timeline array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_processes_timeline\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`action\` text NOT NULL,
    \`performed_at\` text NOT NULL,
    \`performed_by_id\` integer,
    \`notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_processes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`performed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_timeline_order_idx\` ON \`client_processes_timeline\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_processes_timeline_parent_idx\` ON \`client_processes_timeline\` (\`_parent_id\`);`)

  // ── Add FK columns to payload_locked_documents_rels ──
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`process_templates_id\` integer REFERENCES \`process_templates\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }

  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`client_processes_id\` integer REFERENCES \`client_processes\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`client_processes_timeline\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`client_processes_phases_steps\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`client_processes_phases\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`client_processes\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`process_templates_phases_steps\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`process_templates_phases\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`process_templates\`;`)
}
