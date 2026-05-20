import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds the `clients_additional_contacts` sub-table for the new `additionalContacts`
 * array on the Clients collection (Business tab).
 *
 * Mirrors the pattern of `clients_account_managers`:
 *  - text PRIMARY KEY for the row id (Payload generates a uuid)
 *  - _order / _parent_id columns
 *  - FK to clients(id) ON DELETE CASCADE
 *
 * No payload_locked_documents_rels FK is needed — array sub-tables don't get
 * their own locked-docs entry (only top-level collections do).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_additional_contacts\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`email\` text NOT NULL,
    \`job_title\` text,
    \`responsibilities\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_additional_contacts_order_idx\` ON \`clients_additional_contacts\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_additional_contacts_parent_id_idx\` ON \`clients_additional_contacts\` (\`_parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`clients_additional_contacts\`;`)
}
