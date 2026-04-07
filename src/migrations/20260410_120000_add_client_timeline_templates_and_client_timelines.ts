import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── client_timeline_templates main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_timeline_templates\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`slug\` text NOT NULL,
    \`service_type\` text NOT NULL,
    \`duration_days\` integer NOT NULL DEFAULT 90,
    \`description\` text,
    \`is_default\` integer DEFAULT false,
    \`is_active\` integer DEFAULT true,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`);

  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS \`client_timeline_templates_slug_idx\` ON \`client_timeline_templates\` (\`slug\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timeline_templates_created_at_idx\` ON \`client_timeline_templates\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timeline_templates_updated_at_idx\` ON \`client_timeline_templates\` (\`updated_at\`);`,
  );

  // ── client_timeline_templates_phases array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_timeline_templates_phases\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`phase_name\` text NOT NULL,
    \`phase_order\` numeric NOT NULL,
    \`week_range\` text,
    \`phase_description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_timeline_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timeline_templates_phases_order_idx\` ON \`client_timeline_templates_phases\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timeline_templates_phases_parent_idx\` ON \`client_timeline_templates_phases\` (\`_parent_id\`);`,
  );

  // ── client_timeline_templates_phases_items nested array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_timeline_templates_phases_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`item_name\` text NOT NULL,
    \`item_order\` numeric NOT NULL,
    \`item_description\` text,
    \`requires_approval\` integer DEFAULT false,
    \`internal_notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_timeline_templates_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timeline_templates_phases_items_order_idx\` ON \`client_timeline_templates_phases_items\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timeline_templates_phases_items_parent_idx\` ON \`client_timeline_templates_phases_items\` (\`_parent_id\`);`,
  );

  // ── client_timelines main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_timelines\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`client_id\` integer NOT NULL,
    \`template_id\` integer,
    \`service_type\` text NOT NULL,
    \`overall_status\` text DEFAULT 'not_started' NOT NULL,
    \`start_date\` text,
    \`end_date\` text,
    \`notes\` text,
    \`last_shared_at\` text,
    \`shared_count\` integer DEFAULT 0,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_client_idx\` ON \`client_timelines\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_template_idx\` ON \`client_timelines\` (\`template_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_overall_status_idx\` ON \`client_timelines\` (\`overall_status\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_created_at_idx\` ON \`client_timelines\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_updated_at_idx\` ON \`client_timelines\` (\`updated_at\`);`,
  );

  // ── client_timelines_phases array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_timelines_phases\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`phase_name\` text NOT NULL,
    \`phase_order\` numeric NOT NULL,
    \`week_range\` text,
    \`phase_description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_timelines\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_phases_order_idx\` ON \`client_timelines_phases\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_phases_parent_idx\` ON \`client_timelines_phases\` (\`_parent_id\`);`,
  );

  // ── client_timelines_phases_items nested array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_timelines_phases_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`item_name\` text NOT NULL,
    \`item_order\` numeric NOT NULL,
    \`item_description\` text,
    \`item_status\` text DEFAULT 'not_started',
    \`completed_at\` text,
    \`completed_by_id\` integer,
    \`requires_approval\` integer DEFAULT false,
    \`approval_status\` text DEFAULT 'not_needed',
    \`client_approved_at\` text,
    \`internal_notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_timelines_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`completed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_phases_items_order_idx\` ON \`client_timelines_phases_items\` (\`_order\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_timelines_phases_items_parent_idx\` ON \`client_timelines_phases_items\` (\`_parent_id\`);`,
  );

  // ── Add FK columns to payload_locked_documents_rels ──
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`client_timeline_templates_id\` integer REFERENCES \`client_timeline_templates\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch { /* column may already exist */ }

  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`client_timelines_id\` integer REFERENCES \`client_timelines\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch { /* column may already exist */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(
    sql`DROP TABLE IF EXISTS \`client_timelines_phases_items\`;`,
  );
  await db.run(sql`DROP TABLE IF EXISTS \`client_timelines_phases\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`client_timelines\`;`);
  await db.run(
    sql`DROP TABLE IF EXISTS \`client_timeline_templates_phases_items\`;`,
  );
  await db.run(
    sql`DROP TABLE IF EXISTS \`client_timeline_templates_phases\`;`,
  );
  await db.run(sql`DROP TABLE IF EXISTS \`client_timeline_templates\`;`);
}
