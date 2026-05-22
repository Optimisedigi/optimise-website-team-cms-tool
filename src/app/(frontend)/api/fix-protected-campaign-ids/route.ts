import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export const maxDuration = 30;

export async function POST() {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const client = ((payload as any).db as { client?: { execute: (sql: string) => Promise<unknown> } }).client;

  const stmts = [
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
