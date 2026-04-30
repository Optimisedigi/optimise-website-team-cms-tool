import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── negative_keyword_avoided_spend_cache main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`negative_keyword_avoided_spend_cache\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`keyword\` text NOT NULL,
    \`match_type\` text NOT NULL,
    \`year_month\` text NOT NULL,
    \`spend\` numeric DEFAULT 0 NOT NULL,
    \`is_final\` integer DEFAULT 0,
    \`fetched_at\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`avoided_spend_cache_unique_idx\` ON \`negative_keyword_avoided_spend_cache\` (\`client_id\`, \`keyword\`, \`match_type\`, \`year_month\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`avoided_spend_cache_client_month_idx\` ON \`negative_keyword_avoided_spend_cache\` (\`client_id\`, \`year_month\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`avoided_spend_cache_client_idx\` ON \`negative_keyword_avoided_spend_cache\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`avoided_spend_cache_keyword_idx\` ON \`negative_keyword_avoided_spend_cache\` (\`keyword\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`avoided_spend_cache_year_month_idx\` ON \`negative_keyword_avoided_spend_cache\` (\`year_month\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`avoided_spend_cache_created_at_idx\` ON \`negative_keyword_avoided_spend_cache\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`avoided_spend_cache_updated_at_idx\` ON \`negative_keyword_avoided_spend_cache\` (\`updated_at\`);`)

  // ── locked_docs_rels FK column ──
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`negative_keyword_avoided_spend_cache_id\` integer REFERENCES \`negative_keyword_avoided_spend_cache\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }

  // ── negated_at sub-field on negative_keyword_lists.keywords ──
  try {
    await db.run(sql.raw(`ALTER TABLE \`negative_keyword_lists_keywords\` ADD COLUMN \`negated_at\` text;`))
  } catch { /* column may already exist */ }

  // Backfill: for any existing keyword sub-record without a negated_at,
  // copy the parent list's created_at so historical entries get an honest
  // "this is when we know the keyword was negated by" timestamp.
  try {
    await db.run(sql.raw(`UPDATE \`negative_keyword_lists_keywords\`
      SET \`negated_at\` = (
        SELECT \`created_at\` FROM \`negative_keyword_lists\`
        WHERE \`negative_keyword_lists\`.\`id\` = \`negative_keyword_lists_keywords\`.\`_parent_id\`
      )
      WHERE \`negated_at\` IS NULL;`))
  } catch { /* ignore — table may not exist yet on a fresh install */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`negative_keyword_avoided_spend_cache\`;`)
  // SQLite DROP COLUMN support varies; safe to leave the locked_docs_rels
  // column and the negated_at sub-column in place if rolling back.
}
