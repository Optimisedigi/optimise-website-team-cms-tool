import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`gsc_indexing_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer,
    \`status\` text DEFAULT 'discovering',
    \`total_urls\` numeric DEFAULT 0,
    \`inspected_count\` numeric DEFAULT 0,
    \`started_at\` text,
    \`completed_at\` text,
    \`last_batch_date\` text,
    \`error\` text,
    \`summary_stats\` text,
    \`url_sources\` text,
    \`discovered_urls\` text,
    \`inspection_results\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`gsc_indexing_audits_client_idx\` ON \`gsc_indexing_audits\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`gsc_indexing_audits_status_idx\` ON \`gsc_indexing_audits\` (\`status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`gsc_indexing_audits_created_at_idx\` ON \`gsc_indexing_audits\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`gsc_indexing_audits_updated_at_idx\` ON \`gsc_indexing_audits\` (\`updated_at\`);`)

  // Required for Payload's document locking system
  try { await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`gsc_indexing_audits_id\` integer;`) } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`gsc_indexing_audits\`;`)
}
