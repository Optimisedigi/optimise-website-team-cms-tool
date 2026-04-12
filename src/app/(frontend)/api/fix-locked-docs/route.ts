import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Direct SQL endpoint to create/fix budget & extension tables.
 * Uses the same client.execute() pattern as /api/migrate.
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
  const client = (payload.db as any).client;

  if (!client) {
    return NextResponse.json({ error: "No LibSQL client" }, { status: 500 });
  }

  const results: string[] = [];

  async function run(label: string, statement: string) {
    try {
      await client.execute(statement);
      results.push(`OK: ${label}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        results.push(`SKIP: ${label} (already exists)`);
      } else {
        results.push(`ERROR: ${label} — ${msg}`);
      }
    }
  }

  try {
    // 1. Locked docs FK columns
    await run("locked_docs: google_ads_campaign_budgets_id",
      `ALTER TABLE payload_locked_documents_rels ADD COLUMN google_ads_campaign_budgets_id integer`);
    await run("locked_docs: google_ads_ad_extensions_id",
      `ALTER TABLE payload_locked_documents_rels ADD COLUMN google_ads_ad_extensions_id integer`);

    // 2. Create tables if they don't exist (safe — no data loss)
    // Previously this dropped and recreated tables, destroying saved data.

    // 3. Create google_ads_campaign_budgets
    await run("create google_ads_campaign_budgets", `
      CREATE TABLE IF NOT EXISTS google_ads_campaign_budgets (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        audit_id integer NOT NULL,
        customer_id text NOT NULL,
        campaign_id text NOT NULL,
        campaign_name text NOT NULL,
        ad_group_id text,
        ad_group_name text,
        budget_percentage real DEFAULT 0 NOT NULL,
        calculated_daily_budget real,
        actual_daily_budget real,
        last_pushed_at text,
        bid_strategy text DEFAULT 'manual_cpc' NOT NULL,
        bid_strategy_id text,
        manual_cpc_bid real,
        metrics_last_updated text,
        impressions integer DEFAULT 0,
        clicks integer DEFAULT 0,
        avg_cpc real DEFAULT 0,
        conversions integer DEFAULT 0,
        updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        FOREIGN KEY (audit_id) REFERENCES google_ads_audits(id) ON UPDATE NO ACTION ON DELETE CASCADE
      )
    `);

    // Sub-table: locationIds
    await run("create google_ads_campaign_budgets_location_ids", `
      CREATE TABLE IF NOT EXISTS google_ads_campaign_budgets_location_ids (
        _order integer NOT NULL,
        _parent_id integer NOT NULL,
        id integer PRIMARY KEY NOT NULL,
        location_id text NOT NULL,
        FOREIGN KEY (_parent_id) REFERENCES google_ads_campaign_budgets(id) ON UPDATE NO ACTION ON DELETE CASCADE
      )
    `);

    // Sub-table: locationNames
    await run("create google_ads_campaign_budgets_location_names", `
      CREATE TABLE IF NOT EXISTS google_ads_campaign_budgets_location_names (
        _order integer NOT NULL,
        _parent_id integer NOT NULL,
        id integer PRIMARY KEY NOT NULL,
        name text NOT NULL,
        FOREIGN KEY (_parent_id) REFERENCES google_ads_campaign_budgets(id) ON UPDATE NO ACTION ON DELETE CASCADE
      )
    `);

    // 4. Create google_ads_ad_extensions
    await run("create google_ads_ad_extensions", `
      CREATE TABLE IF NOT EXISTS google_ads_ad_extensions (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        audit_id integer NOT NULL,
        customer_id text NOT NULL,
        extension_type text NOT NULL,
        sitelink_text text,
        sitelink_url text,
        sitelink_description1 text,
        sitelink_description2 text,
        snippet_header text,
        snippet_values text,
        level text DEFAULT 'account' NOT NULL,
        asset_id text,
        asset_set_id text,
        status text DEFAULT 'draft',
        deployed_at text,
        updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        FOREIGN KEY (audit_id) REFERENCES google_ads_audits(id) ON UPDATE NO ACTION ON DELETE CASCADE
      )
    `);

    // Sub-table: assignedCampaigns
    await run("create google_ads_ad_extensions_assigned_campaigns", `
      CREATE TABLE IF NOT EXISTS google_ads_ad_extensions_assigned_campaigns (
        _order integer NOT NULL,
        _parent_id integer NOT NULL,
        id integer PRIMARY KEY NOT NULL,
        campaign_id text NOT NULL,
        campaign_name text NOT NULL,
        FOREIGN KEY (_parent_id) REFERENCES google_ads_ad_extensions(id) ON UPDATE NO ACTION ON DELETE CASCADE
      )
    `);

    // Sub-table: assignedAdGroups
    await run("create google_ads_ad_extensions_assigned_ad_groups", `
      CREATE TABLE IF NOT EXISTS google_ads_ad_extensions_assigned_ad_groups (
        _order integer NOT NULL,
        _parent_id integer NOT NULL,
        id integer PRIMARY KEY NOT NULL,
        ad_group_id text NOT NULL,
        ad_group_name text NOT NULL,
        campaign_id text NOT NULL,
        FOREIGN KEY (_parent_id) REFERENCES google_ads_ad_extensions(id) ON UPDATE NO ACTION ON DELETE CASCADE
      )
    `);

    // 5. Indexes
    await run("idx: budgets_audit", `CREATE INDEX IF NOT EXISTS google_ads_campaign_budgets_audit_idx ON google_ads_campaign_budgets (audit_id)`);
    await run("idx: budgets_campaign", `CREATE INDEX IF NOT EXISTS google_ads_campaign_budgets_campaign_idx ON google_ads_campaign_budgets (campaign_id)`);
    await run("idx: budgets_loc_ids_order", `CREATE INDEX IF NOT EXISTS google_ads_campaign_budgets_location_ids_order_idx ON google_ads_campaign_budgets_location_ids (_order)`);
    await run("idx: budgets_loc_ids_parent", `CREATE INDEX IF NOT EXISTS google_ads_campaign_budgets_location_ids_parent_idx ON google_ads_campaign_budgets_location_ids (_parent_id)`);
    await run("idx: budgets_loc_names_order", `CREATE INDEX IF NOT EXISTS google_ads_campaign_budgets_location_names_order_idx ON google_ads_campaign_budgets_location_names (_order)`);
    await run("idx: budgets_loc_names_parent", `CREATE INDEX IF NOT EXISTS google_ads_campaign_budgets_location_names_parent_idx ON google_ads_campaign_budgets_location_names (_parent_id)`);
    await run("idx: extensions_audit", `CREATE INDEX IF NOT EXISTS google_ads_ad_extensions_audit_idx ON google_ads_ad_extensions (audit_id)`);
    await run("idx: extensions_type", `CREATE INDEX IF NOT EXISTS google_ads_ad_extensions_type_idx ON google_ads_ad_extensions (extension_type)`);
    await run("idx: ext_campaigns_order", `CREATE INDEX IF NOT EXISTS google_ads_ad_extensions_assigned_campaigns_order_idx ON google_ads_ad_extensions_assigned_campaigns (_order)`);
    await run("idx: ext_campaigns_parent", `CREATE INDEX IF NOT EXISTS google_ads_ad_extensions_assigned_campaigns_parent_idx ON google_ads_ad_extensions_assigned_campaigns (_parent_id)`);
    await run("idx: ext_adgroups_order", `CREATE INDEX IF NOT EXISTS google_ads_ad_extensions_assigned_ad_groups_order_idx ON google_ads_ad_extensions_assigned_ad_groups (_order)`);
    await run("idx: ext_adgroups_parent", `CREATE INDEX IF NOT EXISTS google_ads_ad_extensions_assigned_ad_groups_parent_idx ON google_ads_ad_extensions_assigned_ad_groups (_parent_id)`);

    // 6. Add missing columns from recent migrations
    await run("google_ads_audits: monthly_budget",
      `ALTER TABLE google_ads_audits ADD COLUMN monthly_budget real`);
    await run("campaign_budgets: enabled",
      `ALTER TABLE google_ads_campaign_budgets ADD COLUMN enabled integer DEFAULT 1`);

    return NextResponse.json({ success: true, results });
  } catch (e: any) {
    console.error("fix-locked-docs error:", e);
    return NextResponse.json({ error: e.message, results }, { status: 500 });
  }
}
