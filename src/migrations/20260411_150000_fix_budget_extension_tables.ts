import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Fix migration for google_ads_campaign_budgets and google_ads_ad_extensions.
 *
 * Previous migrations (20260411_120000, _130000, _140000) created these tables
 * with the wrong schema — array fields were stored as TEXT columns on the main
 * table instead of as separate sub-tables (which is what Payload's SQLite
 * adapter expects). This caused Drizzle ORM query failures → blank admin page.
 *
 * This migration drops the broken tables and recreates them correctly.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── 1. Ensure locked_docs FK columns exist ──
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_campaign_budgets_id\` integer`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_ad_extensions_id\` integer`)
  } catch { /* already exists */ }

  // ── 2. Drop broken tables (wrong schema from previous migrations) ──
  //
  // Idempotency guard: if the correct-schema sub-tables already exist,
  // this migration’s work has already been applied out-of-band (happened
  // on the shared dev Turso DB). Re-running the DROPs would destroy live
  // rows in google_ads_campaign_budgets, so short-circuit here.
  const { rows: check } = await db.run(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'google_ads_campaign_budgets_location_ids'`,
  )
  if (check.length > 0) {
    return
  }

  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_campaign_budgets\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_ad_extensions\``)
  // Drop any sub-tables that might partially exist
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_campaign_budgets_location_ids\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_campaign_budgets_location_names\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_ad_extensions_assigned_campaigns\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_ad_extensions_assigned_ad_groups\``)

  // ── 3. Create google_ads_campaign_budgets (correct schema) ──
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_campaign_budgets\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`audit_id\` integer NOT NULL,
      \`customer_id\` text NOT NULL,
      \`campaign_id\` text NOT NULL,
      \`campaign_name\` text NOT NULL,
      \`ad_group_id\` text,
      \`ad_group_name\` text,
      \`budget_percentage\` real DEFAULT 0 NOT NULL,
      \`calculated_daily_budget\` real,
      \`actual_daily_budget\` real,
      \`last_pushed_at\` text,
      \`bid_strategy\` text DEFAULT 'manual_cpc' NOT NULL,
      \`bid_strategy_id\` text,
      \`manual_cpc_bid\` real,
      \`metrics_last_updated\` text,
      \`impressions\` integer DEFAULT 0,
      \`clicks\` integer DEFAULT 0,
      \`avg_cpc\` real DEFAULT 0,
      \`conversions\` integer DEFAULT 0,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `)

  // Array sub-table: locationIds
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_campaign_budgets_location_ids\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`location_id\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_campaign_budgets\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `)

  // Array sub-table: locationNames
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_campaign_budgets_location_names\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`name\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_campaign_budgets\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `)

  // Indexes for campaign budgets
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_audit_idx\` ON \`google_ads_campaign_budgets\` (\`audit_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_campaign_idx\` ON \`google_ads_campaign_budgets\` (\`campaign_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_location_ids_order_idx\` ON \`google_ads_campaign_budgets_location_ids\` (\`_order\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_location_ids_parent_idx\` ON \`google_ads_campaign_budgets_location_ids\` (\`_parent_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_location_names_order_idx\` ON \`google_ads_campaign_budgets_location_names\` (\`_order\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_location_names_parent_idx\` ON \`google_ads_campaign_budgets_location_names\` (\`_parent_id\`)`)

  // ── 4. Create google_ads_ad_extensions (correct schema) ──
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_ad_extensions\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`audit_id\` integer NOT NULL,
      \`customer_id\` text NOT NULL,
      \`extension_type\` text NOT NULL,
      \`sitelink_text\` text,
      \`sitelink_url\` text,
      \`sitelink_description1\` text,
      \`sitelink_description2\` text,
      \`snippet_header\` text,
      \`snippet_values\` text,
      \`level\` text DEFAULT 'account' NOT NULL,
      \`asset_id\` text,
      \`asset_set_id\` text,
      \`status\` text DEFAULT 'draft',
      \`deployed_at\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `)

  // Array sub-table: assignedCampaigns
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_ad_extensions_assigned_campaigns\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`campaign_id\` text NOT NULL,
      \`campaign_name\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_ad_extensions\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `)

  // Array sub-table: assignedAdGroups
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_ad_extensions_assigned_ad_groups\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`ad_group_id\` text NOT NULL,
      \`ad_group_name\` text NOT NULL,
      \`campaign_id\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_ad_extensions\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )
  `)

  // Indexes for ad extensions
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_audit_idx\` ON \`google_ads_ad_extensions\` (\`audit_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_type_idx\` ON \`google_ads_ad_extensions\` (\`extension_type\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_assigned_campaigns_order_idx\` ON \`google_ads_ad_extensions_assigned_campaigns\` (\`_order\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_assigned_campaigns_parent_idx\` ON \`google_ads_ad_extensions_assigned_campaigns\` (\`_parent_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_assigned_ad_groups_order_idx\` ON \`google_ads_ad_extensions_assigned_ad_groups\` (\`_order\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_assigned_ad_groups_parent_idx\` ON \`google_ads_ad_extensions_assigned_ad_groups\` (\`_parent_id\`)`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_campaign_budgets_location_ids\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_campaign_budgets_location_names\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_ad_extensions_assigned_campaigns\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_ad_extensions_assigned_ad_groups\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_campaign_budgets\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_ad_extensions\``)
}
