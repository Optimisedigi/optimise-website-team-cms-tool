import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export const maxDuration = 30;

export async function POST() {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const client = ((payload as any).db as { client?: { execute: (sql: string) => Promise<unknown> } }).client;

  const stmts = [
    // match_type_sync_state — required by the match-type-violations cron
    `CREATE TABLE IF NOT EXISTS \`match_type_sync_state\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client\` integer NOT NULL,
      \`last_run_at\` text,
      \`created_at\` text,
      \`updated_at\` text,
      FOREIGN KEY (\`client\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`,
    `CREATE INDEX IF NOT EXISTS \`mts_client_idx\` ON \`match_type_sync_state\` (\`client\`)`,
    // match_type_violation_candidates — required by the match-type-violations cron
    `CREATE TABLE IF NOT EXISTS \`match_type_violation_candidates\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client\` integer NOT NULL,
      \`search_term\` text NOT NULL,
      \`triggering_keyword\` text NOT NULL,
      \`campaign_name\` text,
      \`ad_group_name\` text,
      \`match_type\` text NOT NULL,
      \`violation_type\` text NOT NULL,
      \`impressions\` real DEFAULT 0,
      \`clicks\` real DEFAULT 0,
      \`status\` text DEFAULT 'pending',
      \`assigned_list_id\` integer,
      \`approved_at\` text,
      \`rejected_at\` text,
      \`approved_by\` integer,
      \`last_seen_at\` text NOT NULL,
      \`first_seen_at\` text NOT NULL,
      \`run_date\` text NOT NULL,
      \`created_at\` text,
      \`updated_at\` text,
      FOREIGN KEY (\`client\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`,
    `CREATE INDEX IF NOT EXISTS \`mtvc_client_idx\` ON \`match_type_violation_candidates\` (\`client\`)`,
    `CREATE INDEX IF NOT EXISTS \`mtvc_status_idx\` ON \`match_type_violation_candidates\` (\`status\`)`,
    // Protected campaign IDs array table for clients (goal agent guard-rail)
    `CREATE TABLE IF NOT EXISTS \`clients_protected_campaign_ids\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`campaign_id\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`,
    `CREATE INDEX IF NOT EXISTS \`clients_protected_campaign_ids_order_idx\` ON \`clients_protected_campaign_ids\` (\`_order\`)`,
    `CREATE INDEX IF NOT EXISTS \`clients_protected_campaign_ids_parent_idx\` ON \`clients_protected_campaign_ids\` (\`_parent_id\`)`,
    `CREATE TABLE IF NOT EXISTS \`clients_brand_campaign_ids\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`campaign_id\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`,
    `CREATE INDEX IF NOT EXISTS \`clients_brand_campaign_ids_order_idx\` ON \`clients_brand_campaign_ids\` (\`_order\`)`,
    `CREATE INDEX IF NOT EXISTS \`clients_brand_campaign_ids_parent_idx\` ON \`clients_brand_campaign_ids\` (\`_parent_id\`)`,
  ];

  const results: { stmt: string; ok: boolean; error?: string }[] = [];

  for (const sql of stmts) {
    try {
      await client!.execute(sql);
      results.push({ stmt: sql.split(" ")[2], ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ stmt: sql.split(" ")[2], ok: false, error: msg });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results });
}
