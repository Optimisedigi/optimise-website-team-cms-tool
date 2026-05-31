import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function addLockedDocColumn(db: MigrateUpArgs["db"], column: string, table: string): Promise<void> {
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`${column}\` integer REFERENCES \`${table}\`(\`id\`) ON UPDATE no action ON DELETE cascade;`,
      ),
    );
  } catch {
    /* column already exists */
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`forecast_scenarios\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`proposal_id\` integer,
      \`title\` text NOT NULL,
      \`status\` text DEFAULT 'draft' NOT NULL,
      \`scenario_type\` text DEFAULT 'custom' NOT NULL,
      \`baseline_period_start\` text,
      \`baseline_period_end\` text,
      \`assumptions_monthly_ad_spend\` numeric,
      \`assumptions_target_monthly_ad_spend\` numeric,
      \`assumptions_current_cpa\` numeric,
      \`assumptions_target_cpa\` numeric,
      \`assumptions_conversion_rate\` numeric,
      \`assumptions_average_order_value\` numeric,
      \`assumptions_lead_close_rate\` numeric,
      \`assumptions_average_client_value\` numeric,
      \`assumptions_organic_click_growth_pct\` numeric,
      \`assumptions_confidence_level\` numeric,
      \`outputs\` text,
      \`published_at\` text,
      \`notes\` text,
      \`client_summary\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`client_value_ledger_items\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`proposal_id\` integer,
      \`google_ads_audit_id\` integer,
      \`seo_audit_proposal_id\` integer,
      \`client_process_id\` integer,
      \`blog_post_id\` integer,
      \`agent_approval_id\` integer,
      \`activity_log_id\` integer,
      \`occurred_at\` text NOT NULL,
      \`category\` text NOT NULL,
      \`title\` text NOT NULL,
      \`summary\` text NOT NULL,
      \`impact_type\` text,
      \`impact_value\` numeric,
      \`impact_unit\` text,
      \`confidence\` text DEFAULT 'directional' NOT NULL,
      \`visibility\` text DEFAULT 'internal' NOT NULL,
      \`source\` text,
      \`dedupe_key\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`google_ads_audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`seo_audit_proposal_id\`) REFERENCES \`seo_audit_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`client_process_id\`) REFERENCES \`client_processes\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`blog_post_id\`) REFERENCES \`blog_posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`agent_approval_id\`) REFERENCES \`agent_approval_queue\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`activity_log_id\`) REFERENCES \`activity_log\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`client_value_ledger_items_evidence_links\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`label\` text NOT NULL,
      \`url\` text NOT NULL,
      \`kind\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_value_ledger_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`client_portal_requests\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`proposal_id\` integer,
      \`request_type\` text DEFAULT 'general' NOT NULL,
      \`title\` text NOT NULL,
      \`description\` text NOT NULL,
      \`status\` text DEFAULT 'new' NOT NULL,
      \`priority\` text DEFAULT 'normal' NOT NULL,
      \`submitted_by_name\` text,
      \`submitted_by_email\` text,
      \`internal_notes\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`client_portal_requests_client_visible_updates\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`date\` text NOT NULL,
      \`author_label\` text NOT NULL,
      \`message\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_portal_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`client_portal_requests_related_links\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`label\` text NOT NULL,
      \`url\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_portal_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`quarterly_organic_growth_snapshots\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`proposal_id\` integer,
      \`seo_audit_proposal_id\` integer,
      \`snapshot_date\` text NOT NULL,
      \`period_start\` text NOT NULL,
      \`period_end\` text NOT NULL,
      \`snapshot_type\` text DEFAULT 'manual' NOT NULL,
      \`organic_total_clicks\` numeric DEFAULT 0,
      \`organic_total_impressions\` numeric DEFAULT 0,
      \`organic_avg_ctr\` numeric DEFAULT 0,
      \`organic_avg_position\` numeric DEFAULT 0,
      \`organic_brand_clicks\` numeric DEFAULT 0,
      \`organic_brand_impressions\` numeric DEFAULT 0,
      \`organic_brand_ctr\` numeric DEFAULT 0,
      \`organic_brand_position\` numeric DEFAULT 0,
      \`organic_non_brand_clicks\` numeric DEFAULT 0,
      \`organic_non_brand_impressions\` numeric DEFAULT 0,
      \`organic_non_brand_ctr\` numeric DEFAULT 0,
      \`organic_non_brand_position\` numeric DEFAULT 0,
      \`summary\` text,
      \`wins\` text,
      \`risks\` text,
      \`next_focus\` text,
      \`source_gsc_snapshot_id\` integer,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`seo_audit_proposal_id\`) REFERENCES \`seo_audit_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`source_gsc_snapshot_id\`) REFERENCES \`gsc_snapshots\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`qogs_categories\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`name\` text NOT NULL,
      \`score\` numeric,
      \`rank_position\` numeric,
      \`clicks\` numeric,
      \`impressions\` numeric,
      \`top_queries\` text,
      \`related_pages\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`quarterly_organic_growth_snapshots\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`qogs_topic_associations\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`topic\` text NOT NULL,
      \`cluster\` text,
      \`content_urls\` text,
      \`published_count\` numeric DEFAULT 0,
      \`first_published_at\` text,
      \`latest_published_at\` text,
      \`associated_queries\` text,
      \`notes\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`quarterly_organic_growth_snapshots\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`qogs_topic_associations_rels\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`order\` integer,
      \`parent_id\` text NOT NULL,
      \`path\` text NOT NULL,
      \`blog_posts_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`qogs_topic_associations\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`blog_posts_id\`) REFERENCES \`blog_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`qogs_work_delivered\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`date\` text NOT NULL,
      \`type\` text NOT NULL,
      \`title\` text NOT NULL,
      \`url\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`quarterly_organic_growth_snapshots\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS \`clients_client_portal_links\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`label\` text NOT NULL,
      \`url\` text NOT NULL,
      \`kind\` text DEFAULT 'other' NOT NULL,
      \`visibility\` text DEFAULT 'client_visible' NOT NULL,
      \`sort_order\` numeric DEFAULT 0,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `));

  const indexStatements = [
    "CREATE INDEX IF NOT EXISTS `forecast_scenarios_client_idx` ON `forecast_scenarios` (`client_id`)",
    "CREATE INDEX IF NOT EXISTS `forecast_scenarios_proposal_idx` ON `forecast_scenarios` (`proposal_id`)",
    "CREATE INDEX IF NOT EXISTS `forecast_scenarios_status_idx` ON `forecast_scenarios` (`status`)",
    "CREATE INDEX IF NOT EXISTS `client_value_ledger_items_client_idx` ON `client_value_ledger_items` (`client_id`)",
    "CREATE INDEX IF NOT EXISTS `client_value_ledger_items_occurred_at_idx` ON `client_value_ledger_items` (`occurred_at`)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `client_value_ledger_items_dedupe_key_idx` ON `client_value_ledger_items` (`dedupe_key`)",
    "CREATE INDEX IF NOT EXISTS `client_portal_requests_client_idx` ON `client_portal_requests` (`client_id`)",
    "CREATE INDEX IF NOT EXISTS `client_portal_requests_status_idx` ON `client_portal_requests` (`status`)",
    "CREATE INDEX IF NOT EXISTS `quarterly_organic_growth_snapshots_client_idx` ON `quarterly_organic_growth_snapshots` (`client_id`)",
    "CREATE INDEX IF NOT EXISTS `quarterly_organic_growth_snapshots_snapshot_date_idx` ON `quarterly_organic_growth_snapshots` (`snapshot_date`)",
    "CREATE INDEX IF NOT EXISTS `qogs_categories_order_idx` ON `qogs_categories` (`_order`)",
    "CREATE INDEX IF NOT EXISTS `qogs_categories_parent_id_idx` ON `qogs_categories` (`_parent_id`)",
    "CREATE INDEX IF NOT EXISTS `qogs_topic_associations_order_idx` ON `qogs_topic_associations` (`_order`)",
    "CREATE INDEX IF NOT EXISTS `qogs_topic_associations_parent_id_idx` ON `qogs_topic_associations` (`_parent_id`)",
    "CREATE INDEX IF NOT EXISTS `qogs_topic_associations_rels_order_idx` ON `qogs_topic_associations_rels` (`order`)",
    "CREATE INDEX IF NOT EXISTS `qogs_topic_associations_rels_parent_idx` ON `qogs_topic_associations_rels` (`parent_id`)",
    "CREATE INDEX IF NOT EXISTS `qogs_topic_associations_rels_path_idx` ON `qogs_topic_associations_rels` (`path`)",
    "CREATE INDEX IF NOT EXISTS `qogs_topic_associations_rels_blog_posts_idx` ON `qogs_topic_associations_rels` (`blog_posts_id`)",
    "CREATE INDEX IF NOT EXISTS `qogs_work_delivered_order_idx` ON `qogs_work_delivered` (`_order`)",
    "CREATE INDEX IF NOT EXISTS `qogs_work_delivered_parent_id_idx` ON `qogs_work_delivered` (`_parent_id`)",
    "CREATE INDEX IF NOT EXISTS `clients_client_portal_links_order_idx` ON `clients_client_portal_links` (`_order`)",
    "CREATE INDEX IF NOT EXISTS `clients_client_portal_links_parent_id_idx` ON `clients_client_portal_links` (`_parent_id`)",
  ];

  for (const statement of indexStatements) {
    await db.run(sql.raw(statement));
  }

  await addLockedDocColumn(db, "forecast_scenarios_id", "forecast_scenarios");
  await addLockedDocColumn(db, "client_value_ledger_items_id", "client_value_ledger_items");
  await addLockedDocColumn(db, "client_portal_requests_id", "client_portal_requests");
  await addLockedDocColumn(db, "quarterly_organic_growth_snapshots_id", "quarterly_organic_growth_snapshots");
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw("DROP TABLE IF EXISTS `quarterly_organic_growth_snapshots`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `client_portal_requests_related_links`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `client_portal_requests_client_visible_updates`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `client_portal_requests`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `client_value_ledger_items_evidence_links`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `client_value_ledger_items`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `forecast_scenarios`;"));
}
