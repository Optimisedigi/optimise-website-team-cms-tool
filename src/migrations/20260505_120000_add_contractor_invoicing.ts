import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── contractors ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`contractors\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`email\` text,
    \`hourly_rate\` numeric DEFAULT 20.5 NOT NULL,
    \`currency\` text DEFAULT 'AUD' NOT NULL,
    \`default_weekly_hours\` numeric DEFAULT 16,
    \`chat_gpt_reimbursement_per_fortnight\` numeric DEFAULT 31.83,
    \`transfer_fee_default\` numeric DEFAULT 4,
    \`transfer_reference_template\` text DEFAULT '{startShort}-{endShort} Optimise',
    \`fortnight_anchor_date\` text,
    \`is_active\` integer DEFAULT 1,
    \`portal_token\` text,
    \`notes\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`contractors_portal_token_idx\` ON \`contractors\` (\`portal_token\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contractors_is_active_idx\` ON \`contractors\` (\`is_active\`);`)

  // ── contractor_payments ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`contractor_payments\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`contractor_id\` integer NOT NULL,
    \`fortnight_start_date\` text NOT NULL,
    \`fortnight_end_date\` text,
    \`total_hours\` numeric,
    \`subtotal\` numeric,
    \`chat_gpt_reimbursement\` numeric,
    \`transfer_fee\` numeric,
    \`transfer_amount\` numeric,
    \`transfer_reference\` text,
    \`status\` text DEFAULT 'scheduled' NOT NULL,
    \`payment_date\` text,
    \`sent_at\` text,
    \`notes\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`contractor_id\`) REFERENCES \`contractors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contractor_payments_contractor_idx\` ON \`contractor_payments\` (\`contractor_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contractor_payments_fortnight_start_idx\` ON \`contractor_payments\` (\`fortnight_start_date\`);`)

  // ── contractor_time_entries ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`contractor_time_entries\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`contractor_id\` integer NOT NULL,
    \`week_commencing\` text NOT NULL,
    \`hours\` numeric DEFAULT 0 NOT NULL,
    \`status\` text DEFAULT 'draft' NOT NULL,
    \`hourly_rate_snapshot\` numeric,
    \`total_fee\` numeric,
    \`payment_id\` integer,
    \`submitted_at\` text,
    \`approved_at\` text,
    \`paid_at\` text,
    \`notes\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`contractor_id\`) REFERENCES \`contractors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`payment_id\`) REFERENCES \`contractor_payments\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contractor_time_entries_contractor_idx\` ON \`contractor_time_entries\` (\`contractor_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contractor_time_entries_week_commencing_idx\` ON \`contractor_time_entries\` (\`week_commencing\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contractor_time_entries_status_idx\` ON \`contractor_time_entries\` (\`status\`);`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`contractor_time_entries_unique_week\` ON \`contractor_time_entries\` (\`contractor_id\`, \`week_commencing\`);`)

  // ── locked_docs_rels FK columns ──
  for (const col of [
    "contractors_id",
    "contractor_payments_id",
    "contractor_time_entries_id",
  ]) {
    try {
      const fkTable = col.replace(/_id$/, "");
      await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`${col}\` integer REFERENCES \`${fkTable}\`(\`id\`) ON DELETE CASCADE;`))
    } catch { /* column may already exist */ }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`contractor_time_entries\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`contractor_payments\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`contractors\`;`)
}
