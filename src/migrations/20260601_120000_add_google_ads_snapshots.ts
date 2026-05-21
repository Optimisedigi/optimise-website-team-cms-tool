import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── google_ads_snapshots main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`google_ads_snapshots\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`level\` text NOT NULL,
    \`captured_at\` text NOT NULL,
    \`date_range_label\` text,
    \`date_range_start\` text,
    \`date_range_end\` text,
    \`customer_id\` text NOT NULL,
    \`row_count\` numeric,
    \`rows\` text,
    \`source_endpoint\` text,
    \`fetch_duration_ms\` numeric,
    \`error\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_snapshots_client_idx\` ON \`google_ads_snapshots\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_snapshots_level_idx\` ON \`google_ads_snapshots\` (\`level\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_snapshots_captured_at_idx\` ON \`google_ads_snapshots\` (\`captured_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_snapshots_created_at_idx\` ON \`google_ads_snapshots\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_snapshots_updated_at_idx\` ON \`google_ads_snapshots\` (\`updated_at\`);`)
  // One row per (client, level) — daily cron upserts on this unique key.
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`google_ads_snapshots_client_level_unq\` ON \`google_ads_snapshots\` (\`client_id\`, \`level\`);`)

  // ── Add google_ads_snapshots_id to payload_locked_documents_rels ──
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_snapshots_id\` integer REFERENCES \`google_ads_snapshots\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }
  try {
    await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`payload_locked_documents_rels_google_ads_snapshots_id_idx\` ON \`payload_locked_documents_rels\` (\`google_ads_snapshots_id\`);`))
  } catch { /* index may already exist */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`google_ads_snapshots_client_level_unq\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`google_ads_snapshots_updated_at_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`google_ads_snapshots_created_at_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`google_ads_snapshots_captured_at_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`google_ads_snapshots_level_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`google_ads_snapshots_client_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`payload_locked_documents_rels_google_ads_snapshots_id_idx\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_snapshots\`;`)
  // SQLite DROP COLUMN support varies — safe to leave the locked_docs_rels column.
}
