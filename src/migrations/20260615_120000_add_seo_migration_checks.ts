import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`seo_migration_checks\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`client_id\` integer,
    \`site_url\` text,
    \`cutover_date\` text,
    \`is_domain_move\` integer DEFAULT false,
    \`status\` text DEFAULT 'pending',
    \`overall_score\` numeric,
    \`run_at\` text,
    \`error\` text,
    \`scores_by_phase\` text,
    \`checklist\` text,
    \`redirects\` text,
    \`performance\` text,
    \`actions\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`seo_migration_checks_client_idx\` ON \`seo_migration_checks\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`seo_migration_checks_status_idx\` ON \`seo_migration_checks\` (\`status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`seo_migration_checks_created_at_idx\` ON \`seo_migration_checks\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`seo_migration_checks_updated_at_idx\` ON \`seo_migration_checks\` (\`updated_at\`);`)

  // Required for Payload's document locking system
  try { await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`seo_migration_checks_id\` integer;`) } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`seo_migration_checks\`;`)
}
