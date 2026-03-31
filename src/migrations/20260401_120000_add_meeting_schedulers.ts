import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Main meeting_schedulers table
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`meeting_schedulers\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`client_id\` integer,
    \`meeting_topic\` text,
    \`duration_minutes\` text DEFAULT '30',
    \`date_range_start\` text,
    \`date_range_end\` text,
    \`business_hours_start\` text DEFAULT '09:00',
    \`business_hours_end\` text DEFAULT '17:00',
    \`timezone\` text DEFAULT 'Australia/Sydney',
    \`slot_interval_minutes\` numeric DEFAULT 30,
    \`generated_slots\` text,
    \`slots_generated_at\` text,
    \`matched_slot\` text,
    \`google_event_id\` text,
    \`google_event_link\` text,
    \`status\` text DEFAULT 'draft',
    \`slug\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  // Attendees array sub-table
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`meeting_schedulers_attendees\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`email\` text NOT NULL,
    \`token\` text,
    \`responded\` integer DEFAULT 0,
    \`responded_at\` text,
    \`email_sent_at\` text,
    \`selected_slots\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`meeting_schedulers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  // Calendar auth global table
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`calendar_auth\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`refresh_token\` text,
    \`connected_email\` text,
    \`connected_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)

  // Indexes
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`meeting_schedulers_slug_idx\` ON \`meeting_schedulers\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`meeting_schedulers_status_idx\` ON \`meeting_schedulers\` (\`status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`meeting_schedulers_client_idx\` ON \`meeting_schedulers\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`meeting_schedulers_created_at_idx\` ON \`meeting_schedulers\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`meeting_schedulers_updated_at_idx\` ON \`meeting_schedulers\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`meeting_schedulers_attendees_order_idx\` ON \`meeting_schedulers_attendees\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`meeting_schedulers_attendees_parent_idx\` ON \`meeting_schedulers_attendees\` (\`_parent_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`meeting_schedulers_attendees_token_idx\` ON \`meeting_schedulers_attendees\` (\`token\`);`)

  // Required for Payload's document locking system
  try { await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`meeting_schedulers_id\` integer;`) } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`meeting_schedulers_attendees\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`meeting_schedulers\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`calendar_auth\`;`)
}
