import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Comprehensive catch-up migration.
 *
 * Production never had prodMigrations wired up, so several tables/columns
 * created during dev (via schema push) may be missing. Every statement here
 * uses IF NOT EXISTS so it is safe to re-run.
 */
export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // --- Authors tables ---
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_authors\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`job_title\` text,
    \`blurb\` text,
    \`image_id\` integer,
    FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_authors_order_idx\` ON \`clients_authors\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_authors_parent_id_idx\` ON \`clients_authors\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_authors_image_idx\` ON \`clients_authors\` (\`image_id\`);`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_authors_expertise_tags\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`tag\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients_authors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_authors_expertise_tags_order_idx\` ON \`clients_authors_expertise_tags\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_authors_expertise_tags_parent_id_idx\` ON \`clients_authors_expertise_tags\` (\`_parent_id\`);`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_authors_social_links\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`platform\` text NOT NULL,
    \`url\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients_authors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_authors_social_links_order_idx\` ON \`clients_authors_social_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_authors_social_links_parent_id_idx\` ON \`clients_authors_social_links\` (\`_parent_id\`);`)

  // --- Competitors table ---
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_competitors\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`website_url\` text,
    \`google_maps_url\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_competitors_order_idx\` ON \`clients_competitors\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_competitors_parent_id_idx\` ON \`clients_competitors\` (\`_parent_id\`);`)

  // --- Client analysis columns (use try/catch since SQLite has no IF NOT EXISTS for columns) ---
  try { await db.run(sql`ALTER TABLE \`clients\` ADD \`business_type\` text;`) } catch { /* exists */ }
  try { await db.run(sql`ALTER TABLE \`clients\` ADD \`target_location\` text;`) } catch { /* exists */ }
  try { await db.run(sql`ALTER TABLE \`clients\` ADD \`client_goals\` text;`) } catch { /* exists */ }

  // --- CRO Audits table ---
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`cro_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`website_url\` text NOT NULL,
    \`conversion_goal\` text NOT NULL,
    \`overall_score\` numeric,
    \`above_fold_score\` numeric,
    \`cta_score\` numeric,
    \`navigation_score\` numeric,
    \`content_score\` numeric,
    \`findings\` text,
    \`recommendations\` text,
    \`extracted_content\` text,
    \`report_slug\` text,
    \`client_id\` integer,
    \`customer_email\` text,
    \`visitor_ip\` text,
    \`visitor_fingerprint\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`cro_audits_report_slug_idx\` ON \`cro_audits\` (\`report_slug\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`cro_audits_client_idx\` ON \`cro_audits\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`cro_audits_created_at_idx\` ON \`cro_audits\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`cro_audits_updated_at_idx\` ON \`cro_audits\` (\`updated_at\`);`)

  // --- Keyword Snapshots table ---
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`keyword_snapshots\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`website_url\` text NOT NULL,
    \`label\` text,
    \`total_keywords\` numeric,
    \`top10\` numeric,
    \`avg_position\` numeric,
    \`opportunities\` numeric,
    \`keywords\` text NOT NULL,
    \`ranking_distribution\` text,
    \`report_slug\` text,
    \`client_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`keyword_snapshots_report_slug_idx\` ON \`keyword_snapshots\` (\`report_slug\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`keyword_snapshots_client_idx\` ON \`keyword_snapshots\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`keyword_snapshots_created_at_idx\` ON \`keyword_snapshots\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`keyword_snapshots_updated_at_idx\` ON \`keyword_snapshots\` (\`updated_at\`);`)

  // --- Usage Reports table ---
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`usage_reports\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer,
    \`month\` text NOT NULL,
    \`seo_audits_used\` numeric,
    \`cro_audits_used\` numeric,
    \`keyword_tracks_used\` numeric,
    \`blog_posts_created\` numeric,
    \`report_data\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`usage_reports_client_idx\` ON \`usage_reports\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`usage_reports_created_at_idx\` ON \`usage_reports\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`usage_reports_updated_at_idx\` ON \`usage_reports\` (\`updated_at\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`clients_competitors\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`clients_authors_social_links\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`clients_authors_expertise_tags\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`clients_authors\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`cro_audits\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`keyword_snapshots\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`usage_reports\`;`)
}
