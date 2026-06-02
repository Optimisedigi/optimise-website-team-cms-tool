import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds the `clients_services` sub-table for the new `services` hasMany select
 * on the Clients collection (Business tab). Drives the service pills shown in
 * the client edit header (ClientRecordHeader).
 *
 * Mirrors Payload's hasMany-select table shape (see `sales_leads_services`):
 *  - `order` / `parent_id` columns (NO underscore prefix — selects differ from
 *    array sub-tables which use `_order` / `_parent_id`)
 *  - `value` text column holding the selected enum value
 *  - text PRIMARY KEY for the row id
 *  - FK to clients(id) ON DELETE CASCADE
 *
 * No payload_locked_documents_rels FK is needed — select sub-tables don't get
 * their own locked-docs entry (only top-level collections do).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_services\` (
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`value\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_services_order_idx\` ON \`clients_services\` (\`order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_services_parent_id_idx\` ON \`clients_services\` (\`parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`clients_services\`;`)
}
