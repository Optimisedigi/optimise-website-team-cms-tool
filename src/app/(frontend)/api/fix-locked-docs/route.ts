import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

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
  const db = payload.db;

  try {
    // Add missing FK columns to payload_locked_documents_rels
    try {
      await db.run({
        sql: `ALTER TABLE payload_locked_documents_rels ADD COLUMN google_ads_campaign_budgets_id integer`
      });
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) {
        console.error("Error adding google_ads_campaign_budgets_id:", e.message);
      }
    }

    try {
      await db.run({
        sql: `ALTER TABLE payload_locked_documents_rels ADD COLUMN google_ads_ad_extensions_id integer`
      });
    } catch (e: any) {
      if (!e.message?.includes("duplicate column")) {
        console.error("Error adding google_ads_ad_extensions_id:", e.message);
      }
    }

    // Create google_ads_campaign_budgets table
    try {
      await db.run({
        sql: `
          CREATE TABLE IF NOT EXISTS google_ads_campaign_budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            audit_id INTEGER NOT NULL REFERENCES google_ads_audits(id) ON DELETE CASCADE,
            customer_id TEXT NOT NULL,
            campaign_id TEXT NOT NULL,
            campaign_name TEXT NOT NULL,
            ad_group_id TEXT,
            ad_group_name TEXT,
            budget_percentage REAL DEFAULT 0 NOT NULL,
            calculated_daily_budget REAL,
            actual_daily_budget REAL,
            last_pushed_at TEXT,
            bid_strategy TEXT DEFAULT 'manual_cpc' NOT NULL,
            bid_strategy_id TEXT,
            manual_cpc_bid REAL,
            location_ids TEXT,
            location_names TEXT,
            metrics_last_updated TEXT,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            avg_cpc REAL DEFAULT 0,
            conversions INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
            created_at TEXT DEFAULT (datetime('now')) NOT NULL
          )
        `
      });
    } catch (e: any) {
      console.error("Error creating google_ads_campaign_budgets:", e.message);
    }

    // Create google_ads_ad_extensions table
    try {
      await db.run({
        sql: `
          CREATE TABLE IF NOT EXISTS google_ads_ad_extensions (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            audit_id INTEGER NOT NULL REFERENCES google_ads_audits(id) ON DELETE CASCADE,
            customer_id TEXT NOT NULL,
            extension_type TEXT NOT NULL,
            extension_data TEXT,
            level TEXT DEFAULT 'account' NOT NULL,
            status TEXT DEFAULT 'draft' NOT NULL,
            asset_id TEXT,
            asset_set_id TEXT,
            assigned_campaigns TEXT,
            assigned_ad_groups TEXT,
            deployed_at TEXT,
            updated_at TEXT DEFAULT (datetime('now')) NOT NULL,
            created_at TEXT DEFAULT (datetime('now')) NOT NULL
          )
        `
      });
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
