import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Undo 20260518_120000_fix_sales_leads_array_id_types for sales_leads_services.
 *
 * That migration rebuilt `sales_leads_services` with `id text PRIMARY KEY NOT NULL`
 * on the premise that Payload stores hasMany select row IDs as text. It does
 * not: text IDs belong to **array** field tables (e.g. stage_history). A hasMany
 * **select** side table is built with `order` / `parent_id` / `value` and an
 * `id` that the shared table builder types as `integer PRIMARY KEY`, so inserts
 * omit `id` and depend on SQLite's rowid alias to fill it. Against a text
 * primary key that wrote NULL, and every attempt to save a sales lead with
 * services selected failed with `NOT NULL constraint failed: sales_leads_services.id`.
 *
 * `id` is a synthetic surrogate here; only `order`, `parent_id` and `value`
 * carry meaning, so the copy omits `id` and lets the rows renumber.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const info = await db.run(sql`PRAGMA table_info(\`sales_leads_services\`);`)
  const rows = ((info as { rows?: Array<Record<string, unknown>> }).rows ?? [])
  const idCol = rows.find((row) => row.name === 'id')
  if (!idCol || String(idCol.type).toLowerCase() === 'integer') {
    return
  }

  await db.run(sql`DROP TABLE IF EXISTS \`sales_leads_services__idfix\`;`)

  await db.run(sql`CREATE TABLE \`sales_leads_services__idfix\` (
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`value\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`INSERT INTO \`sales_leads_services__idfix\` (\`order\`, \`parent_id\`, \`value\`)
    SELECT \`order\`, \`parent_id\`, \`value\` FROM \`sales_leads_services\`;`)

  await db.run(sql`DROP TABLE \`sales_leads_services\`;`)
  await db.run(sql`ALTER TABLE \`sales_leads_services__idfix\` RENAME TO \`sales_leads_services\`;`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_services_parent_idx\` ON \`sales_leads_services\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_services_order_idx\` ON \`sales_leads_services\` (\`order\`);`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op: the text-id shape this reverts to could not accept inserts.
}
