import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Add the missing google_ads_ad_extensions_id column first
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_ad_extensions_id\` integer`)
  } catch { /* may already exist */ }
  
  // Now create google_ads_campaign_budgets table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_campaign_budgets\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`audit_id\` integer REFERENCES \`google_ads_audits\`(\`id\`) ON DELETE CASCADE NOT NULL,
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
      \`location_ids\` text,
      \`location_names\` text,
      \`metrics_last_updated\` text,
      \`impressions\` integer DEFAULT 0,
      \`clicks\` integer DEFAULT 0,
      \`avg_cpc\` real DEFAULT 0,
      \`conversions\` integer DEFAULT 0,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )
  `)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_audit_idx\` ON \`google_ads_campaign_budgets\` (\`audit_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_campaign_idx\` ON \`google_ads_campaign_budgets\` (\`campaign_id\`)`)

  // Create google_ads_ad_extensions table
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_ad_extensions\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`audit_id\` integer REFERENCES \`google_ads_audits\`(\`id\`) ON DELETE CASCADE NOT NULL,
      \`customer_id\` text NOT NULL,
      \`extension_type\` text NOT NULL,
      \`extension_data\` text,
      \`level\` text DEFAULT 'account' NOT NULL,
      \`status\` text DEFAULT 'draft' NOT NULL,
      \`asset_id\` text,
      \`asset_set_id\` text,
      \`assigned_campaigns\` text,
      \`assigned_ad_groups\` text,
      \`deployed_at\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )
  `)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_audit_idx\` ON \`google_ads_ad_extensions\` (\`audit_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_type_idx\` ON \`google_ads_ad_extensions\` (\`extension_type\`)`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_campaign_budgets\``)
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_ad_extensions\``)
}
