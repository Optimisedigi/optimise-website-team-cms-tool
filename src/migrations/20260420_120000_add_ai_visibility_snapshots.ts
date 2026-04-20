import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── ai_visibility_snapshots main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`ai_visibility_snapshots\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`client_name\` text,
    \`property_id\` text NOT NULL,
    \`period_start\` text NOT NULL,
    \`period_end\` text NOT NULL,
    \`total_sessions\` numeric NOT NULL,
    \`total_users\` numeric NOT NULL,
    \`total_conversions\` numeric NOT NULL,
    \`conversion_value\` numeric DEFAULT 0,
    \`engaged_sessions\` numeric DEFAULT 0,
    \`avg_engagement_time\` numeric DEFAULT 0,
    \`by_source\` text,
    \`share_by_source\` text,
    \`fetched_at\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`ai_visibility_snapshots_client_idx\` ON \`ai_visibility_snapshots\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`ai_visibility_snapshots_period_end_idx\` ON \`ai_visibility_snapshots\` (\`period_end\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`ai_visibility_snapshots_client_period_end_idx\` ON \`ai_visibility_snapshots\` (\`client_id\`, \`period_end\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`ai_visibility_snapshots_created_at_idx\` ON \`ai_visibility_snapshots\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`ai_visibility_snapshots_updated_at_idx\` ON \`ai_visibility_snapshots\` (\`updated_at\`);`)

  // ── Add ai_visibility_snapshots_id to payload_locked_documents_rels ──
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`ai_visibility_snapshots_id\` integer REFERENCES \`ai_visibility_snapshots\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`ai_visibility_snapshots\`;`)
  // SQLite DROP COLUMN support varies — safe to leave the locked_docs_rels column.
}
