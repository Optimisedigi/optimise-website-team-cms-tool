import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`monthly_keyword_selection_rows\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`year_month\` text NOT NULL,
      \`search_term\` text NOT NULL,
      \`search_term_key\` text NOT NULL,
      \`row_index\` numeric DEFAULT 0 NOT NULL,
      \`row_key\` text NOT NULL,
      \`keyword_key\` text,
      \`negative_keyword\` text NOT NULL,
      \`match_type\` text DEFAULT 'exact' NOT NULL,
      \`decision\` text DEFAULT 'pending' NOT NULL,
      \`applied_to_n_k_l_id\` integer,
      \`applied_at\` text,
      \`watch_horizon_months\` numeric,
      \`watch_until\` text,
      \`applied_by\` text,
      \`applied_by_user_id\` text,
      \`removed_comment\` text,
      \`removed_by\` text,
      \`removed_by_user_id\` text,
      \`removed_at\` text,
      \`decided_by\` text,
      \`decided_by_user_id\` text,
      \`review_dismissed_at\` text,
      \`review_dismissed_by\` text,
      \`review_comment\` text,
      \`review_comment_by\` text,
      \`review_comment_at\` text,
      \`review_comment_tagged_user_ids\` text,
      \`outcome_type\` text,
      \`outcome_detail\` text,
      \`outcome_comment\` text,
      \`outcome_by\` text,
      \`outcome_by_user_id\` text,
      \`outcome_at\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`applied_to_n_k_l_id\`) REFERENCES \`negative_keyword_lists\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `)

  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`selection_row_outcome_followups\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`comment\` text NOT NULL,
      \`by\` text,
      \`by_user_id\` text,
      \`at\` text,
      \`tagged_user_ids\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`monthly_keyword_selection_rows\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `)

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`monthly_keyword_selection_rows_row_key_idx\` ON \`monthly_keyword_selection_rows\` (\`row_key\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_selection_rows_client_idx\` ON \`monthly_keyword_selection_rows\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_selection_rows_client_month_idx\` ON \`monthly_keyword_selection_rows\` (\`client_id\`, \`year_month\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_selection_rows_client_decision_idx\` ON \`monthly_keyword_selection_rows\` (\`client_id\`, \`decision\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_selection_rows_client_search_term_idx\` ON \`monthly_keyword_selection_rows\` (\`client_id\`, \`search_term_key\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`monthly_keyword_selection_rows_client_keyword_idx\` ON \`monthly_keyword_selection_rows\` (\`client_id\`, \`keyword_key\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`selection_row_outcome_followups_parent_idx\` ON \`selection_row_outcome_followups\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`selection_row_outcome_followups_order_idx\` ON \`selection_row_outcome_followups\` (\`_order\`);`)

  try {
    await db.run(sql`
      ALTER TABLE \`payload_locked_documents_rels\`
      ADD COLUMN \`monthly_keyword_selection_rows_id\` integer
      REFERENCES \`monthly_keyword_selection_rows\`(\`id\`) ON UPDATE no action ON DELETE cascade;
    `)
  } catch { /* column already exists */ }

  await db.run(sql`
    INSERT OR REPLACE INTO \`monthly_keyword_selection_rows\` (
      \`client_id\`, \`year_month\`, \`search_term\`, \`search_term_key\`, \`row_index\`, \`row_key\`, \`keyword_key\`,
      \`negative_keyword\`, \`match_type\`, \`decision\`, \`applied_to_n_k_l_id\`, \`applied_at\`,
      \`watch_horizon_months\`, \`watch_until\`, \`applied_by\`, \`applied_by_user_id\`,
      \`removed_comment\`, \`removed_by\`, \`removed_by_user_id\`, \`removed_at\`,
      \`decided_by\`, \`decided_by_user_id\`, \`review_dismissed_at\`, \`review_dismissed_by\`,
      \`review_comment\`, \`review_comment_by\`, \`review_comment_at\`, \`review_comment_tagged_user_ids\`,
      \`outcome_type\`, \`outcome_detail\`, \`outcome_comment\`, \`outcome_by\`, \`outcome_by_user_id\`, \`outcome_at\`,
      \`updated_at\`, \`created_at\`
    )
    SELECT
      p.\`client_id\`, s.\`year_month\`, s.\`search_term\`, lower(trim(s.\`search_term\`)), coalesce(s.\`row_index\`, 0),
      cast(p.\`client_id\` as text) || '|' || s.\`year_month\` || '|' || lower(trim(s.\`search_term\`)) || '|' || cast(coalesce(s.\`row_index\`, 0) as text),
      lower(trim(s.\`negative_keyword\`)) || '|' || lower(trim(s.\`match_type\`)),
      s.\`negative_keyword\`, s.\`match_type\`, s.\`decision\`, s.\`applied_to_n_k_l_id\`, s.\`applied_at\`,
      s.\`watch_horizon_months\`, s.\`watch_until\`, s.\`applied_by\`, s.\`applied_by_user_id\`,
      s.\`removed_comment\`, s.\`removed_by\`, s.\`removed_by_user_id\`, s.\`removed_at\`,
      s.\`decided_by\`, s.\`decided_by_user_id\`, s.\`review_dismissed_at\`, s.\`review_dismissed_by\`,
      s.\`review_comment\`, s.\`review_comment_by\`, s.\`review_comment_at\`, s.\`review_comment_tagged_user_ids\`,
      s.\`outcome_type\`, s.\`outcome_detail\`, s.\`outcome_comment\`, s.\`outcome_by\`, s.\`outcome_by_user_id\`, s.\`outcome_at\`,
      p.\`updated_at\`, p.\`created_at\`
    FROM \`monthly_keyword_selections_selections\` s
    JOIN \`monthly_keyword_selections\` p ON p.\`id\` = s.\`_parent_id\`
    WHERE s.\`year_month\` IS NOT NULL AND s.\`search_term\` IS NOT NULL AND s.\`negative_keyword\` IS NOT NULL
    ORDER BY s.\`_order\` ASC;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`selection_row_outcome_followups\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`monthly_keyword_selection_rows\`;`)
}
