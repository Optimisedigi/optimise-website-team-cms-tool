import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── negative_keyword_monthly_waste_relevancy_cache table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`negative_keyword_monthly_waste_relevancy_cache\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`year_month\` text NOT NULL,
    \`total_spend\` numeric DEFAULT 0 NOT NULL,
    \`non_converting_spend\` numeric DEFAULT 0 NOT NULL,
    \`irrelevant_spend\` numeric DEFAULT 0 NOT NULL,
    \`is_final\` integer DEFAULT 0,
    \`fetched_at\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`waste_relevancy_cache_unique_idx\` ON \`negative_keyword_monthly_waste_relevancy_cache\` (\`client_id\`, \`year_month\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`waste_relevancy_cache_client_idx\` ON \`negative_keyword_monthly_waste_relevancy_cache\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`waste_relevancy_cache_year_month_idx\` ON \`negative_keyword_monthly_waste_relevancy_cache\` (\`year_month\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`waste_relevancy_cache_created_at_idx\` ON \`negative_keyword_monthly_waste_relevancy_cache\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`waste_relevancy_cache_updated_at_idx\` ON \`negative_keyword_monthly_waste_relevancy_cache\` (\`updated_at\`);`)

  // ── locked_docs_rels FK column ──
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`negative_keyword_monthly_waste_relevancy_cache_id\` integer REFERENCES \`negative_keyword_monthly_waste_relevancy_cache\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`negative_keyword_monthly_waste_relevancy_cache\`;`)
  // SQLite DROP COLUMN support varies; safe to leave the locked_docs_rels
  // column in place if rolling back.
}
