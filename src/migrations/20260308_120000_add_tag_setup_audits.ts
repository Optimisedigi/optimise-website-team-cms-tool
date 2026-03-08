import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── Main tag_setup_audits table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`tag_setup_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer,
    \`url\` text NOT NULL,
    \`status\` text DEFAULT 'pending',
    \`can_auto_fix\` integer DEFAULT false,
    \`auto_fix_applied\` integer DEFAULT false,
    \`summary_gtm_loaded\` integer DEFAULT false,
    \`summary_ga4_configured\` integer DEFAULT false,
    \`summary_events_detected\` numeric DEFAULT 0,
    \`summary_issues_count\` numeric DEFAULT 0,
    \`summary_gtm_container_ids\` text,
    \`summary_measurement_ids\` text,
    \`summary_consent_mode_detected\` integer DEFAULT false,
    \`missing_events\` text,
    \`data_layer_events\` text,
    \`raw_result\` text,
    \`error\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`tag_setup_audits_client_idx\` ON \`tag_setup_audits\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`tag_setup_audits_status_idx\` ON \`tag_setup_audits\` (\`status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`tag_setup_audits_created_at_idx\` ON \`tag_setup_audits\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`tag_setup_audits_updated_at_idx\` ON \`tag_setup_audits\` (\`updated_at\`);`)

  // ── Issues array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`tag_setup_audits_issues\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`severity\` text NOT NULL,
    \`category\` text NOT NULL,
    \`auto_fixable\` integer DEFAULT false,
    \`fixed\` integer DEFAULT false,
    \`message\` text NOT NULL,
    \`fix\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`tag_setup_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`tag_setup_audits_issues_order_idx\` ON \`tag_setup_audits_issues\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`tag_setup_audits_issues_parent_idx\` ON \`tag_setup_audits_issues\` (\`_parent_id\`);`)

  // ── Events array table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`tag_setup_audits_events\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text,
    \`measurement_id\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`tag_setup_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`tag_setup_audits_events_order_idx\` ON \`tag_setup_audits_events\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`tag_setup_audits_events_parent_idx\` ON \`tag_setup_audits_events\` (\`_parent_id\`);`)

  // ── Add tag_setup_audits_id to payload_locked_documents_rels ──
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`tag_setup_audits_id\` integer REFERENCES \`tag_setup_audits\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }

  // ── Add tracking fields to clients table ──
  const clientColumns = [
    { name: 'ga4_measurement_id', type: 'text' },
    { name: 'gtm_container_id', type: 'text' },
    { name: 'expected_events', type: 'text' },
  ]

  for (const col of clientColumns) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`clients\` ADD \`${col.name}\` ${col.type};`))
    } catch { /* column may already exist */ }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`tag_setup_audits_events\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`tag_setup_audits_issues\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`tag_setup_audits\`;`)

  // SQLite doesn't support DROP COLUMN in all versions, so we skip reverting client columns
}
