import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Undo 20260618_140000_fix_clients_services_id_type.
 *
 * That migration rebuilt `clients_services` with `id text PRIMARY KEY NOT NULL`
 * on the premise that Payload stores hasMany select row IDs as text. It does
 * not: text IDs belong to **array** field tables. A hasMany **select** side
 * table is built with `order` / `parent_id` / `value` and an `id` that the
 * shared table builder types as `integer PRIMARY KEY` (@payloadcms/drizzle
 * `setColumnID`), so inserts omit `id` and depend on SQLite's rowid alias to
 * fill it. Against a text primary key that wrote NULL, and every attempt to
 * save a client with a service selected failed with
 * `NOT NULL constraint failed: clients_services.id` — surfaced in the admin as
 * "Something went wrong."
 *
 * `id` is a synthetic surrogate here; only `order`, `parent_id` and `value`
 * carry meaning, so the copy omits `id` and lets the rows renumber. That also
 * avoids the collision from casting existing text IDs, which would all land
 * on 0.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const info = await db.run(sql`PRAGMA table_info(\`clients_services\`);`)
  const rows = ((info as { rows?: Array<Record<string, unknown>> }).rows ?? [])
  const idCol = rows.find((row) => row.name === 'id')
  // Already the correct shape (or table absent): nothing to rebuild.
  if (!idCol || String(idCol.type).toLowerCase() === 'integer') {
    return
  }

  // Retry safety: a scratch table stranded by a half-finished earlier run would
  // fail this CREATE forever, permanently blocking the fix.
  await db.run(sql`DROP TABLE IF EXISTS \`clients_services__idfix\`;`)

  await db.run(sql`CREATE TABLE \`clients_services__idfix\` (
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`value\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`INSERT INTO \`clients_services__idfix\` (\`order\`, \`parent_id\`, \`value\`)
    SELECT \`order\`, \`parent_id\`, \`value\` FROM \`clients_services\`;`)

  await db.run(sql`DROP TABLE \`clients_services\`;`)
  await db.run(sql`ALTER TABLE \`clients_services__idfix\` RENAME TO \`clients_services\`;`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_services_order_idx\` ON \`clients_services\` (\`order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_services_parent_id_idx\` ON \`clients_services\` (\`parent_id\`);`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op: the text-id shape this reverts to could not accept inserts.
}
