import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * One-time migration endpoint.
 * POST /api/migrate with header x-api-key matching AUDIT_API_KEY.
 * Creates missing tables/columns for collections added after initial deployment.
 * Safe to run multiple times (uses IF NOT EXISTS / catches duplicate column errors).
 */
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.AUDIT_API_KEY) {
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
      if (msg.includes("already exists")) {
        results.push(`SKIP: ${label} (already exists)`);
      } else {
        results.push(`ERROR: ${label} — ${msg}`);
      }
    }
  }

  // --- Authors tables ---
  await run("clients_authors", `CREATE TABLE IF NOT EXISTS \`clients_authors\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`name\` text NOT NULL,
    \`job_title\` text, \`blurb\` text, \`image_id\` integer,
    FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("clients_authors_order_idx", "CREATE INDEX IF NOT EXISTS `clients_authors_order_idx` ON `clients_authors` (`_order`)");
  await run("clients_authors_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_authors_parent_id_idx` ON `clients_authors` (`_parent_id`)");
  await run("clients_authors_image_idx", "CREATE INDEX IF NOT EXISTS `clients_authors_image_idx` ON `clients_authors` (`image_id`)");

  await run("clients_authors_expertise_tags", `CREATE TABLE IF NOT EXISTS \`clients_authors_expertise_tags\` (
    \`_order\` integer NOT NULL, \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`tag\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients_authors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("expertise_tags_order_idx", "CREATE INDEX IF NOT EXISTS `clients_authors_expertise_tags_order_idx` ON `clients_authors_expertise_tags` (`_order`)");
  await run("expertise_tags_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_authors_expertise_tags_parent_id_idx` ON `clients_authors_expertise_tags` (`_parent_id`)");

  await run("clients_authors_social_links", `CREATE TABLE IF NOT EXISTS \`clients_authors_social_links\` (
    \`_order\` integer NOT NULL, \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`platform\` text NOT NULL, \`url\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients_authors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("social_links_order_idx", "CREATE INDEX IF NOT EXISTS `clients_authors_social_links_order_idx` ON `clients_authors_social_links` (`_order`)");
  await run("social_links_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_authors_social_links_parent_id_idx` ON `clients_authors_social_links` (`_parent_id`)");

  // --- Competitors table ---
  await run("clients_competitors", `CREATE TABLE IF NOT EXISTS \`clients_competitors\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`name\` text NOT NULL,
    \`website_url\` text, \`google_maps_url\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("competitors_order_idx", "CREATE INDEX IF NOT EXISTS `clients_competitors_order_idx` ON `clients_competitors` (`_order`)");
  await run("competitors_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_competitors_parent_id_idx` ON `clients_competitors` (`_parent_id`)");

  // --- Client analysis columns ---
  await run("clients.business_type", "ALTER TABLE `clients` ADD `business_type` text");
  await run("clients.target_location", "ALTER TABLE `clients` ADD `target_location` text");
  await run("clients.client_goals", "ALTER TABLE `clients` ADD `client_goals` text");

  // --- CRO Audits ---
  await run("cro_audits", `CREATE TABLE IF NOT EXISTS \`cro_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL, \`website_url\` text NOT NULL,
    \`conversion_goal\` text NOT NULL, \`overall_score\` numeric,
    \`above_fold_score\` numeric, \`cta_score\` numeric,
    \`navigation_score\` numeric, \`content_score\` numeric,
    \`findings\` text, \`recommendations\` text, \`extracted_content\` text,
    \`report_slug\` text, \`client_id\` integer,
    \`customer_email\` text, \`visitor_ip\` text, \`visitor_fingerprint\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("cro_audits_report_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `cro_audits_report_slug_idx` ON `cro_audits` (`report_slug`)");
  await run("cro_audits_client_idx", "CREATE INDEX IF NOT EXISTS `cro_audits_client_idx` ON `cro_audits` (`client_id`)");
  await run("cro_audits_created_at_idx", "CREATE INDEX IF NOT EXISTS `cro_audits_created_at_idx` ON `cro_audits` (`created_at`)");
  await run("cro_audits_updated_at_idx", "CREATE INDEX IF NOT EXISTS `cro_audits_updated_at_idx` ON `cro_audits` (`updated_at`)");

  // --- Keyword Snapshots ---
  await run("keyword_snapshots", `CREATE TABLE IF NOT EXISTS \`keyword_snapshots\` (
    \`id\` integer PRIMARY KEY NOT NULL, \`website_url\` text NOT NULL,
    \`label\` text, \`total_keywords\` numeric, \`top10\` numeric,
    \`avg_position\` numeric, \`opportunities\` numeric,
    \`keywords\` text NOT NULL, \`ranking_distribution\` text,
    \`report_slug\` text, \`client_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("keyword_snapshots_report_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `keyword_snapshots_report_slug_idx` ON `keyword_snapshots` (`report_slug`)");
  await run("keyword_snapshots_client_idx", "CREATE INDEX IF NOT EXISTS `keyword_snapshots_client_idx` ON `keyword_snapshots` (`client_id`)");
  await run("keyword_snapshots_created_at_idx", "CREATE INDEX IF NOT EXISTS `keyword_snapshots_created_at_idx` ON `keyword_snapshots` (`created_at`)");
  await run("keyword_snapshots_updated_at_idx", "CREATE INDEX IF NOT EXISTS `keyword_snapshots_updated_at_idx` ON `keyword_snapshots` (`updated_at`)");

  // --- Usage Reports ---
  await run("usage_reports", `CREATE TABLE IF NOT EXISTS \`usage_reports\` (
    \`id\` integer PRIMARY KEY NOT NULL, \`client_id\` integer,
    \`month\` text NOT NULL, \`seo_audits_used\` numeric,
    \`cro_audits_used\` numeric, \`keyword_tracks_used\` numeric,
    \`blog_posts_created\` numeric, \`report_data\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("usage_reports_client_idx", "CREATE INDEX IF NOT EXISTS `usage_reports_client_idx` ON `usage_reports` (`client_id`)");
  await run("usage_reports_created_at_idx", "CREATE INDEX IF NOT EXISTS `usage_reports_created_at_idx` ON `usage_reports` (`created_at`)");
  await run("usage_reports_updated_at_idx", "CREATE INDEX IF NOT EXISTS `usage_reports_updated_at_idx` ON `usage_reports` (`updated_at`)");

  // --- Clean up dev migration records that cause interactive prompts ---
  await run("clean_dev_migrations", "DELETE FROM `payload_migrations` WHERE `batch` = -1");

  return NextResponse.json({ ok: true, results });
}
