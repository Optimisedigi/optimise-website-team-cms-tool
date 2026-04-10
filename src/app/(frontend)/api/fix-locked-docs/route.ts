import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { sql } from '@payloadcms/db-sqlite'

/**
 * Direct SQL migration to add missing locked_docs columns.
 * Run this via: POST /api/fix-locked-docs
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== process.env.AUDIT_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const db = payload.db as any;

  try {
    // Add missing FK columns to payload_locked_documents_rels
    try {
      await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_campaign_budgets_id\` integer`)
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) {
        console.error("Error adding google_ads_campaign_budgets_id:", e.message);
      }
    }

    try {
      await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_ad_extensions_id\` integer`)
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) {
        console.error("Error adding google_ads_ad_extensions_id:", e.message);
      }
    }

    // Create google_ads_campaign_budgets table
    try {
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
    } catch (e: any) {
      console.error("Error creating google_ads_campaign_budgets:", e.message);
    }

    // Create google_ads_ad_extensions table
    try {
      await db.run(sql`
        CREATE TABLE IF NOT EXISTS \`google_ads_ad_extensions\` (
          \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          \`audit_id\` integer NOT NULL,
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
    } catch (e: any) {
      console.error("Error creating google_ads_ad_extensions:", e.message);
    }

    return NextResponse.json({ 
      success: true, 
      message: "Tables and columns created/verified" 
    });
  } catch (e: any) {
    console.error("Migration error:", e);
    return NextResponse.json({ 
      error: e.message 
    }, { status: 500 });
  }
}
