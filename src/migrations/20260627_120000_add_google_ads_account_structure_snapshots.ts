import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`google_ads_account_structure_snapshots\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`client_slug\` text NOT NULL,
      \`customer_id\` text NOT NULL,
      \`captured_at\` text NOT NULL,
      \`date_range_start\` text,
      \`date_range_end\` text,
      \`source\` text DEFAULT 'cron' NOT NULL,
      \`payload\` text NOT NULL,
      \`error\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE CASCADE
    )
  `))

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`google_ads_account_structure_snapshots_client_idx\` ON \`google_ads_account_structure_snapshots\` (\`client_id\`)`))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`google_ads_account_structure_snapshots_client_slug_idx\` ON \`google_ads_account_structure_snapshots\` (\`client_slug\`)`))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`google_ads_account_structure_snapshots_customer_id_idx\` ON \`google_ads_account_structure_snapshots\` (\`customer_id\`)`))
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`google_ads_account_structure_snapshots_captured_at_idx\` ON \`google_ads_account_structure_snapshots\` (\`captured_at\`)`))

  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_account_structure_snapshots_id\` integer`))
  } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw(`DROP TABLE IF EXISTS \`google_ads_account_structure_snapshots\``))
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`google_ads_account_structure_snapshots_id\``))
  } catch { /* doesn't exist */ }
}
