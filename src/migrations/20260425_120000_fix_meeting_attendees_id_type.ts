import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // The original meeting_schedulers_attendees migration created `id` as
  // INTEGER PRIMARY KEY, but Payload v3 generates 24-char hex string IDs
  // for array sub-rows, causing SQLITE_MISMATCH on every save.
  //
  // SQLite can't ALTER COLUMN type, so we rebuild the table.

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`meeting_schedulers_attendees_new\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`email\` text NOT NULL,
    \`token\` text,
    \`responded\` integer DEFAULT 0,
    \`responded_at\` text,
    \`email_sent_at\` text,
    \`selected_slots\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`meeting_schedulers\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  // Copy any existing rows (cast integer id to text)
  try {
    await db.run(sql`INSERT INTO \`meeting_schedulers_attendees_new\`
      (\`_order\`, \`_parent_id\`, \`id\`, \`name\`, \`email\`, \`token\`, \`responded\`, \`responded_at\`, \`email_sent_at\`, \`selected_slots\`)
      SELECT \`_order\`, \`_parent_id\`, CAST(\`id\` AS text), \`name\`, \`email\`, \`token\`, \`responded\`, \`responded_at\`, \`email_sent_at\`, \`selected_slots\`
      FROM \`meeting_schedulers_attendees\`;`)
  } catch { /* old table missing or empty */ }

  await db.run(sql`DROP TABLE IF EXISTS \`meeting_schedulers_attendees\`;`)
  await db.run(sql`ALTER TABLE \`meeting_schedulers_attendees_new\` RENAME TO \`meeting_schedulers_attendees\`;`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`meeting_schedulers_attendees_order_idx\` ON \`meeting_schedulers_attendees\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`meeting_schedulers_attendees_parent_idx\` ON \`meeting_schedulers_attendees\` (\`_parent_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`meeting_schedulers_attendees_token_idx\` ON \`meeting_schedulers_attendees\` (\`token\`);`)
}

export async function down({ _db }: MigrateDownArgs & { _db?: any }): Promise<void> {
  // No-op (irreversible — would lose string IDs)
}
