import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`monthly_keyword_selections\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`status\` text DEFAULT 'active',
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`monthly_keyword_selections_selections\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`year_month\` text NOT NULL,
      \`search_term\` text NOT NULL,
      \`negative_keyword\` text NOT NULL,
      \`match_type\` text DEFAULT 'exact' NOT NULL,
      \`decision\` text DEFAULT 'pending' NOT NULL,
      \`applied_to_n_k_l_id\` integer,
      \`applied_at\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`monthly_keyword_selections\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`applied_to_n_k_l_id\`) REFERENCES \`negative_keyword_lists\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`monthly_keyword_terms_cache\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`year_month\` text NOT NULL,
      \`terms\` text NOT NULL,
      \`review_complete\` integer DEFAULT false,
      \`review_completed_at\` text,
      \`review_completed_by_id\` integer,
      \`fetched_at\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`review_completed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `)

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`monthly_keyword_selections_client_idx\` ON \`monthly_keyword_selections\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_selections_status_idx\` ON \`monthly_keyword_selections\` (\`status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_selections_selections_parent_idx\` ON \`monthly_keyword_selections_selections\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_selections_selections_order_idx\` ON \`monthly_keyword_selections_selections\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_terms_cache_client_idx\` ON \`monthly_keyword_terms_cache\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_terms_cache_year_month_idx\` ON \`monthly_keyword_terms_cache\` (\`year_month\`);`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`monthly_keyword_terms_cache_client_month_idx\` ON \`monthly_keyword_terms_cache\` (\`client_id\`, \`year_month\`);`)

  try {
    await db.run(sql`
      ALTER TABLE \`payload_locked_documents_rels\`
      ADD COLUMN \`monthly_keyword_selections_id\` integer
      REFERENCES \`monthly_keyword_selections\`(\`id\`) ON UPDATE no action ON DELETE cascade;
    `)
  } catch { /* column already exists */ }

  try {
    await db.run(sql`
      ALTER TABLE \`payload_locked_documents_rels\`
      ADD COLUMN \`monthly_keyword_terms_cache_id\` integer
      REFERENCES \`monthly_keyword_terms_cache\`(\`id\`) ON UPDATE no action ON DELETE cascade;
    `)
  } catch { /* column already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`monthly_keyword_selections_selections\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`monthly_keyword_selections\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`monthly_keyword_terms_cache\`;`)
}
