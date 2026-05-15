import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Aggregated outstanding-invoice statement drafts.
 *
 * Adds:
 *  - `invoice_statement_drafts` table.
 *  - `payload_locked_documents_rels.invoice_statement_drafts_id` FK column.
 *
 * All ALTER TABLE adds are wrapped in try/catch because SQLite has no
 * IF NOT EXISTS for ADD COLUMN.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`invoice_statement_drafts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`generated_at\` text NOT NULL,
    \`xero_contact_id\` text NOT NULL,
    \`contact_name\` text NOT NULL,
    \`recipient_email\` text DEFAULT '' NOT NULL,
    \`client_id\` integer,
    \`total_outstanding\` numeric DEFAULT 0 NOT NULL,
    \`total_overdue\` numeric DEFAULT 0 NOT NULL,
    \`unpaid_count\` numeric DEFAULT 0 NOT NULL,
    \`overdue_count\` numeric DEFAULT 0 NOT NULL,
    \`snapshot\` text NOT NULL,
    \`custom_message\` text,
    \`reviewed_by_id\` integer,
    \`reviewed_at\` text,
    \`sent_at\` text,
    \`postmark_message_id\` text,
    \`cc_list\` text,
    \`send_error\` text,
    \`rejection_reason\` text,
    \`last_refreshed_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`reviewed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`invoice_statement_drafts_status_idx\` ON \`invoice_statement_drafts\` (\`status\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`invoice_statement_drafts_generated_at_idx\` ON \`invoice_statement_drafts\` (\`generated_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`invoice_statement_drafts_xero_contact_id_idx\` ON \`invoice_statement_drafts\` (\`xero_contact_id\`);`,
  );

  // payload_locked_documents_rels FK column.
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`invoice_statement_drafts_id\` integer REFERENCES \`invoice_statement_drafts\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`invoice_statement_drafts\`;`);
}
