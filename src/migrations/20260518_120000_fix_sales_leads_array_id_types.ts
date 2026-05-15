import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * The original sales_leads migration created the `id` column on
 * `sales_leads_stage_history` and `sales_leads_services` as INTEGER PRIMARY KEY,
 * but Payload v3 generates 24-char hex string IDs for array sub-rows, causing
 * SQLITE_MISMATCH ("datatype mismatch") on every save that touches those arrays.
 *
 * SQLite can't ALTER COLUMN type, so we rebuild each table with `text PRIMARY KEY`
 * and copy existing rows across (CAST integer ids to text).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── sales_leads_stage_history ──────────────────────────────────────────────
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`sales_leads_stage_history_new\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`from_stage\` text,
    \`to_stage\` text,
    \`transition_date\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  try {
    await db.run(sql`INSERT INTO \`sales_leads_stage_history_new\`
      (\`_order\`, \`_parent_id\`, \`id\`, \`from_stage\`, \`to_stage\`, \`transition_date\`)
      SELECT \`_order\`, \`_parent_id\`, CAST(\`id\` AS text), \`from_stage\`, \`to_stage\`, \`transition_date\`
      FROM \`sales_leads_stage_history\`;`)
  } catch { /* old table missing or empty */ }

  await db.run(sql`DROP TABLE IF EXISTS \`sales_leads_stage_history\`;`)
  await db.run(sql`ALTER TABLE \`sales_leads_stage_history_new\` RENAME TO \`sales_leads_stage_history\`;`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_stage_history_parent_idx\` ON \`sales_leads_stage_history\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_stage_history_order_idx\` ON \`sales_leads_stage_history\` (\`_order\`);`)

  // ── sales_leads_services ───────────────────────────────────────────────────
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`sales_leads_services_new\` (
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`value\` text,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  try {
    await db.run(sql`INSERT INTO \`sales_leads_services_new\`
      (\`order\`, \`parent_id\`, \`id\`, \`value\`)
      SELECT \`order\`, \`parent_id\`, CAST(\`id\` AS text), \`value\`
      FROM \`sales_leads_services\`;`)
  } catch { /* old table missing or empty */ }

  await db.run(sql`DROP TABLE IF EXISTS \`sales_leads_services\`;`)
  await db.run(sql`ALTER TABLE \`sales_leads_services_new\` RENAME TO \`sales_leads_services\`;`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_services_parent_idx\` ON \`sales_leads_services\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`sales_leads_services_order_idx\` ON \`sales_leads_services\` (\`order\`);`)
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op (irreversible — would lose string IDs)
}
