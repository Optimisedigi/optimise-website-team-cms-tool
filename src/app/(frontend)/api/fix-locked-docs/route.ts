import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { sql } from '@payloadcms/db-sqlite'

/**
 * Direct SQL endpoint to create/fix budget & extension tables.
 * Runs the same logic as migration 20260411_150000 but via HTTP,
 * so it can be called before collections are registered in config.
 *
 * POST /api/fix-locked-docs  (x-api-key: AUDIT_API_KEY)
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== process.env.AUDIT_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const db = payload.db as any;

  const results: string[] = [];

  try {
    // 1. Locked docs FK columns
    for (const col of ['google_ads_campaign_budgets_id', 'google_ads_ad_extensions_id']) {
      try {
        await db.run(sql.raw(`ALTER TABLE payload_locked_documents_rels ADD "${col}" integer`));
        results.push(`Added ${col} to payload_locked_documents_rels`);
      } catch (e: any) {
        results.push(`${col}: already exists`);
      }
    }

    // 2. Drop broken tables (wrong schema from earlier attempts)
    for (const t of [
      'google_ads_campaign_budgets_location_ids',
      'google_ads_campaign_budgets_location_names',
      'google_ads_ad_extensions_assigned_campaigns',
      'google_ads_ad_extensions_assigned_ad_groups',
      'google_ads_campaign_budgets',
      'google_ads_ad_extensions',
    ]) {
      await db.run(sql.raw(`DROP TABLE IF EXISTS "${t}"`));
    }
    results.push('Dropped old tables');

    // 3. Create google_ads_campaign_budgets
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

    // Sub-table: locationIds
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS \`google_ads_campaign_budgets_location_ids\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` integer PRIMARY KEY NOT NULL,
        \`location_id\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_campaign_budgets\`(\`id\`) ON UPDATE no action ON DELETE cascade
      )
    `)

    // Sub-table: locationNames
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS \`google_ads_campaign_budgets_location_names\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` integer PRIMARY KEY NOT NULL,
        \`name\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_campaign_budgets\`(\`id\`) ON UPDATE no action ON DELETE cascade
      )
    `)
    results.push('Created google_ads_campaign_budgets + sub-tables');

    // 4. Create google_ads_ad_extensions
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

    // Sub-table: assignedCampaigns
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

    // Sub-table: assignedAdGroups
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
    results.push('Created google_ads_ad_extensions + sub-tables');

    // 5. Indexes
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_audit_idx\` ON \`google_ads_campaign_budgets\` (\`audit_id\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_campaign_idx\` ON \`google_ads_campaign_budgets\` (\`campaign_id\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_location_ids_order_idx\` ON \`google_ads_campaign_budgets_location_ids\` (\`_order\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_location_ids_parent_idx\` ON \`google_ads_campaign_budgets_location_ids\` (\`_parent_id\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_location_names_order_idx\` ON \`google_ads_campaign_budgets_location_names\` (\`_order\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_campaign_budgets_location_names_parent_idx\` ON \`google_ads_campaign_budgets_location_names\` (\`_parent_id\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_audit_idx\` ON \`google_ads_ad_extensions\` (\`audit_id\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_type_idx\` ON \`google_ads_ad_extensions\` (\`extension_type\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_assigned_campaigns_order_idx\` ON \`google_ads_ad_extensions_assigned_campaigns\` (\`_order\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_assigned_campaigns_parent_idx\` ON \`google_ads_ad_extensions_assigned_campaigns\` (\`_parent_id\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_assigned_ad_groups_order_idx\` ON \`google_ads_ad_extensions_assigned_ad_groups\` (\`_order\`)`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_ad_extensions_assigned_ad_groups_parent_idx\` ON \`google_ads_ad_extensions_assigned_ad_groups\` (\`_parent_id\`)`)
    results.push('Created indexes');

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    console.error("fix-locked-docs error:", e);
    return NextResponse.json({ error: e.message, results }, { status: 500 });
  }
}
