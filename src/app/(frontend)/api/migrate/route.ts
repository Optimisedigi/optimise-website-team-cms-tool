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

  // --- Client Proposals ---
  await run("client_proposals", `CREATE TABLE IF NOT EXISTS \`client_proposals\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`business_name\` text NOT NULL, \`slug\` text NOT NULL,
    \`website_url\` text NOT NULL,
    \`contact_name\` text, \`contact_email\` text,
    \`has_physical_locations\` integer DEFAULT false,
    \`number_of_locations\` numeric,
    \`business_type\` text, \`conversion_goal\` text,
    \`business_goals\` text, \`notes\` text,
    \`keywords\` text, \`target_location\` text, \`suggestions\` text,
    \`audit_status\` text, \`audit_started_at\` text, \`audit_completed_at\` text,
    \`audit_error\` text,
    \`seo_audit_id\` integer, \`cro_audit_id\` integer,
    \`keyword_snapshot_id\` integer, \`competitor_analysis_id\` integer,
    \`proposal_pin\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`seo_audit_id\`) REFERENCES \`seo_audits\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`cro_audit_id\`) REFERENCES \`cro_audits\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`keyword_snapshot_id\`) REFERENCES \`keyword_snapshots\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`competitor_analysis_id\`) REFERENCES \`competitor_analyses\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("client_proposals_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `client_proposals_slug_idx` ON `client_proposals` (`slug`)");
  await run("client_proposals_pin_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `client_proposals_proposal_pin_idx` ON `client_proposals` (`proposal_pin`)");
  await run("client_proposals_created_at_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_created_at_idx` ON `client_proposals` (`created_at`)");
  await run("client_proposals_updated_at_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_updated_at_idx` ON `client_proposals` (`updated_at`)");
  await run("client_proposals_seo_audit_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_seo_audit_idx` ON `client_proposals` (`seo_audit_id`)");
  await run("client_proposals_cro_audit_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_cro_audit_idx` ON `client_proposals` (`cro_audit_id`)");
  await run("client_proposals_kw_snapshot_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_keyword_snapshot_idx` ON `client_proposals` (`keyword_snapshot_id`)");
  await run("client_proposals_comp_analysis_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitor_analysis_idx` ON `client_proposals` (`competitor_analysis_id`)");

  // --- Client Proposals Google Maps URLs sub-table ---
  await run("client_proposals_google_maps_urls", `CREATE TABLE IF NOT EXISTS \`client_proposals_google_maps_urls\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`url\` text NOT NULL, \`label\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("client_proposals_google_maps_urls_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_google_maps_urls_order_idx` ON `client_proposals_google_maps_urls` (`_order`)");
  await run("client_proposals_google_maps_urls_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_google_maps_urls_parent_id_idx` ON `client_proposals_google_maps_urls` (`_parent_id`)");

  // --- Client Proposals Competitors sub-table ---
  await run("client_proposals_competitors", `CREATE TABLE IF NOT EXISTS \`client_proposals_competitors\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`name\` text NOT NULL,
    \`website_url\` text, \`google_maps_url\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("client_proposals_competitors_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitors_order_idx` ON `client_proposals_competitors` (`_order`)");
  await run("client_proposals_competitors_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitors_parent_id_idx` ON `client_proposals_competitors` (`_parent_id`)");

  // --- Competitor Analyses ---
  await run("competitor_analyses", `CREATE TABLE IF NOT EXISTS \`competitor_analyses\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`website_url\` text NOT NULL, \`keywords\` text, \`location\` text,
    \`total_competitors\` numeric, \`your_profile\` text, \`competitors\` text,
    \`report_slug\` text, \`client_id\` integer, \`proposal_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("competitor_analyses_report_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `competitor_analyses_report_slug_idx` ON `competitor_analyses` (`report_slug`)");
  await run("competitor_analyses_client_idx", "CREATE INDEX IF NOT EXISTS `competitor_analyses_client_idx` ON `competitor_analyses` (`client_id`)");
  await run("competitor_analyses_proposal_idx", "CREATE INDEX IF NOT EXISTS `competitor_analyses_proposal_idx` ON `competitor_analyses` (`proposal_id`)");
  await run("competitor_analyses_created_at_idx", "CREATE INDEX IF NOT EXISTS `competitor_analyses_created_at_idx` ON `competitor_analyses` (`created_at`)");
  await run("competitor_analyses_updated_at_idx", "CREATE INDEX IF NOT EXISTS `competitor_analyses_updated_at_idx` ON `competitor_analyses` (`updated_at`)");

  // --- Add proposal_id column to existing audit tables ---
  await run("seo_audits.proposal_id", "ALTER TABLE `seo_audits` ADD `proposal_id` integer REFERENCES `client_proposals`(`id`) ON DELETE set null");
  await run("seo_audits_proposal_idx", "CREATE INDEX IF NOT EXISTS `seo_audits_proposal_idx` ON `seo_audits` (`proposal_id`)");

  await run("cro_audits.proposal_id", "ALTER TABLE `cro_audits` ADD `proposal_id` integer REFERENCES `client_proposals`(`id`) ON DELETE set null");
  await run("cro_audits_proposal_idx", "CREATE INDEX IF NOT EXISTS `cro_audits_proposal_idx` ON `cro_audits` (`proposal_id`)");

  await run("keyword_snapshots.proposal_id", "ALTER TABLE `keyword_snapshots` ADD `proposal_id` integer REFERENCES `client_proposals`(`id`) ON DELETE set null");
  await run("keyword_snapshots_proposal_idx", "CREATE INDEX IF NOT EXISTS `keyword_snapshots_proposal_idx` ON `keyword_snapshots` (`proposal_id`)");

  // --- Test Items (minimal test collection) ---
  await run("test_items", `CREATE TABLE IF NOT EXISTS \`test_items\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);
  await run("test_items_updated_at_idx", "CREATE INDEX IF NOT EXISTS `test_items_updated_at_idx` ON `test_items` (`updated_at`)");
  await run("test_items_created_at_idx", "CREATE INDEX IF NOT EXISTS `test_items_created_at_idx` ON `test_items` (`created_at`)");

  // --- Clean up dev migration records that cause interactive prompts ---
  await run("clean_dev_migrations", "DELETE FROM `payload_migrations` WHERE `batch` = -1");

  return NextResponse.json({ ok: true, results });
}
