import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

// Force rebuild: 2026-02-27-v2
/**
 * Schema migration endpoint.
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
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
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

  // --- GSC: New columns on clients ---
  await run("clients.website_type", "ALTER TABLE `clients` ADD `website_type` text");
  await run("clients.gsc_connected", "ALTER TABLE `clients` ADD `gsc_connected` integer DEFAULT false");
  await run("clients.gsc_property_url", "ALTER TABLE `clients` ADD `gsc_property_url` text");
  await run("clients.gsc_access_token", "ALTER TABLE `clients` ADD `gsc_access_token` text");
  await run("clients.gsc_refresh_token", "ALTER TABLE `clients` ADD `gsc_refresh_token` text");
  await run("clients.gsc_token_expiry", "ALTER TABLE `clients` ADD `gsc_token_expiry` text");
  await run("clients.gsc_last_sync", "ALTER TABLE `clients` ADD `gsc_last_sync` text");
  await run("clients.latest_gsc_snapshot_id", "ALTER TABLE `clients` ADD `latest_gsc_snapshot_id` integer REFERENCES `gsc_snapshots`(`id`) ON DELETE set null");
  await run("clients_latest_gsc_snapshot_idx", "CREATE INDEX IF NOT EXISTS `clients_latest_gsc_snapshot_idx` ON `clients` (`latest_gsc_snapshot_id`)");

  // --- GSC Snapshots table ---
  await run("gsc_snapshots", `CREATE TABLE IF NOT EXISTS \`gsc_snapshots\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`snapshot_date\` text NOT NULL,
    \`period_start\` text NOT NULL,
    \`period_end\` text NOT NULL,
    \`total_clicks\` numeric,
    \`total_impressions\` numeric,
    \`avg_ctr\` numeric,
    \`avg_position\` numeric,
    \`top_keywords\` text,
    \`top_pages\` text,
    \`indexed_pages\` numeric,
    \`not_indexed_pages\` numeric,
    \`indexing_issues\` text,
    \`sitemaps\` text,
    \`cwv_mobile\` text,
    \`cwv_desktop\` text,
    \`clicks_change\` numeric,
    \`impressions_change\` numeric,
    \`position_change\` numeric,
    \`previous_snapshot_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`previous_snapshot_id\`) REFERENCES \`gsc_snapshots\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("gsc_snapshots_client_idx", "CREATE INDEX IF NOT EXISTS `gsc_snapshots_client_idx` ON `gsc_snapshots` (`client_id`)");
  await run("gsc_snapshots_previous_snapshot_idx", "CREATE INDEX IF NOT EXISTS `gsc_snapshots_previous_snapshot_idx` ON `gsc_snapshots` (`previous_snapshot_id`)");
  await run("gsc_snapshots_created_at_idx", "CREATE INDEX IF NOT EXISTS `gsc_snapshots_created_at_idx` ON `gsc_snapshots` (`created_at`)");
  await run("gsc_snapshots_updated_at_idx", "CREATE INDEX IF NOT EXISTS `gsc_snapshots_updated_at_idx` ON `gsc_snapshots` (`updated_at`)");

  // --- Missing columns on gsc_snapshots ---
  await run("gsc_snapshots.branded_data", "ALTER TABLE `gsc_snapshots` ADD `branded_data` text");
  await run("gsc_snapshots.non_branded_data", "ALTER TABLE `gsc_snapshots` ADD `non_branded_data` text");

  // --- GSC Alerts table ---
  await run("gsc_alerts", `CREATE TABLE IF NOT EXISTS \`gsc_alerts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`snapshot_id\` integer NOT NULL,
    \`severity\` text NOT NULL,
    \`category\` text NOT NULL,
    \`title\` text NOT NULL,
    \`description\` text,
    \`actionable\` integer DEFAULT false,
    \`recommendation\` text,
    \`resolved\` integer DEFAULT false,
    \`resolved_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`snapshot_id\`) REFERENCES \`gsc_snapshots\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("gsc_alerts_client_idx", "CREATE INDEX IF NOT EXISTS `gsc_alerts_client_idx` ON `gsc_alerts` (`client_id`)");
  await run("gsc_alerts_snapshot_idx", "CREATE INDEX IF NOT EXISTS `gsc_alerts_snapshot_idx` ON `gsc_alerts` (`snapshot_id`)");
  await run("gsc_alerts_created_at_idx", "CREATE INDEX IF NOT EXISTS `gsc_alerts_created_at_idx` ON `gsc_alerts` (`created_at`)");
  await run("gsc_alerts_updated_at_idx", "CREATE INDEX IF NOT EXISTS `gsc_alerts_updated_at_idx` ON `gsc_alerts` (`updated_at`)");

  // --- payload_locked_documents_rels columns for all collections added after initial deployment ---
  // Payload's document locking system requires a column in this table for every registered collection.
  // Without these, saving any record in that collection will crash with "no such column" errors.
  await run("locked_docs_rels.client_proposals_id", "ALTER TABLE `payload_locked_documents_rels` ADD `client_proposals_id` integer REFERENCES `client_proposals`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.cro_audits_id", "ALTER TABLE `payload_locked_documents_rels` ADD `cro_audits_id` integer REFERENCES `cro_audits`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.keyword_snapshots_id", "ALTER TABLE `payload_locked_documents_rels` ADD `keyword_snapshots_id` integer REFERENCES `keyword_snapshots`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.competitor_analyses_id", "ALTER TABLE `payload_locked_documents_rels` ADD `competitor_analyses_id` integer REFERENCES `competitor_analyses`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.content_researches_id", "ALTER TABLE `payload_locked_documents_rels` ADD `content_researches_id` integer REFERENCES `content_researches`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.usage_reports_id", "ALTER TABLE `payload_locked_documents_rels` ADD `usage_reports_id` integer REFERENCES `usage_reports`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.gsc_snapshots_id", "ALTER TABLE `payload_locked_documents_rels` ADD `gsc_snapshots_id` integer REFERENCES `gsc_snapshots`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.gsc_alerts_id", "ALTER TABLE `payload_locked_documents_rels` ADD `gsc_alerts_id` integer REFERENCES `gsc_alerts`(`id`) ON DELETE cascade");

  // --- Website Mockup URL column on client_proposals ---
  await run("client_proposals.website_mockup_url", "ALTER TABLE `client_proposals` ADD `website_mockup_url` text");

  // --- TAM rich text column on client_proposals ---
  await run("client_proposals.tam", "ALTER TABLE `client_proposals` ADD `tam` text");

  // --- Visible Slides sub-table for client_proposals (hasMany select) ---
  await run("client_proposals_visible_slides", `CREATE TABLE IF NOT EXISTS \`client_proposals_visible_slides\` (
    \`order\` integer NOT NULL, \`parent_id\` integer NOT NULL,
    \`value\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("client_proposals_visible_slides_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_visible_slides_order_idx` ON `client_proposals_visible_slides` (`order`)");
  await run("client_proposals_visible_slides_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_visible_slides_parent_id_idx` ON `client_proposals_visible_slides` (`parent_id`)");
  // Drop the incorrect column if it was added by previous migration run
  await run("drop_visible_slides_col", "SELECT 1");

  // --- Audit progress text column on client_proposals ---
  await run("client_proposals.audit_progress", "ALTER TABLE `client_proposals` ADD `audit_progress` text");

  // --- Keyword Categories array table ---
  await run("client_proposals_keyword_categories", `CREATE TABLE IF NOT EXISTS \`client_proposals_keyword_categories\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`category_name\` text NOT NULL, \`keywords\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("keyword_categories_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_keyword_categories_order_idx` ON `client_proposals_keyword_categories` (`_order`)");
  await run("keyword_categories_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_keyword_categories_parent_id_idx` ON `client_proposals_keyword_categories` (`_parent_id`)");

  // --- Mission Resources images array table ---
  await run("client_proposals_mission_resources_images", `CREATE TABLE IF NOT EXISTS \`client_proposals_mission_resources_images\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`image_id\` integer, \`caption\` text,
    FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("mission_resources_images_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_mission_resources_images_order_idx` ON `client_proposals_mission_resources_images` (`_order`)");
  await run("mission_resources_images_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_mission_resources_images_parent_id_idx` ON `client_proposals_mission_resources_images` (`_parent_id`)");
  await run("mission_resources_images_image_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_mission_resources_images_image_idx` ON `client_proposals_mission_resources_images` (`image_id`)");

  // --- Competitor Google Ad Screenshots sub-table ---
  await run("client_proposals_competitors_google_ad_screenshots", `CREATE TABLE IF NOT EXISTS \`client_proposals_competitors_google_ad_screenshots\` (
    \`_order\` integer NOT NULL, \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`image_id\` integer,
    FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals_competitors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("comp_google_ad_ss_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitors_google_ad_screenshots_order_idx` ON `client_proposals_competitors_google_ad_screenshots` (`_order`)");
  await run("comp_google_ad_ss_parent_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitors_google_ad_screenshots_parent_id_idx` ON `client_proposals_competitors_google_ad_screenshots` (`_parent_id`)");
  await run("comp_google_ad_ss_image_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitors_google_ad_screenshots_image_idx` ON `client_proposals_competitors_google_ad_screenshots` (`image_id`)");

  // --- Competitor Meta Ad Screenshots sub-table ---
  await run("client_proposals_competitors_meta_ad_screenshots", `CREATE TABLE IF NOT EXISTS \`client_proposals_competitors_meta_ad_screenshots\` (
    \`_order\` integer NOT NULL, \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`image_id\` integer,
    FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals_competitors\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("comp_meta_ad_ss_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitors_meta_ad_screenshots_order_idx` ON `client_proposals_competitors_meta_ad_screenshots` (`_order`)");
  await run("comp_meta_ad_ss_parent_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitors_meta_ad_screenshots_parent_id_idx` ON `client_proposals_competitors_meta_ad_screenshots` (`_parent_id`)");
  await run("comp_meta_ad_ss_image_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_competitors_meta_ad_screenshots_image_idx` ON `client_proposals_competitors_meta_ad_screenshots` (`image_id`)");

  // --- has_meta_ads column on competitors table ---
  await run("client_proposals_competitors.has_meta_ads", "ALTER TABLE `client_proposals_competitors` ADD `has_meta_ads` integer DEFAULT false");

  // --- Missing columns on client_proposals ---
  await run("client_proposals.convert_to_client", "ALTER TABLE `client_proposals` ADD `convert_to_client` integer DEFAULT false");
  await run("client_proposals.flight_plan", "ALTER TABLE `client_proposals` ADD `flight_plan` text");
  await run("client_proposals.mission_resources", "ALTER TABLE `client_proposals` ADD `mission_resources` text");
  await run("client_proposals.launch_requirements", "ALTER TABLE `client_proposals` ADD `launch_requirements` text");
  await run("client_proposals.lead_conversion_rate", "ALTER TABLE `client_proposals` ADD `lead_conversion_rate` numeric");
  await run("client_proposals.lead_to_sale_conversion_rate", "ALTER TABLE `client_proposals` ADD `lead_to_sale_conversion_rate` numeric");
  await run("client_proposals.average_order_value", "ALTER TABLE `client_proposals` ADD `average_order_value` numeric");
  await run("client_proposals.annual_purchase_frequency", "ALTER TABLE `client_proposals` ADD `annual_purchase_frequency` numeric");
  await run("client_proposals.new_customers_last12_months", "ALTER TABLE `client_proposals` ADD `new_customers_last12_months` numeric");
  await run("client_proposals.override_monthly_visits", "ALTER TABLE `client_proposals` ADD `override_monthly_visits` numeric");
  await run("client_proposals.override_avg_position", "ALTER TABLE `client_proposals` ADD `override_avg_position` numeric");
  await run("client_proposals.override_keywords_found", "ALTER TABLE `client_proposals` ADD `override_keywords_found` numeric");

  // --- Flight Plan Images sub-table ---
  await run("client_proposals_flight_plan_images", `CREATE TABLE IF NOT EXISTS \`client_proposals_flight_plan_images\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`image_id\` integer, \`caption\` text,
    FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("flight_plan_images_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_flight_plan_images_order_idx` ON `client_proposals_flight_plan_images` (`_order`)");
  await run("flight_plan_images_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_flight_plan_images_parent_id_idx` ON `client_proposals_flight_plan_images` (`_parent_id`)");
  await run("flight_plan_images_image_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_flight_plan_images_image_idx` ON `client_proposals_flight_plan_images` (`image_id`)");

  // --- Client Proposals rels table for hasMany relationships ---
  await run("client_proposals_rels", `CREATE TABLE IF NOT EXISTS \`client_proposals_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`content_researches_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`content_researches_id\`) REFERENCES \`content_researches\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("client_proposals_rels_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_rels_order_idx` ON `client_proposals_rels` (`order`)");
  await run("client_proposals_rels_parent_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_rels_parent_id_idx` ON `client_proposals_rels` (`parent_id`)");
  await run("client_proposals_rels_path_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_rels_path_idx` ON `client_proposals_rels` (`path`)");
  await run("client_proposals_rels_content_researches_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_rels_content_researches_id_idx` ON `client_proposals_rels` (`content_researches_id`)");

  // --- Missing columns on media table ---
  await run("media.focal_x", "ALTER TABLE `media` ADD `focal_x` numeric");
  await run("media.focal_y", "ALTER TABLE `media` ADD `focal_y` numeric");
  await run("media.thumbnail_u_r_l", "ALTER TABLE `media` ADD `thumbnail_u_r_l` text");
  await run("media.sizes_thumbnail_url", "ALTER TABLE `media` ADD `sizes_thumbnail_url` text");
  await run("media.sizes_thumbnail_width", "ALTER TABLE `media` ADD `sizes_thumbnail_width` numeric");
  await run("media.sizes_thumbnail_height", "ALTER TABLE `media` ADD `sizes_thumbnail_height` numeric");
  await run("media.sizes_thumbnail_mime_type", "ALTER TABLE `media` ADD `sizes_thumbnail_mime_type` text");
  await run("media.sizes_thumbnail_filesize", "ALTER TABLE `media` ADD `sizes_thumbnail_filesize` numeric");
  await run("media.sizes_thumbnail_filename", "ALTER TABLE `media` ADD `sizes_thumbnail_filename` text");
  await run("media.sizes_card_url", "ALTER TABLE `media` ADD `sizes_card_url` text");
  await run("media.sizes_card_width", "ALTER TABLE `media` ADD `sizes_card_width` numeric");
  await run("media.sizes_card_height", "ALTER TABLE `media` ADD `sizes_card_height` numeric");
  await run("media.sizes_card_mime_type", "ALTER TABLE `media` ADD `sizes_card_mime_type` text");
  await run("media.sizes_card_filesize", "ALTER TABLE `media` ADD `sizes_card_filesize` numeric");
  await run("media.sizes_card_filename", "ALTER TABLE `media` ADD `sizes_card_filename` text");
  await run("media.sizes_hero_url", "ALTER TABLE `media` ADD `sizes_hero_url` text");
  await run("media.sizes_hero_width", "ALTER TABLE `media` ADD `sizes_hero_width` numeric");
  await run("media.sizes_hero_height", "ALTER TABLE `media` ADD `sizes_hero_height` numeric");
  await run("media.sizes_hero_mime_type", "ALTER TABLE `media` ADD `sizes_hero_mime_type` text");
  await run("media.sizes_hero_filesize", "ALTER TABLE `media` ADD `sizes_hero_filesize` numeric");
  await run("media.sizes_hero_filename", "ALTER TABLE `media` ADD `sizes_hero_filename` text");

  // --- Excluded competitor domains JSON column on client_proposals ---
  await run("client_proposals.excluded_competitor_domains", "ALTER TABLE `client_proposals` ADD `excluded_competitor_domains` text");

  // --- Screenshot click selector on client_proposals ---
  await run("client_proposals.screenshot_click_selector", "ALTER TABLE `client_proposals` ADD `screenshot_click_selector` text");

  // --- New columns on clients for proposal conversion data ---
  await run("clients.contact_name", "ALTER TABLE `clients` ADD `contact_name` text");
  await run("clients.contact_email", "ALTER TABLE `clients` ADD `contact_email` text");
  await run("clients.has_physical_locations", "ALTER TABLE `clients` ADD `has_physical_locations` integer DEFAULT false");
  await run("clients.number_of_locations", "ALTER TABLE `clients` ADD `number_of_locations` numeric");
  await run("clients.conversion_goal", "ALTER TABLE `clients` ADD `conversion_goal` text");
  await run("clients.keywords", "ALTER TABLE `clients` ADD `keywords` text");
  await run("clients.tam", "ALTER TABLE `clients` ADD `tam` text");
  await run("clients.lead_conversion_rate", "ALTER TABLE `clients` ADD `lead_conversion_rate` numeric");
  await run("clients.lead_to_sale_conversion_rate", "ALTER TABLE `clients` ADD `lead_to_sale_conversion_rate` numeric");
  await run("clients.average_order_value", "ALTER TABLE `clients` ADD `average_order_value` numeric");
  await run("clients.annual_purchase_frequency", "ALTER TABLE `clients` ADD `annual_purchase_frequency` numeric");
  await run("clients.new_customers_last12_months", "ALTER TABLE `clients` ADD `new_customers_last12_months` numeric");

  // --- Clients Google Maps URLs sub-table ---
  await run("clients_google_maps_urls", `CREATE TABLE IF NOT EXISTS \`clients_google_maps_urls\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`url\` text NOT NULL, \`label\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("clients_google_maps_urls_order_idx", "CREATE INDEX IF NOT EXISTS `clients_google_maps_urls_order_idx` ON `clients_google_maps_urls` (`_order`)");
  await run("clients_google_maps_urls_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_google_maps_urls_parent_id_idx` ON `clients_google_maps_urls` (`_parent_id`)");

  // --- Missing columns on blog_posts ---
  await run("blog_posts.client_confirmed", "ALTER TABLE `blog_posts` ADD `client_confirmed` integer DEFAULT false");
  await run("blog_posts.image_prompt_override", "ALTER TABLE `blog_posts` ADD `image_prompt_override` text");
  await run("_blog_posts_v.version_client_confirmed", "ALTER TABLE `_blog_posts_v` ADD `version_client_confirmed` integer DEFAULT false");
  await run("_blog_posts_v.version_image_prompt_override", "ALTER TABLE `_blog_posts_v` ADD `version_image_prompt_override` text");

  // --- Activity Log table ---
  await run("activity_log", `CREATE TABLE IF NOT EXISTS \`activity_log\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`type\` text NOT NULL,
    \`title\` text NOT NULL,
    \`description\` text,
    \`user_id\` integer,
    \`client_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("activity_log_user_idx", "CREATE INDEX IF NOT EXISTS `activity_log_user_idx` ON `activity_log` (`user_id`)");
  await run("activity_log_client_idx", "CREATE INDEX IF NOT EXISTS `activity_log_client_idx` ON `activity_log` (`client_id`)");
  await run("activity_log_created_at_idx", "CREATE INDEX IF NOT EXISTS `activity_log_created_at_idx` ON `activity_log` (`created_at`)");
  await run("activity_log_updated_at_idx", "CREATE INDEX IF NOT EXISTS `activity_log_updated_at_idx` ON `activity_log` (`updated_at`)");

  // --- Content Researches table ---
  await run("content_researches", `CREATE TABLE IF NOT EXISTS \`content_researches\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`keyword\` text NOT NULL,
    \`location\` text,
    \`total_questions\` numeric,
    \`clusters\` text,
    \`external_id\` text,
    \`proposal_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("content_researches_proposal_idx", "CREATE INDEX IF NOT EXISTS `content_researches_proposal_idx` ON `content_researches` (`proposal_id`)");
  await run("content_researches_created_at_idx", "CREATE INDEX IF NOT EXISTS `content_researches_created_at_idx` ON `content_researches` (`created_at`)");
  await run("content_researches_updated_at_idx", "CREATE INDEX IF NOT EXISTS `content_researches_updated_at_idx` ON `content_researches` (`updated_at`)");
  await run("content_researches.client_id", "ALTER TABLE `content_researches` ADD `client_id` integer REFERENCES `clients`(`id`) ON DELETE set null");
  await run("content_researches_client_idx", "CREATE INDEX IF NOT EXISTS `content_researches_client_idx` ON `content_researches` (`client_id`)");

  // --- Job Posts table ---
  await run("job_posts", `CREATE TABLE IF NOT EXISTS \`job_posts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`client_confirmed\` integer DEFAULT false,
    \`job_title\` text NOT NULL,
    \`excerpt\` text NOT NULL,
    \`description\` text NOT NULL,
    \`department\` text NOT NULL,
    \`employment_type\` text DEFAULT 'full-time' NOT NULL,
    \`location\` text DEFAULT 'Remote' NOT NULL,
    \`slug\` text NOT NULL,
    \`published_date\` text NOT NULL,
    \`status\` text DEFAULT 'draft' NOT NULL,
    \`_status\` text DEFAULT 'draft',
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("job_posts_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `job_posts_slug_idx` ON `job_posts` (`slug`)");
  await run("job_posts_client_idx", "CREATE INDEX IF NOT EXISTS `job_posts_client_idx` ON `job_posts` (`client_id`)");
  await run("job_posts_created_at_idx", "CREATE INDEX IF NOT EXISTS `job_posts_created_at_idx` ON `job_posts` (`created_at`)");
  await run("job_posts_updated_at_idx", "CREATE INDEX IF NOT EXISTS `job_posts_updated_at_idx` ON `job_posts` (`updated_at`)");

  // --- proposal_status column on client_proposals ---
  await run("client_proposals.proposal_status", "ALTER TABLE `client_proposals` ADD `proposal_status` text DEFAULT 'draft'");

  // --- brand_keywords column on clients ---
  await run("clients.brand_keywords", "ALTER TABLE `clients` ADD `brand_keywords` text");

  // --- monthly_retainer column on clients ---
  await run("clients.monthly_retainer", "ALTER TABLE `clients` ADD `monthly_retainer` numeric");

  // --- Retainer History sub-table ---
  await run("clients_retainer_history", `CREATE TABLE IF NOT EXISTS \`clients_retainer_history\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`amount\` numeric, \`previous_amount\` numeric,
    \`effective_date\` text, \`changed_by\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("clients_retainer_history_order_idx", "CREATE INDEX IF NOT EXISTS `clients_retainer_history_order_idx` ON `clients_retainer_history` (`_order`)");
  await run("clients_retainer_history_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_retainer_history_parent_id_idx` ON `clients_retainer_history` (`_parent_id`)");

  // --- locked_docs_rels for new collections ---
  await run("locked_docs_rels.activity_log_id", "ALTER TABLE `payload_locked_documents_rels` ADD `activity_log_id` integer REFERENCES `activity_log`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.job_posts_id", "ALTER TABLE `payload_locked_documents_rels` ADD `job_posts_id` integer REFERENCES `job_posts`(`id`) ON DELETE cascade");

  // --- Clean up dev migration records that cause interactive prompts ---
  await run("clean_dev_migrations", "DELETE FROM `payload_migrations` WHERE `batch` = -1");

  // --- Ensure Payload's registered migration is marked as executed ---
  // Without this row, Payload thinks migrations are pending and blocks all writes.
  await run("mark_migration_executed", `INSERT OR IGNORE INTO \`payload_migrations\` (\`name\`, \`batch\`, \`created_at\`, \`updated_at\`) VALUES ('20260210_034208_add_client_analysis_fields', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

  // --- externalCms column on clients ---
  await run("clients.external_cms", "ALTER TABLE `clients` ADD `external_cms` text");

  // --- secondaryConversionGoal column on clients ---
  await run("clients.secondary_conversion_goal", "ALTER TABLE `clients` ADD `secondary_conversion_goal` text");

  // --- isAgency column on clients ---
  await run("clients.is_agency", "ALTER TABLE `clients` ADD `is_agency` integer DEFAULT false");

  // --- One-Off Projects sub-table ---
  await run("clients_one_off_projects", `CREATE TABLE IF NOT EXISTS \`clients_one_off_projects\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`project_name\` text NOT NULL, \`amount\` numeric NOT NULL, \`date\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("clients_one_off_projects_order_idx", "CREATE INDEX IF NOT EXISTS `clients_one_off_projects_order_idx` ON `clients_one_off_projects` (`_order`)");
  await run("clients_one_off_projects_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_one_off_projects_parent_id_idx` ON `clients_one_off_projects` (`_parent_id`)");

  // --- Cost Categories table ---
  await run("cost_categories", `CREATE TABLE IF NOT EXISTS \`cost_categories\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`color\` text DEFAULT '#4A90D9' NOT NULL,
    \`budget\` numeric,
    \`is_active\` integer DEFAULT true,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);
  await run("cost_categories_name_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `cost_categories_name_idx` ON `cost_categories` (`name`)");
  await run("cost_categories_created_at_idx", "CREATE INDEX IF NOT EXISTS `cost_categories_created_at_idx` ON `cost_categories` (`created_at`)");
  await run("cost_categories_updated_at_idx", "CREATE INDEX IF NOT EXISTS `cost_categories_updated_at_idx` ON `cost_categories` (`updated_at`)");

  // --- Cost Rules table ---
  await run("cost_rules", `CREATE TABLE IF NOT EXISTS \`cost_rules\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`pattern\` text NOT NULL,
    \`category_id\` integer NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`category_id\`) REFERENCES \`cost_categories\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("cost_rules_pattern_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `cost_rules_pattern_idx` ON `cost_rules` (`pattern`)");
  await run("cost_rules_category_idx", "CREATE INDEX IF NOT EXISTS `cost_rules_category_idx` ON `cost_rules` (`category_id`)");
  await run("cost_rules_created_at_idx", "CREATE INDEX IF NOT EXISTS `cost_rules_created_at_idx` ON `cost_rules` (`created_at`)");
  await run("cost_rules_updated_at_idx", "CREATE INDEX IF NOT EXISTS `cost_rules_updated_at_idx` ON `cost_rules` (`updated_at`)");

  // --- Business Costs table ---
  await run("business_costs", `CREATE TABLE IF NOT EXISTS \`business_costs\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`date\` text NOT NULL,
    \`amount\` numeric NOT NULL,
    \`description\` text NOT NULL,
    \`category_id\` integer,
    \`notes\` text,
    \`source\` text DEFAULT 'manual',
    \`month\` text,
    \`year\` numeric,
    \`client_id\` integer,
    \`import_batch\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`category_id\`) REFERENCES \`cost_categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("business_costs_category_idx", "CREATE INDEX IF NOT EXISTS `business_costs_category_idx` ON `business_costs` (`category_id`)");
  await run("business_costs_client_idx", "CREATE INDEX IF NOT EXISTS `business_costs_client_idx` ON `business_costs` (`client_id`)");
  await run("business_costs_month_idx", "CREATE INDEX IF NOT EXISTS `business_costs_month_idx` ON `business_costs` (`month`)");
  await run("business_costs_date_idx", "CREATE INDEX IF NOT EXISTS `business_costs_date_idx` ON `business_costs` (`date`)");
  await run("business_costs_created_at_idx", "CREATE INDEX IF NOT EXISTS `business_costs_created_at_idx` ON `business_costs` (`created_at`)");
  await run("business_costs_updated_at_idx", "CREATE INDEX IF NOT EXISTS `business_costs_updated_at_idx` ON `business_costs` (`updated_at`)");

  // --- API Cost Rates global table ---
  await run("api_cost_rates", `CREATE TABLE IF NOT EXISTS \`api_cost_rates\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`seo_audit_cost\` numeric DEFAULT 0.012,
    \`cro_audit_cost\` numeric DEFAULT 0.005,
    \`keyword_snapshot_cost\` numeric DEFAULT 0.008,
    \`competitor_analysis_cost\` numeric DEFAULT 0.01,
    \`content_research_cost\` numeric DEFAULT 0.004,
    \`blog_image_cost\` numeric DEFAULT 0.031,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);

  // --- locked_docs_rels for finance collections ---
  await run("locked_docs_rels.cost_categories_id", "ALTER TABLE `payload_locked_documents_rels` ADD `cost_categories_id` integer REFERENCES `cost_categories`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.cost_rules_id", "ALTER TABLE `payload_locked_documents_rels` ADD `cost_rules_id` integer REFERENCES `cost_rules`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.business_costs_id", "ALTER TABLE `payload_locked_documents_rels` ADD `business_costs_id` integer REFERENCES `business_costs`(`id`) ON DELETE cascade");

  // --- blog_prompts table ---
  await run("blog_prompts", `CREATE TABLE IF NOT EXISTS \`blog_prompts\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`blog_idea\` text NOT NULL,
    \`title_idea\` text,
    \`category\` text,
    \`tag\` text,
    \`main_point\` text,
    \`key_points\` text,
    \`primary_keywords\` text,
    \`secondary_keywords\` text,
    \`points_to_avoid\` text,
    \`target_audience\` text,
    \`supporting_content\` text,
    \`generated_prompt\` text,
    \`status\` text DEFAULT 'draft',
    \`source\` text DEFAULT 'internal',
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);
  await run("locked_docs_rels.blog_prompts_id", "ALTER TABLE `payload_locked_documents_rels` ADD `blog_prompts_id` integer REFERENCES `blog_prompts`(`id`) ON DELETE cascade");

  // --- clients.service_pages column ---
  await run("clients.service_pages", "ALTER TABLE `clients` ADD `service_pages` text");

  // --- clients.google_ads_customer_id column ---
  await run("clients.google_ads_customer_id", "ALTER TABLE `clients` ADD `google_ads_customer_id` text");

  // --- Google Ads Audits ---
  await run("google_ads_audits", `CREATE TABLE IF NOT EXISTS \`google_ads_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`business_name\` text NOT NULL,
    \`slug\` text NOT NULL,
    \`customer_id\` text NOT NULL,
    \`website_url\` text,
    \`business_type\` text,
    \`monthly_spend\` numeric,
    \`contact_email\` text,
    \`notes\` text,
    \`audit_status\` text,
    \`audit_progress\` text,
    \`audit_started_at\` text,
    \`audit_completed_at\` text,
    \`audit_error\` text,
    \`overall_score\` numeric,
    \`raw_data\` text,
    \`scored_report\` text,
    \`email_html\` text,
    \`email_sent_at\` text,
    \`presentation_published\` integer DEFAULT false,
    \`presentation_data\` text,
    \`team_notes\` text,
    \`presentation_pin\` text,
    \`client_id\` integer,
    \`proposal_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("google_ads_audits_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `google_ads_audits_slug_idx` ON `google_ads_audits` (`slug`)");
  await run("google_ads_audits_client_idx", "CREATE INDEX IF NOT EXISTS `google_ads_audits_client_idx` ON `google_ads_audits` (`client_id`)");
  await run("google_ads_audits_proposal_idx", "CREATE INDEX IF NOT EXISTS `google_ads_audits_proposal_idx` ON `google_ads_audits` (`proposal_id`)");
  await run("google_ads_audits_created_at_idx", "CREATE INDEX IF NOT EXISTS `google_ads_audits_created_at_idx` ON `google_ads_audits` (`created_at`)");
  await run("google_ads_audits_updated_at_idx", "CREATE INDEX IF NOT EXISTS `google_ads_audits_updated_at_idx` ON `google_ads_audits` (`updated_at`)");

  // Array tables for google_ads_audits
  await run("google_ads_audits_conversion_objectives", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_conversion_objectives\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`objective\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_conv_obj_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_conv_obj_order_idx` ON `google_ads_audits_conversion_objectives` (`_order`)");
  await run("gaa_conv_obj_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_conv_obj_parent_idx` ON `google_ads_audits_conversion_objectives` (`_parent_id`)");

  await run("google_ads_audits_brand_terms", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_brand_terms\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`term\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_brand_terms_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_brand_terms_order_idx` ON `google_ads_audits_brand_terms` (`_order`)");
  await run("gaa_brand_terms_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_brand_terms_parent_idx` ON `google_ads_audits_brand_terms` (`_parent_id`)");

  await run("google_ads_audits_history", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_history\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`run_date\` text NOT NULL,
    \`overall_score\` numeric,
    \`step_scores\` text,
    \`notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_history_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_history_order_idx` ON `google_ads_audits_history` (`_order`)");
  await run("gaa_history_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_history_parent_idx` ON `google_ads_audits_history` (`_parent_id`)");

  await run("google_ads_audits_action_items", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_action_items\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`action\` text NOT NULL,
    \`priority\` text DEFAULT 'medium',
    \`status\` text DEFAULT 'pending',
    \`completed_at\` text,
    \`notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_action_items_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_action_items_order_idx` ON `google_ads_audits_action_items` (`_order`)");
  await run("gaa_action_items_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_action_items_parent_idx` ON `google_ads_audits_action_items` (`_parent_id`)");

  // locked_docs_rels for google_ads_audits
  await run("locked_docs_rels.google_ads_audits_id", "ALTER TABLE `payload_locked_documents_rels` ADD `google_ads_audits_id` integer REFERENCES `google_ads_audits`(`id`) ON DELETE cascade");

  // client_proposals → google_ads_audit relationship
  await run("client_proposals.google_ads_audit_id", "ALTER TABLE `client_proposals` ADD `google_ads_audit_id` integer REFERENCES `google_ads_audits`(`id`) ON DELETE set null");
  await run("client_proposals_google_ads_audit_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_google_ads_audit_idx` ON `client_proposals` (`google_ads_audit_id`)");

  // ── Google Ads Automations (2026-02-27) ──

  await run("gaa.negative_sweep_config_enabled", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_enabled` integer DEFAULT false");
  await run("gaa.negative_sweep_config_mode", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_mode` text DEFAULT 'review_first'");
  await run("gaa.negative_sweep_config_weekday", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_weekday` text DEFAULT 'monday'");
  await run("gaa.negative_sweep_config_min_spend_threshold", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_min_spend_threshold` numeric DEFAULT 5");
  await run("gaa.reaudit_config_enabled", "ALTER TABLE `google_ads_audits` ADD `reaudit_config_enabled` integer DEFAULT false");
  await run("gaa.reaudit_config_day_of_month", "ALTER TABLE `google_ads_audits` ADD `reaudit_config_day_of_month` numeric DEFAULT 1");
  await run("gaa.score_trajectory_latest_score", "ALTER TABLE `google_ads_audits` ADD `score_trajectory_latest_score` numeric");
  await run("gaa.score_trajectory_previous_score", "ALTER TABLE `google_ads_audits` ADD `score_trajectory_previous_score` numeric");
  await run("gaa.score_trajectory_score_change", "ALTER TABLE `google_ads_audits` ADD `score_trajectory_score_change` numeric");
  await run("gaa.score_trajectory_trend", "ALTER TABLE `google_ads_audits` ADD `score_trajectory_trend` text");
  await run("gaa.performance_report_config_enabled", "ALTER TABLE `google_ads_audits` ADD `performance_report_config_enabled` integer DEFAULT false");
  await run("gaa.performance_report_config_day_of_month", "ALTER TABLE `google_ads_audits` ADD `performance_report_config_day_of_month` numeric DEFAULT 3");
  await run("gaa.performance_report_config_include_in_client_hub", "ALTER TABLE `google_ads_audits` ADD `performance_report_config_include_in_client_hub` integer DEFAULT true");
  await run("gaa.negative_sweep_pending_approval", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_pending_approval` text");
  await run("gaa.create_proposal", "ALTER TABLE `google_ads_audits` ADD `create_proposal` integer DEFAULT false");
  await run("gaa.curated_findings", "ALTER TABLE `google_ads_audits` ADD `curated_findings` text");
  await run("gaa.brand_terms_text", "ALTER TABLE `google_ads_audits` ADD `brand_terms` text");
  await run("gaa.conversion_objectives_text", "ALTER TABLE `google_ads_audits` ADD `conversion_objectives` text");
  await run("gaa.negative_sweep_config_exclude_terms_text", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_exclude_terms` text");
  await run("clients.gads_auto_negative_sweep_exclude_terms", "ALTER TABLE `clients` ADD `gads_auto_negative_sweep_exclude_terms` text");

  await run("gaa_negative_sweep_config_exclude_terms", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_negative_sweep_config_exclude_terms\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`term\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_sweep_exclude_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_sweep_exclude_order_idx` ON `google_ads_audits_negative_sweep_config_exclude_terms` (`_order`)");
  await run("gaa_sweep_exclude_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_sweep_exclude_parent_idx` ON `google_ads_audits_negative_sweep_config_exclude_terms` (`_parent_id`)");

  await run("gaa_performance_report_config_recipient_emails", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_performance_report_config_recipient_emails\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`email\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_report_emails_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_report_emails_order_idx` ON `google_ads_audits_performance_report_config_recipient_emails` (`_order`)");
  await run("gaa_report_emails_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_report_emails_parent_idx` ON `google_ads_audits_performance_report_config_recipient_emails` (`_parent_id`)");

  await run("gaa_negative_sweep_history", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_negative_sweep_history\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`sweep_date\` text, \`candidate_count\` numeric, \`total_waste_identified\` numeric,
    \`applied_count\` numeric, \`status\` text, \`candidates\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_sweep_hist_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_sweep_hist_order_idx` ON `google_ads_audits_negative_sweep_history` (`_order`)");
  await run("gaa_sweep_hist_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_sweep_hist_parent_idx` ON `google_ads_audits_negative_sweep_history` (`_parent_id`)");

  await run("gaa_performance_reports", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_performance_reports\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`report_month\` text, \`report_date\` text, \`email_sent_at\` text,
    \`kpis\` text, \`mom\` text, \`campaign_breakdown\` text,
    \`monthly_trend\` text, \`email_recipients\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_perf_reports_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_perf_reports_order_idx` ON `google_ads_audits_performance_reports` (`_order`)");
  await run("gaa_perf_reports_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_perf_reports_parent_idx` ON `google_ads_audits_performance_reports` (`_parent_id`)");

  // ── GSC Daily ──
  await run("gsc_daily", `CREATE TABLE IF NOT EXISTS \`gsc_daily\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`client_id\` integer NOT NULL, \`date\` text NOT NULL,
    \`clicks\` numeric NOT NULL, \`impressions\` numeric NOT NULL,
    \`ctr\` numeric, \`position\` numeric,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gsc_daily_client_idx", "CREATE INDEX IF NOT EXISTS `gsc_daily_client_idx` ON `gsc_daily` (`client_id`)");
  await run("gsc_daily_date_idx", "CREATE INDEX IF NOT EXISTS `gsc_daily_date_idx` ON `gsc_daily` (`date`)");
  await run("gsc_daily_client_date_unique", "CREATE UNIQUE INDEX IF NOT EXISTS `gsc_daily_client_date_unique` ON `gsc_daily` (`client_id`, `date`)");
  await run("locked_docs_rels.gsc_daily_id", "ALTER TABLE `payload_locked_documents_rels` ADD `gsc_daily_id` integer REFERENCES `gsc_daily`(`id`) ON DELETE cascade");

  // ── Google Ads Automations on Clients (dbName: gads_auto / gads_trajectory) ──
  await run("clients.gads_auto_negative_sweep_enabled", "ALTER TABLE `clients` ADD `gads_auto_negative_sweep_enabled` integer DEFAULT false");
  await run("clients.gads_auto_negative_sweep_mode", "ALTER TABLE `clients` ADD `gads_auto_negative_sweep_mode` text DEFAULT 'review_first'");
  await run("clients.gads_auto_negative_sweep_weekday", "ALTER TABLE `clients` ADD `gads_auto_negative_sweep_weekday` text DEFAULT 'monday'");
  await run("clients.gads_auto_negative_sweep_min_spend_threshold", "ALTER TABLE `clients` ADD `gads_auto_negative_sweep_min_spend_threshold` numeric DEFAULT 5");
  await run("clients.gads_auto_reaudit_enabled", "ALTER TABLE `clients` ADD `gads_auto_reaudit_enabled` integer DEFAULT false");
  await run("clients.gads_auto_reaudit_day_of_month", "ALTER TABLE `clients` ADD `gads_auto_reaudit_day_of_month` numeric DEFAULT 1");
  await run("clients.gads_auto_performance_report_enabled", "ALTER TABLE `clients` ADD `gads_auto_performance_report_enabled` integer DEFAULT false");
  await run("clients.gads_auto_performance_report_day_of_month", "ALTER TABLE `clients` ADD `gads_auto_performance_report_day_of_month` numeric DEFAULT 3");
  await run("clients.gads_auto_performance_report_include_in_client_hub", "ALTER TABLE `clients` ADD `gads_auto_performance_report_include_in_client_hub` integer DEFAULT true");
  // Score trajectory
  await run("clients.gads_trajectory_latest_score", "ALTER TABLE `clients` ADD `gads_trajectory_latest_score` numeric");
  await run("clients.gads_trajectory_previous_score", "ALTER TABLE `clients` ADD `gads_trajectory_previous_score` numeric");
  await run("clients.gads_trajectory_score_change", "ALTER TABLE `clients` ADD `gads_trajectory_score_change` numeric");
  await run("clients.gads_trajectory_trend", "ALTER TABLE `clients` ADD `gads_trajectory_trend` text");
  // Array tables for automation config (dbName on arrays: gads_sweep_exclude, gads_report_emails)
  await run("clients_gads_sweep_exclude", `CREATE TABLE IF NOT EXISTS \`clients_gads_sweep_exclude\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`term\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("clients_gads_sweep_exclude_order_idx", "CREATE INDEX IF NOT EXISTS `clients_gads_sweep_exclude_order_idx` ON `clients_gads_sweep_exclude` (`_order`)");
  await run("clients_gads_sweep_exclude_parent_idx", "CREATE INDEX IF NOT EXISTS `clients_gads_sweep_exclude_parent_idx` ON `clients_gads_sweep_exclude` (`_parent_id`)");
  await run("clients_gads_report_emails", `CREATE TABLE IF NOT EXISTS \`clients_gads_report_emails\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`email\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("clients_gads_report_emails_order_idx", "CREATE INDEX IF NOT EXISTS `clients_gads_report_emails_order_idx` ON `clients_gads_report_emails` (`_order`)");
  await run("clients_gads_report_emails_parent_idx", "CREATE INDEX IF NOT EXISTS `clients_gads_report_emails_parent_idx` ON `clients_gads_report_emails` (`_parent_id`)");

  // Fix: dbName tables were created with "clients_" prefix but Payload queries them without it
  await run("rename_gads_sweep_exclude", "ALTER TABLE `clients_gads_sweep_exclude` RENAME TO `gads_sweep_exclude`");
  await run("rename_gads_report_emails", "ALTER TABLE `clients_gads_report_emails` RENAME TO `gads_report_emails`");

  // --- internal_link_suggestions table ---
  await run("internal_link_suggestions", `CREATE TABLE IF NOT EXISTS \`internal_link_suggestions\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`source_url\` text NOT NULL,
    \`target_url\` text NOT NULL,
    \`anchor_text\` text NOT NULL,
    \`context_snippet\` text,
    \`confidence_score\` numeric NOT NULL,
    \`estimated_page_rank_lift\` numeric,
    \`cluster_relation\` text,
    \`cluster_name\` text,
    \`status\` text DEFAULT 'pending',
    \`run_id\` numeric,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);
  await run("internal_link_suggestions_created_at_idx", "CREATE INDEX IF NOT EXISTS `internal_link_suggestions_created_at_idx` ON `internal_link_suggestions` (`created_at`)");
  await run("internal_link_suggestions_updated_at_idx", "CREATE INDEX IF NOT EXISTS `internal_link_suggestions_updated_at_idx` ON `internal_link_suggestions` (`updated_at`)");
  await run("locked_docs_rels.internal_link_suggestions_id", "ALTER TABLE `payload_locked_documents_rels` ADD `internal_link_suggestions_id` integer REFERENCES `internal_link_suggestions`(`id`) ON DELETE cascade");

  // --- blog_prompts.archived_at column ---
  await run("blog_prompts.archived_at", "ALTER TABLE `blog_prompts` ADD `archived_at` text");

  // --- negative_sweep_candidates table ---
  await run("negative_sweep_candidates", `CREATE TABLE IF NOT EXISTS \`negative_sweep_candidates\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`search_term\` text NOT NULL,
    \`suggested_negative\` text,
    \`campaign_name\` text,
    \`ad_group_name\` text,
    \`clicks\` numeric DEFAULT 0,
    \`impressions\` numeric DEFAULT 0,
    \`cost\` numeric DEFAULT 0,
    \`conversions\` numeric DEFAULT 0,
    \`status\` text DEFAULT 'pending',
    \`suggested_list\` text,
    \`assigned_list\` text,
    \`match_type\` text DEFAULT 'exact',
    \`ai_reasoning\` text,
    \`sweep_date\` text NOT NULL,
    \`written_to_sheet\` integer DEFAULT false,
    \`written_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("negative_sweep_candidates_client_idx", "CREATE INDEX IF NOT EXISTS `negative_sweep_candidates_client_idx` ON `negative_sweep_candidates` (`client_id`)");
  await run("negative_sweep_candidates_status_idx", "CREATE INDEX IF NOT EXISTS `negative_sweep_candidates_status_idx` ON `negative_sweep_candidates` (`status`)");
  await run("negative_sweep_candidates_sweep_date_idx", "CREATE INDEX IF NOT EXISTS `negative_sweep_candidates_sweep_date_idx` ON `negative_sweep_candidates` (`sweep_date`)");
  await run("negative_sweep_candidates_created_at_idx", "CREATE INDEX IF NOT EXISTS `negative_sweep_candidates_created_at_idx` ON `negative_sweep_candidates` (`created_at`)");
  await run("negative_sweep_candidates_updated_at_idx", "CREATE INDEX IF NOT EXISTS `negative_sweep_candidates_updated_at_idx` ON `negative_sweep_candidates` (`updated_at`)");
  await run("locked_docs_rels.negative_sweep_candidates_id", "ALTER TABLE `payload_locked_documents_rels` ADD `negative_sweep_candidates_id` integer REFERENCES `negative_sweep_candidates`(`id`) ON DELETE cascade");
  await run("negative_sweep_candidates.suggested_negative", "ALTER TABLE `negative_sweep_candidates` ADD `suggested_negative` text");

  // --- sheets_auth global table ---
  await run("sheets_auth", `CREATE TABLE IF NOT EXISTS \`sheets_auth\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`refresh_token\` text,
    \`connected_email\` text,
    \`connected_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);

  // --- clients.gads_auto_negative_sweep_sheet_url column ---
  await run("clients.gads_auto_negative_sweep_sheet_url", "ALTER TABLE `clients` ADD `gads_auto_negative_sweep_sheet_url` text");

  // --- blog_prompts.gap_status column ---
  await run("blog_prompts.gap_status", "ALTER TABLE `blog_prompts` ADD `gap_status` text DEFAULT 'open'");

  // --- clients: OptiMate automation fields ---
  await run("clients.gads_auto_optimate_enabled", "ALTER TABLE `clients` ADD `gads_auto_optimate_enabled` integer DEFAULT 0");
  await run("clients.gads_auto_optimate_mode", "ALTER TABLE `clients` ADD `gads_auto_optimate_mode` text DEFAULT 'review_first'");
  await run("clients.gads_auto_optimate_budget_threshold", "ALTER TABLE `clients` ADD `gads_auto_optimate_budget_threshold` integer DEFAULT 130");
  await run("clients.gads_auto_optimate_ctr_drop_threshold", "ALTER TABLE `clients` ADD `gads_auto_optimate_ctr_drop_threshold` integer DEFAULT 20");
  await run("clients.gads_auto_optimate_cpa_spike_threshold", "ALTER TABLE `clients` ADD `gads_auto_optimate_cpa_spike_threshold` integer DEFAULT 30");

  // --- google_ads_audits: OptiMate history (stored as JSON array in each row item) ---
  // The optimateHistory is a Payload array field — Payload creates a separate table for it.
  // We create the table here so PATCH pushes from Growth Tools can work.
  await run("google_ads_audits_optimate_history", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_optimate_history\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL REFERENCES google_ads_audits(id) ON DELETE CASCADE,
    \`id\` text PRIMARY KEY NOT NULL,
    \`run_date\` text,
    \`recommendation_count\` integer,
    \`critical_count\` integer,
    \`warning_count\` integer,
    \`checks_run\` text,
    \`auto_applied\` text,
    \`recommendations\` text
  )`);

  // Action items: add description, itemType, timeSpent fields (2026-03-04)
  await run("gaa_action_items_add_description", `
    ALTER TABLE \`google_ads_audits_action_items\` ADD COLUMN \`description\` text
  `);
  await run("gaa_action_items_add_item_type", `
    ALTER TABLE \`google_ads_audits_action_items\` ADD COLUMN \`item_type\` text DEFAULT 'task'
  `);
  await run("gaa_action_items_add_time_spent", `
    ALTER TABLE \`google_ads_audits_action_items\` ADD COLUMN \`time_spent\` integer
  `);

  // --- clients: Weekly Report automation fields (2026-03-04) ---
  await run("clients.gads_auto_weekly_report_weekly_report_enabled", "ALTER TABLE `clients` ADD `gads_auto_weekly_report_weekly_report_enabled` integer DEFAULT 0");
  await run("clients.gads_auto_weekly_report_weekly_report_template", "ALTER TABLE `clients` ADD `gads_auto_weekly_report_weekly_report_template` text DEFAULT 'lead_gen'");
  await run("clients.gads_auto_weekly_report_weekly_report_send_day", "ALTER TABLE `clients` ADD `gads_auto_weekly_report_weekly_report_send_day` text DEFAULT 'monday'");

  // Array table for weekly report recipient emails (dbName: gads_weekly_emails)
  await run("gads_weekly_emails", `CREATE TABLE IF NOT EXISTS \`gads_weekly_emails\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL, \`email\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gads_weekly_emails_order_idx", "CREATE INDEX IF NOT EXISTS `gads_weekly_emails_order_idx` ON `gads_weekly_emails` (`_order`)");
  await run("gads_weekly_emails_parent_idx", "CREATE INDEX IF NOT EXISTS `gads_weekly_emails_parent_idx` ON `gads_weekly_emails` (`_parent_id`)");

  // --- google_ads_audits: Weekly Reports history table (2026-03-04) ---
  await run("google_ads_audits_weekly_reports", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_weekly_reports\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL REFERENCES google_ads_audits(id) ON DELETE CASCADE,
    \`id\` text PRIMARY KEY NOT NULL,
    \`report_week\` text,
    \`report_date\` text,
    \`template\` text,
    \`kpis\` text,
    \`wow\` text,
    \`campaign_breakdown\` text,
    \`work_done_count\` integer
  )`);

  // --- GSC Indexing Audits (2026-03-05) ---
  await run("gsc_indexing_audits", `CREATE TABLE IF NOT EXISTS \`gsc_indexing_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer,
    \`status\` text DEFAULT 'discovering',
    \`total_urls\` numeric DEFAULT 0,
    \`inspected_count\` numeric DEFAULT 0,
    \`started_at\` text,
    \`completed_at\` text,
    \`last_batch_date\` text,
    \`error\` text,
    \`summary_stats\` text,
    \`url_sources\` text,
    \`discovered_urls\` text,
    \`inspection_results\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("gsc_indexing_audits_client_idx", "CREATE INDEX IF NOT EXISTS `gsc_indexing_audits_client_idx` ON `gsc_indexing_audits` (`client_id`)");
  await run("gsc_indexing_audits_status_idx", "CREATE INDEX IF NOT EXISTS `gsc_indexing_audits_status_idx` ON `gsc_indexing_audits` (`status`)");
  await run("gsc_indexing_audits_created_at_idx", "CREATE INDEX IF NOT EXISTS `gsc_indexing_audits_created_at_idx` ON `gsc_indexing_audits` (`created_at`)");
  await run("gsc_indexing_audits_updated_at_idx", "CREATE INDEX IF NOT EXISTS `gsc_indexing_audits_updated_at_idx` ON `gsc_indexing_audits` (`updated_at`)");
  await run("locked_docs_rels.gsc_indexing_audits_id", "ALTER TABLE `payload_locked_documents_rels` ADD `gsc_indexing_audits_id` integer");
  await run("gsc_indexing_audits.site_url", "ALTER TABLE `gsc_indexing_audits` ADD `site_url` text");

  // --- clients.gads_auto_dashboard_enabled (Quality Score tab + monthly snapshots) ---
  await run("clients.gads_auto_dashboard_enabled", "ALTER TABLE `clients` ADD `gads_auto_dashboard_enabled` integer DEFAULT false");

  // ── Sales Leads (2026-03-07) ──

  await run("sales_leads", `CREATE TABLE IF NOT EXISTS \`sales_leads\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`business_name\` text NOT NULL,
    \`website_url\` text,
    \`contact_name\` text,
    \`contact_email\` text,
    \`contact_phone\` text,
    \`channel\` text NOT NULL,
    \`channel_detail\` text,
    \`estimated_value\` numeric,
    \`business_type\` text,
    \`notes\` text,
    \`lost_reason\` text,
    \`lost_notes\` text,
    \`proposal_id\` integer,
    \`contract_id\` integer,
    \`client_id\` integer,
    \`stage\` text DEFAULT 'new_lead' NOT NULL,
    \`first_contact_date\` text,
    \`expected_close_date\` text,
    \`priority\` text DEFAULT 'medium',
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("sales_leads_channel_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_channel_idx` ON `sales_leads` (`channel`)");
  await run("sales_leads_stage_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_stage_idx` ON `sales_leads` (`stage`)");
  await run("sales_leads_proposal_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_proposal_idx` ON `sales_leads` (`proposal_id`)");
  await run("sales_leads_client_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_client_idx` ON `sales_leads` (`client_id`)");
  await run("sales_leads_created_at_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_created_at_idx` ON `sales_leads` (`created_at`)");
  await run("sales_leads_updated_at_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_updated_at_idx` ON `sales_leads` (`updated_at`)");
  await run("sales_leads_first_contact_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_first_contact_idx` ON `sales_leads` (`first_contact_date`)");

  // Stage history array table
  await run("sales_leads_stage_history", `CREATE TABLE IF NOT EXISTS \`sales_leads_stage_history\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`from_stage\` text,
    \`to_stage\` text,
    \`transition_date\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("sales_leads_stage_history_parent_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_stage_history_parent_idx` ON `sales_leads_stage_history` (`_parent_id`)");
  await run("sales_leads_stage_history_order_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_stage_history_order_idx` ON `sales_leads_stage_history` (`_order`)");

  // Services select (hasMany stored as separate table)
  await run("sales_leads_services", `CREATE TABLE IF NOT EXISTS \`sales_leads_services\` (
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`value\` text,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("sales_leads_services_parent_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_services_parent_idx` ON `sales_leads_services` (`parent_id`)");
  await run("sales_leads_services_order_idx", "CREATE INDEX IF NOT EXISTS `sales_leads_services_order_idx` ON `sales_leads_services` (`order`)");

  // locked_docs_rels for sales_leads
  await run("locked_docs_rels.sales_leads_id", "ALTER TABLE `payload_locked_documents_rels` ADD `sales_leads_id` integer");

  // ── Lead Attribution (2026-03-07) ──

  await run("sales_leads.utm_source", "ALTER TABLE `sales_leads` ADD `utm_source` text");
  await run("sales_leads.utm_medium", "ALTER TABLE `sales_leads` ADD `utm_medium` text");
  await run("sales_leads.utm_campaign", "ALTER TABLE `sales_leads` ADD `utm_campaign` text");
  await run("sales_leads.utm_term", "ALTER TABLE `sales_leads` ADD `utm_term` text");
  await run("sales_leads.gclid", "ALTER TABLE `sales_leads` ADD `gclid` text");
  await run("sales_leads.fbclid", "ALTER TABLE `sales_leads` ADD `fbclid` text");
  await run("sales_leads.landing_page", "ALTER TABLE `sales_leads` ADD `landing_page` text");
  await run("sales_leads.referrer_url", "ALTER TABLE `sales_leads` ADD `referrer_url` text");
  await run("sales_leads.lead_source", "ALTER TABLE `sales_leads` ADD `lead_source` text");
  await run("sales_leads.heard_about", "ALTER TABLE `sales_leads` ADD `heard_about` text");

  // ── Tag Setup Audits (2026-03-08) ──

  await run("tag_setup_audits", `CREATE TABLE IF NOT EXISTS \`tag_setup_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer,
    \`url\` text NOT NULL,
    \`status\` text DEFAULT 'pending',
    \`can_auto_fix\` integer DEFAULT false,
    \`auto_fix_applied\` integer DEFAULT false,
    \`summary_gtm_loaded\` integer DEFAULT false,
    \`summary_ga4_configured\` integer DEFAULT false,
    \`summary_events_detected\` numeric DEFAULT 0,
    \`summary_issues_count\` numeric DEFAULT 0,
    \`summary_gtm_container_ids\` text,
    \`summary_measurement_ids\` text,
    \`summary_consent_mode_detected\` integer DEFAULT false,
    \`missing_events\` text,
    \`data_layer_events\` text,
    \`raw_result\` text,
    \`error\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("tag_setup_audits_client_idx", "CREATE INDEX IF NOT EXISTS `tag_setup_audits_client_idx` ON `tag_setup_audits` (`client_id`)");
  await run("tag_setup_audits_status_idx", "CREATE INDEX IF NOT EXISTS `tag_setup_audits_status_idx` ON `tag_setup_audits` (`status`)");
  await run("tag_setup_audits_created_at_idx", "CREATE INDEX IF NOT EXISTS `tag_setup_audits_created_at_idx` ON `tag_setup_audits` (`created_at`)");
  await run("tag_setup_audits_updated_at_idx", "CREATE INDEX IF NOT EXISTS `tag_setup_audits_updated_at_idx` ON `tag_setup_audits` (`updated_at`)");

  // Issues array table
  await run("tag_setup_audits_issues", `CREATE TABLE IF NOT EXISTS \`tag_setup_audits_issues\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`severity\` text NOT NULL,
    \`category\` text NOT NULL,
    \`auto_fixable\` integer DEFAULT false,
    \`fixed\` integer DEFAULT false,
    \`message\` text NOT NULL,
    \`fix\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`tag_setup_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("tag_setup_audits_issues_order_idx", "CREATE INDEX IF NOT EXISTS `tag_setup_audits_issues_order_idx` ON `tag_setup_audits_issues` (`_order`)");
  await run("tag_setup_audits_issues_parent_idx", "CREATE INDEX IF NOT EXISTS `tag_setup_audits_issues_parent_idx` ON `tag_setup_audits_issues` (`_parent_id`)");

  // Events array table
  await run("tag_setup_audits_events", `CREATE TABLE IF NOT EXISTS \`tag_setup_audits_events\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text,
    \`measurement_id\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`tag_setup_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("tag_setup_audits_events_order_idx", "CREATE INDEX IF NOT EXISTS `tag_setup_audits_events_order_idx` ON `tag_setup_audits_events` (`_order`)");
  await run("tag_setup_audits_events_parent_idx", "CREATE INDEX IF NOT EXISTS `tag_setup_audits_events_parent_idx` ON `tag_setup_audits_events` (`_parent_id`)");

  // locked_docs_rels for tag_setup_audits
  await run("locked_docs_rels.tag_setup_audits_id", "ALTER TABLE `payload_locked_documents_rels` ADD `tag_setup_audits_id` integer REFERENCES `tag_setup_audits`(`id`) ON DELETE CASCADE");

  // Tracking fields on clients
  await run("clients.ga4_measurement_id", "ALTER TABLE `clients` ADD `ga4_measurement_id` text");
  await run("clients.gtm_container_id", "ALTER TABLE `clients` ADD `gtm_container_id` text");
  await run("clients.expected_events", "ALTER TABLE `clients` ADD `expected_events` text");

  // ── Mark ALL registered migrations as executed in payload_migrations ──
  // Payload with push: false will block operations if it detects migrations
  // in the index that aren't recorded in payload_migrations.
  const allMigrationNames = [
    '20260210_034208_add_client_analysis_fields',
    '20260304_120000_add_gsc_indexing_audits',
    '20260305_120000_contracts_signature_upload_template',
    '20260305_130000_add_content_researches_client',
    '20260306_120000_add_contracts',
    '20260307_120000_add_sales_leads',
    '20260307_130000_add_lead_attribution',
    '20260308_120000_add_tag_setup_audits',
  ];
  for (const migName of allMigrationNames) {
    await run(`mark_migration:${migName}`, `INSERT OR IGNORE INTO \`payload_migrations\` (\`name\`, \`batch\`, \`created_at\`, \`updated_at\`) VALUES ('${migName}', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);
  }

  // ── GA4 OAuth fields on clients (2026-03-09) ──

  await run("clients.ga4_connected", "ALTER TABLE `clients` ADD `ga4_connected` integer DEFAULT false");
  await run("clients.ga4_property_id", "ALTER TABLE `clients` ADD `ga4_property_id` text");
  await run("clients.ga4_access_token", "ALTER TABLE `clients` ADD `ga4_access_token` text");
  await run("clients.ga4_refresh_token", "ALTER TABLE `clients` ADD `ga4_refresh_token` text");
  await run("clients.ga4_token_expiry", "ALTER TABLE `clients` ADD `ga4_token_expiry` text");

  // Contracts: monthly hosting
  await run("contracts.monthly_hosting", "ALTER TABLE `contracts` ADD `monthly_hosting` integer");

  // Campaign Proposal fields on google_ads_audits
  await run("google_ads_audits.campaign_proposal_status", "ALTER TABLE `google_ads_audits` ADD `campaign_proposal_status` text");
  await run("google_ads_audits.campaign_proposal", "ALTER TABLE `google_ads_audits` ADD `campaign_proposal` text");
  await run("google_ads_audits.campaign_proposal_email_html", "ALTER TABLE `google_ads_audits` ADD `campaign_proposal_email_html` text");
  await run("google_ads_audits.campaign_proposal_generated_at", "ALTER TABLE `google_ads_audits` ADD `campaign_proposal_generated_at` text");

  // ╔══════════════════════════════════════════════════════════════════╗
  // ║  ADD NEW MIGRATION STATEMENTS ABOVE THIS LINE                  ║
  // ║  This is the POST handler — all migrations must be here.       ║
  // ║  The GET handler below is a legacy diagnostic, not used.       ║
  // ╚══════════════════════════════════════════════════════════════════╝

  // --- Schema diagnostics ---
  const tables = ["media", "clients", "clients_one_off_projects", "clients_google_maps_urls", "client_proposals", "client_proposals_competitors", "client_proposals_competitors_meta_ad_screenshots", "client_proposals_competitors_google_ad_screenshots", "client_proposals_rels", "client_proposals_visible_slides", "client_proposals_keyword_categories", "client_proposals_flight_plan_images", "client_proposals_mission_resources_images", "client_proposals_google_maps_urls", "payload_locked_documents_rels", "content_researches", "blog_posts", "_blog_posts_v", "blog_posts_rels", "_blog_posts_v_rels", "activity_log", "job_posts", "gsc_snapshots", "gsc_alerts", "cost_categories", "cost_rules", "business_costs", "api_cost_rates", "blog_prompts", "google_ads_audits", "contracts", "sales_leads", "sales_leads_stage_history", "sales_leads_services", "tag_setup_audits", "tag_setup_audits_issues", "tag_setup_audits_events"];
  const schema: Record<string, string[]> = {};
  for (const table of tables) {
    try {
      const info = await client.execute(`PRAGMA table_info(${table})`);
      schema[table] = info.rows.map((r: any) => r.name || r[1]);
    } catch {
      schema[table] = ["TABLE_NOT_FOUND"];
    }
  }

  // Dump payload_migrations for debugging
  let migrations: any[] = [];
  try {
    const migrationRows = await client.execute("SELECT * FROM `payload_migrations` ORDER BY `created_at` DESC LIMIT 20");
    migrations = migrationRows.rows;
  } catch { /* ignore */ }

  // List all tables in the database
  let allTables: string[] = [];
  try {
    const tablesResult = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    allTables = tablesResult.rows.map((r: any) => r.name || r[0]);
  } catch { /* ignore */ }

  // Diagnostic: list clients
  let clients: any[] = [];
  try {
    const clientRows = await client.execute("SELECT id, name, slug, gsc_connected, gsc_property_url, monthly_retainer, client_start_date, is_active FROM `clients` ORDER BY id");
    clients = clientRows.rows;
  } catch { /* ignore */ }

  // Diagnostic: check activity log and retainer history
  let activityCount = 0;
  let retainerHistory: any[] = [];
  try {
    const actResult = await client.execute("SELECT COUNT(*) as cnt FROM `activity_log`");
    activityCount = actResult.rows[0]?.cnt ?? 0;
  } catch { /* ignore */ }
  try {
    const retResult = await client.execute("SELECT * FROM `clients_retainer_history` ORDER BY _order");
    retainerHistory = retResult.rows;
  } catch { /* ignore */ }

  // ── Contracts (e-signature flow) ──
  await run("contracts", `CREATE TABLE IF NOT EXISTS \`contracts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`contract_title\` text NOT NULL,
    \`proposal_id\` integer,
    \`client_id\` integer,
    \`client_name\` text,
    \`client_contact_name\` text,
    \`client_email\` text,
    \`client_title\` text,
    \`client_phone\` text,
    \`client_website\` text,
    \`contract_date\` text,
    \`contract_start_date\` text,
    \`monthly_retainer\` numeric,
    \`setup_fee\` numeric,
    \`contract_term\` text,
    \`payment_terms\` text,
    \`scope_of_work\` text,
    \`pricing_notes\` text,
    \`payment_terms_override\` text,
    \`agency_contact_name\` text,
    \`agency_contact_email\` text,
    \`agency_contact_phone\` text,
    \`agency_signer_name\` text,
    \`agency_signer_title\` text,
    \`agency_signature\` integer,
    \`agency_signed_at\` text,
    \`agency_signed_ip\` text,
    \`client_signer_name\` text,
    \`client_signature\` text,
    \`client_signed_at\` text,
    \`client_signed_ip\` text,
    \`signed_pdf_url\` text,
    \`pdf_hash\` text,
    \`status\` text DEFAULT 'draft',
    \`signing_token\` text,
    \`signing_token_expires_at\` text,
    \`sent_at\` text,
    \`is_template\` integer DEFAULT false,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`agency_signature\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("contracts_proposal_idx", "CREATE INDEX IF NOT EXISTS `contracts_proposal_idx` ON `contracts` (`proposal_id`)");
  await run("contracts_client_idx", "CREATE INDEX IF NOT EXISTS `contracts_client_idx` ON `contracts` (`client_id`)");
  await run("contracts_signing_token_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `contracts_signing_token_idx` ON `contracts` (`signing_token`)");
  await run("contracts_status_idx", "CREATE INDEX IF NOT EXISTS `contracts_status_idx` ON `contracts` (`status`)");
  await run("contracts_created_at_idx", "CREATE INDEX IF NOT EXISTS `contracts_created_at_idx` ON `contracts` (`created_at`)");
  await run("contracts_updated_at_idx", "CREATE INDEX IF NOT EXISTS `contracts_updated_at_idx` ON `contracts` (`updated_at`)");
  await run("locked_docs_rels.contracts_id", "ALTER TABLE `payload_locked_documents_rels` ADD `contracts_id` integer");
  await run("clients.signed_contract_url", "ALTER TABLE `clients` ADD `signed_contract_url` text");
  await run("clients.signed_contract_id", "ALTER TABLE `clients` ADD `signed_contract_id` integer REFERENCES `contracts`(`id`) ON DELETE set null");

  // Fix: Payload expects agency_signature_id (upload fields use _id suffix) but table has agency_signature
  await run("contracts_rename_agency_sig", "ALTER TABLE `contracts` RENAME COLUMN `agency_signature` TO `agency_signature_id`");

  // Add pdf_hash column for document integrity verification
  await run("contracts.pdf_hash", "ALTER TABLE `contracts` ADD `pdf_hash` text");

  // ── Process Templates ──
  await run("process_templates", `CREATE TABLE IF NOT EXISTS \`process_templates\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`slug\` text NOT NULL,
    \`retainer_type\` text NOT NULL,
    \`description\` text,
    \`is_default\` integer DEFAULT false,
    \`is_active\` integer DEFAULT true,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);
  await run("process_templates_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `process_templates_slug_idx` ON `process_templates` (`slug`)");
  await run("process_templates_created_at_idx", "CREATE INDEX IF NOT EXISTS `process_templates_created_at_idx` ON `process_templates` (`created_at`)");
  await run("process_templates_updated_at_idx", "CREATE INDEX IF NOT EXISTS `process_templates_updated_at_idx` ON `process_templates` (`updated_at`)");

  await run("process_templates_phases", `CREATE TABLE IF NOT EXISTS \`process_templates_phases\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`phase_name\` text NOT NULL,
    \`phase_order\` numeric NOT NULL,
    \`phase_description\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`process_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("process_templates_phases_order_idx", "CREATE INDEX IF NOT EXISTS `process_templates_phases_order_idx` ON `process_templates_phases` (`_order`)");
  await run("process_templates_phases_parent_idx", "CREATE INDEX IF NOT EXISTS `process_templates_phases_parent_idx` ON `process_templates_phases` (`_parent_id`)");

  await run("process_templates_phases_steps", `CREATE TABLE IF NOT EXISTS \`process_templates_phases_steps\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`step_name\` text NOT NULL,
    \`step_order\` numeric NOT NULL,
    \`step_description\` text,
    \`step_type\` text,
    \`is_automatable\` integer DEFAULT false,
    \`automation_notes\` text,
    \`default_assignee\` text,
    \`estimated_duration\` text,
    \`email_template_subject\` text,
    \`email_template_body\` text,
    \`reminder_days\` numeric,
    \`required_before_next\` integer DEFAULT false,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`process_templates_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("process_templates_phases_steps_order_idx", "CREATE INDEX IF NOT EXISTS `process_templates_phases_steps_order_idx` ON `process_templates_phases_steps` (`_order`)");
  await run("process_templates_phases_steps_parent_idx", "CREATE INDEX IF NOT EXISTS `process_templates_phases_steps_parent_idx` ON `process_templates_phases_steps` (`_parent_id`)");

  await run("locked_docs_rels.process_templates_id", "ALTER TABLE `payload_locked_documents_rels` ADD `process_templates_id` integer");

  // ── Client Processes ──
  await run("client_processes", `CREATE TABLE IF NOT EXISTS \`client_processes\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`process_title\` text NOT NULL,
    \`template_id\` integer,
    \`retainer_type\` text,
    \`client_id\` integer,
    \`sales_lead_id\` integer,
    \`proposal_id\` integer,
    \`assigned_to_id\` integer,
    \`overall_status\` text DEFAULT 'not_started' NOT NULL,
    \`started_at\` text,
    \`completed_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`template_id\`) REFERENCES \`process_templates\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`sales_lead_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`assigned_to_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("client_processes_template_idx", "CREATE INDEX IF NOT EXISTS `client_processes_template_idx` ON `client_processes` (`template_id`)");
  await run("client_processes_client_idx", "CREATE INDEX IF NOT EXISTS `client_processes_client_idx` ON `client_processes` (`client_id`)");
  await run("client_processes_sales_lead_idx", "CREATE INDEX IF NOT EXISTS `client_processes_sales_lead_idx` ON `client_processes` (`sales_lead_id`)");
  await run("client_processes_proposal_idx", "CREATE INDEX IF NOT EXISTS `client_processes_proposal_idx` ON `client_processes` (`proposal_id`)");
  await run("client_processes_assigned_to_idx", "CREATE INDEX IF NOT EXISTS `client_processes_assigned_to_idx` ON `client_processes` (`assigned_to_id`)");
  await run("client_processes_overall_status_idx", "CREATE INDEX IF NOT EXISTS `client_processes_overall_status_idx` ON `client_processes` (`overall_status`)");
  await run("client_processes_created_at_idx", "CREATE INDEX IF NOT EXISTS `client_processes_created_at_idx` ON `client_processes` (`created_at`)");
  await run("client_processes_updated_at_idx", "CREATE INDEX IF NOT EXISTS `client_processes_updated_at_idx` ON `client_processes` (`updated_at`)");

  await run("client_processes_phases", `CREATE TABLE IF NOT EXISTS \`client_processes_phases\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`phase_name\` text NOT NULL,
    \`phase_order\` numeric NOT NULL,
    \`phase_description\` text,
    \`phase_status\` text DEFAULT 'not_started',
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_processes\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("client_processes_phases_order_idx", "CREATE INDEX IF NOT EXISTS `client_processes_phases_order_idx` ON `client_processes_phases` (`_order`)");
  await run("client_processes_phases_parent_idx", "CREATE INDEX IF NOT EXISTS `client_processes_phases_parent_idx` ON `client_processes_phases` (`_parent_id`)");

  await run("client_processes_phases_steps", `CREATE TABLE IF NOT EXISTS \`client_processes_phases_steps\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`step_name\` text NOT NULL,
    \`step_order\` numeric NOT NULL,
    \`step_description\` text,
    \`step_type\` text,
    \`step_status\` text DEFAULT 'not_started',
    \`completed_at\` text,
    \`default_assignee\` text,
    \`estimated_duration\` text,
    \`is_automatable\` integer DEFAULT false,
    \`automation_notes\` text,
    \`email_template_subject\` text,
    \`email_template_body\` text,
    \`reminder_days\` numeric,
    \`required_before_next\` integer DEFAULT false,
    \`notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_processes_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("client_processes_phases_steps_order_idx", "CREATE INDEX IF NOT EXISTS `client_processes_phases_steps_order_idx` ON `client_processes_phases_steps` (`_order`)");
  await run("client_processes_phases_steps_parent_idx", "CREATE INDEX IF NOT EXISTS `client_processes_phases_steps_parent_idx` ON `client_processes_phases_steps` (`_parent_id`)");

  await run("client_processes_timeline", `CREATE TABLE IF NOT EXISTS \`client_processes_timeline\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`action\` text NOT NULL,
    \`performed_at\` text NOT NULL,
    \`performed_by_id\` integer,
    \`notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_processes\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`performed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("client_processes_timeline_order_idx", "CREATE INDEX IF NOT EXISTS `client_processes_timeline_order_idx` ON `client_processes_timeline` (`_order`)");
  await run("client_processes_timeline_parent_idx", "CREATE INDEX IF NOT EXISTS `client_processes_timeline_parent_idx` ON `client_processes_timeline` (`_parent_id`)");

  await run("locked_docs_rels.client_processes_id", "ALTER TABLE `payload_locked_documents_rels` ADD `client_processes_id` integer");

  // Mark Payload migration as executed so `npx payload migrate` doesn't re-run it
  await run("mark_migration:20260310_120000_add_process_templates_and_client_processes", `INSERT INTO payload_migrations (name, batch, created_at, updated_at) SELECT '20260310_120000_add_process_templates_and_client_processes', 1, datetime('now'), datetime('now') WHERE NOT EXISTS (SELECT 1 FROM payload_migrations WHERE name = '20260310_120000_add_process_templates_and_client_processes')`);

  // Diagnostic: test payload.find on clients (same as /api/clients/list)
  let payloadFindTest: any = null;
  try {
    const findResult = await payload.find({
      collection: "clients",
      where: { isActive: { not_equals: false } },
      sort: "name",
      limit: 500,
      select: { name: true, slug: true, gscConnected: true, blogCategories: true, blogTags: true, servicePages: true } as any,
    });
    payloadFindTest = { ok: true, totalDocs: findResult.totalDocs, firstDoc: findResult.docs[0] };
  } catch (err: any) {
    payloadFindTest = { ok: false, error: err?.message || String(err) };
  }

  // Test contracts create/find
  let contractsTest: any = null;
  try {
    const findContracts = await payload.find({
      collection: "contracts",
      limit: 1,
      overrideAccess: true,
    });
    contractsTest = { find: { ok: true, totalDocs: findContracts.totalDocs } };
  } catch (err: any) {
    contractsTest = { find: { ok: false, error: err?.message || String(err), stack: err?.stack?.split("\n").slice(0, 5) } };
  }

  try {
    const testDoc = await payload.create({
      collection: "contracts",
      data: { contractTitle: "__migrate_test__", contractDate: "2026-03-05" },
      overrideAccess: true,
    });
    // Delete test doc
    await payload.delete({ collection: "contracts", id: testDoc.id, overrideAccess: true });
    contractsTest.create = { ok: true };
  } catch (err: any) {
    contractsTest.create = { ok: false, error: err?.message || String(err), stack: err?.stack?.split("\n").slice(0, 5) };
  }

  return NextResponse.json({ ok: true, version: "2026-03-10", results, schema, migrations, allTables, clients, activityCount, retainerHistory, payloadFindTest, contractsTest });
}

/**
 * GET /api/migrate — run only the newer finance + blog_prompts schema additions.
 * Useful when the full POST migration times out after too many operations.
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.AUDIT_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const client = (payload.db as any).client;
  if (!client) return NextResponse.json({ error: "No LibSQL client" }, { status: 500 });

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

  // Cost Categories
  await run("cost_categories", `CREATE TABLE IF NOT EXISTS \`cost_categories\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`color\` text DEFAULT '#4A90D9' NOT NULL,
    \`budget\` numeric,
    \`is_active\` integer DEFAULT 1,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);
  await run("cost_categories_name_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `cost_categories_name_idx` ON `cost_categories` (`name`)");
  await run("cost_categories_created_at_idx", "CREATE INDEX IF NOT EXISTS `cost_categories_created_at_idx` ON `cost_categories` (`created_at`)");
  await run("cost_categories_updated_at_idx", "CREATE INDEX IF NOT EXISTS `cost_categories_updated_at_idx` ON `cost_categories` (`updated_at`)");

  // Cost Rules
  await run("cost_rules", `CREATE TABLE IF NOT EXISTS \`cost_rules\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`pattern\` text NOT NULL,
    \`category_id\` integer NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`category_id\`) REFERENCES \`cost_categories\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("cost_rules_pattern_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `cost_rules_pattern_idx` ON `cost_rules` (`pattern`)");
  await run("cost_rules_category_idx", "CREATE INDEX IF NOT EXISTS `cost_rules_category_idx` ON `cost_rules` (`category_id`)");

  // Business Costs
  await run("business_costs", `CREATE TABLE IF NOT EXISTS \`business_costs\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`date\` text NOT NULL,
    \`amount\` numeric NOT NULL,
    \`description\` text NOT NULL,
    \`category_id\` integer,
    \`notes\` text,
    \`source\` text DEFAULT 'manual',
    \`month\` text,
    \`year\` numeric,
    \`client_id\` integer,
    \`import_batch\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`category_id\`) REFERENCES \`cost_categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("business_costs_category_idx", "CREATE INDEX IF NOT EXISTS `business_costs_category_idx` ON `business_costs` (`category_id`)");
  await run("business_costs_client_idx", "CREATE INDEX IF NOT EXISTS `business_costs_client_idx` ON `business_costs` (`client_id`)");
  await run("business_costs_month_idx", "CREATE INDEX IF NOT EXISTS `business_costs_month_idx` ON `business_costs` (`month`)");

  // API Cost Rates
  await run("api_cost_rates", `CREATE TABLE IF NOT EXISTS \`api_cost_rates\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`seo_audit_cost\` numeric DEFAULT 0.012,
    \`cro_audit_cost\` numeric DEFAULT 0.005,
    \`keyword_snapshot_cost\` numeric DEFAULT 0.008,
    \`competitor_analysis_cost\` numeric DEFAULT 0.01,
    \`content_research_cost\` numeric DEFAULT 0.004,
    \`blog_image_cost\` numeric DEFAULT 0.031,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);

  // locked_docs_rels for finance
  await run("locked_docs_rels.cost_categories_id", "ALTER TABLE `payload_locked_documents_rels` ADD `cost_categories_id` integer REFERENCES `cost_categories`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.cost_rules_id", "ALTER TABLE `payload_locked_documents_rels` ADD `cost_rules_id` integer REFERENCES `cost_rules`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.business_costs_id", "ALTER TABLE `payload_locked_documents_rels` ADD `business_costs_id` integer REFERENCES `business_costs`(`id`) ON DELETE cascade");

  // Blog Prompts
  await run("blog_prompts", `CREATE TABLE IF NOT EXISTS \`blog_prompts\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`blog_idea\` text NOT NULL,
    \`title_idea\` text,
    \`category\` text,
    \`tag\` text,
    \`main_point\` text,
    \`key_points\` text,
    \`primary_keywords\` text,
    \`secondary_keywords\` text,
    \`points_to_avoid\` text,
    \`target_audience\` text,
    \`supporting_content\` text,
    \`generated_prompt\` text,
    \`status\` text DEFAULT 'draft',
    \`source\` text DEFAULT 'internal',
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);
  await run("locked_docs_rels.blog_prompts_id", "ALTER TABLE `payload_locked_documents_rels` ADD `blog_prompts_id` integer REFERENCES `blog_prompts`(`id`) ON DELETE cascade");

  // client_proposals.google_ads_customer_id
  await run("client_proposals.google_ads_customer_id", "ALTER TABLE `client_proposals` ADD `google_ads_customer_id` text");

  // ── Google Ads Automations (2026-02-27) ──

  // Negative sweep config (group → columns on main table)
  await run("gaa.negative_sweep_config_enabled", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_enabled` integer DEFAULT false");
  await run("gaa.negative_sweep_config_mode", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_mode` text DEFAULT 'review_first'");
  await run("gaa.negative_sweep_config_weekday", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_weekday` text DEFAULT 'monday'");
  await run("gaa.negative_sweep_config_min_spend_threshold", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_config_min_spend_threshold` numeric DEFAULT 5");

  // Re-audit config (group → columns)
  await run("gaa.reaudit_config_enabled", "ALTER TABLE `google_ads_audits` ADD `reaudit_config_enabled` integer DEFAULT false");
  await run("gaa.reaudit_config_day_of_month", "ALTER TABLE `google_ads_audits` ADD `reaudit_config_day_of_month` numeric DEFAULT 1");

  // Score trajectory (group → columns)
  await run("gaa.score_trajectory_latest_score", "ALTER TABLE `google_ads_audits` ADD `score_trajectory_latest_score` numeric");
  await run("gaa.score_trajectory_previous_score", "ALTER TABLE `google_ads_audits` ADD `score_trajectory_previous_score` numeric");
  await run("gaa.score_trajectory_score_change", "ALTER TABLE `google_ads_audits` ADD `score_trajectory_score_change` numeric");
  await run("gaa.score_trajectory_trend", "ALTER TABLE `google_ads_audits` ADD `score_trajectory_trend` text");

  // Performance report config (group → columns)
  await run("gaa.performance_report_config_enabled", "ALTER TABLE `google_ads_audits` ADD `performance_report_config_enabled` integer DEFAULT false");
  await run("gaa.performance_report_config_day_of_month", "ALTER TABLE `google_ads_audits` ADD `performance_report_config_day_of_month` numeric DEFAULT 3");
  await run("gaa.performance_report_config_include_in_client_hub", "ALTER TABLE `google_ads_audits` ADD `performance_report_config_include_in_client_hub` integer DEFAULT true");

  // Pending approval + curated findings checkbox
  await run("gaa.negative_sweep_pending_approval", "ALTER TABLE `google_ads_audits` ADD `negative_sweep_pending_approval` text");
  await run("gaa.create_proposal", "ALTER TABLE `google_ads_audits` ADD `create_proposal` integer DEFAULT false");

  // Negative sweep config exclude terms (array table)
  await run("gaa_negative_sweep_config_exclude_terms", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_negative_sweep_config_exclude_terms\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`term\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_sweep_exclude_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_sweep_exclude_order_idx` ON `google_ads_audits_negative_sweep_config_exclude_terms` (`_order`)");
  await run("gaa_sweep_exclude_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_sweep_exclude_parent_idx` ON `google_ads_audits_negative_sweep_config_exclude_terms` (`_parent_id`)");

  // Performance report config recipient emails (array table)
  await run("gaa_performance_report_config_recipient_emails", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_performance_report_config_recipient_emails\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`email\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_report_emails_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_report_emails_order_idx` ON `google_ads_audits_performance_report_config_recipient_emails` (`_order`)");
  await run("gaa_report_emails_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_report_emails_parent_idx` ON `google_ads_audits_performance_report_config_recipient_emails` (`_parent_id`)");

  // Negative sweep history (array table)
  await run("gaa_negative_sweep_history", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_negative_sweep_history\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`sweep_date\` text,
    \`candidate_count\` numeric,
    \`total_waste_identified\` numeric,
    \`applied_count\` numeric,
    \`status\` text,
    \`candidates\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_sweep_hist_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_sweep_hist_order_idx` ON `google_ads_audits_negative_sweep_history` (`_order`)");
  await run("gaa_sweep_hist_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_sweep_hist_parent_idx` ON `google_ads_audits_negative_sweep_history` (`_parent_id`)");

  // Performance reports (array table)
  await run("gaa_performance_reports", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_performance_reports\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`report_month\` text,
    \`report_date\` text,
    \`email_sent_at\` text,
    \`kpis\` text,
    \`mom\` text,
    \`campaign_breakdown\` text,
    \`monthly_trend\` text,
    \`email_recipients\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_perf_reports_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_perf_reports_order_idx` ON `google_ads_audits_performance_reports` (`_order`)");
  await run("gaa_perf_reports_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_perf_reports_parent_idx` ON `google_ads_audits_performance_reports` (`_parent_id`)");

  // ── Client billing fields ──
  await run("clients.client_start_date", "ALTER TABLE `clients` ADD `client_start_date` text");
  await run("clients.historical_revenue", "ALTER TABLE `clients` ADD `historical_revenue` numeric");
  await run("clients.contract_id", "ALTER TABLE `clients` ADD `contract_id` integer REFERENCES `media`(`id`) ON DELETE set null");

  // ── ApiCostRates subscriptions array ──
  await run("api_cost_rates_subscriptions", `CREATE TABLE IF NOT EXISTS \`api_cost_rates_subscriptions\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`category\` text DEFAULT 'llm',
    \`monthly_cost_aud\` numeric NOT NULL,
    \`start_date\` text,
    \`is_active\` integer DEFAULT true,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`api_cost_rates\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("api_cost_rates_subs_order_idx", "CREATE INDEX IF NOT EXISTS `api_cost_rates_subs_order_idx` ON `api_cost_rates_subscriptions` (`_order`)");
  await run("api_cost_rates_subs_parent_idx", "CREATE INDEX IF NOT EXISTS `api_cost_rates_subs_parent_idx` ON `api_cost_rates_subscriptions` (`_parent_id`)");
  await run("api_cost_rates_subs.start_date", "ALTER TABLE `api_cost_rates_subscriptions` ADD `start_date` text");

  // ── GSC Daily (historical daily data) ──

  await run("gsc_daily", `CREATE TABLE IF NOT EXISTS \`gsc_daily\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`client_id\` integer NOT NULL,
    \`date\` text NOT NULL,
    \`clicks\` numeric NOT NULL,
    \`impressions\` numeric NOT NULL,
    \`ctr\` numeric,
    \`position\` numeric,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gsc_daily_client_idx", "CREATE INDEX IF NOT EXISTS `gsc_daily_client_idx` ON `gsc_daily` (`client_id`)");
  await run("gsc_daily_date_idx", "CREATE INDEX IF NOT EXISTS `gsc_daily_date_idx` ON `gsc_daily` (`date`)");
  await run("gsc_daily_client_date_unique", "CREATE UNIQUE INDEX IF NOT EXISTS `gsc_daily_client_date_unique` ON `gsc_daily` (`client_id`, `date`)");
  await run("locked_docs_rels.gsc_daily_id", "ALTER TABLE `payload_locked_documents_rels` ADD `gsc_daily_id` integer REFERENCES `gsc_daily`(`id`) ON DELETE cascade");

  // ── GSC Indexing Audits ──
  await run("gsc_indexing_audits", `CREATE TABLE IF NOT EXISTS \`gsc_indexing_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer,
    \`status\` text DEFAULT 'discovering',
    \`total_urls\` numeric DEFAULT 0,
    \`inspected_count\` numeric DEFAULT 0,
    \`started_at\` text,
    \`completed_at\` text,
    \`last_batch_date\` text,
    \`error\` text,
    \`summary_stats\` text,
    \`url_sources\` text,
    \`discovered_urls\` text,
    \`inspection_results\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("gsc_indexing_audits_client_idx", "CREATE INDEX IF NOT EXISTS `gsc_indexing_audits_client_idx` ON `gsc_indexing_audits` (`client_id`)");
  await run("gsc_indexing_audits_status_idx", "CREATE INDEX IF NOT EXISTS `gsc_indexing_audits_status_idx` ON `gsc_indexing_audits` (`status`)");
  await run("gsc_indexing_audits_created_at_idx", "CREATE INDEX IF NOT EXISTS `gsc_indexing_audits_created_at_idx` ON `gsc_indexing_audits` (`created_at`)");
  await run("gsc_indexing_audits_updated_at_idx", "CREATE INDEX IF NOT EXISTS `gsc_indexing_audits_updated_at_idx` ON `gsc_indexing_audits` (`updated_at`)");
  await run("locked_docs_rels.gsc_indexing_audits_id", "ALTER TABLE `payload_locked_documents_rels` ADD `gsc_indexing_audits_id` integer");
  await run("gsc_indexing_audits.site_url", "ALTER TABLE `gsc_indexing_audits` ADD `site_url` text");

  // ── Contracts (e-signature flow) ──
  await run("contracts", `CREATE TABLE IF NOT EXISTS \`contracts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`contract_title\` text NOT NULL,
    \`proposal_id\` integer,
    \`client_id\` integer,
    \`client_name\` text NOT NULL,
    \`client_email\` text NOT NULL,
    \`contract_date\` text,
    \`contract_start_date\` text,
    \`monthly_price\` numeric,
    \`setup_fee\` numeric,
    \`retainer_amount\` numeric,
    \`contract_term\` text,
    \`payment_terms\` text,
    \`scope_of_work\` text,
    \`agency_signer_name\` text,
    \`agency_signer_title\` text,
    \`agency_signature\` text,
    \`agency_signed_at\` text,
    \`agency_signed_ip\` text,
    \`client_signer_name\` text,
    \`client_signature\` text,
    \`client_signed_at\` text,
    \`client_signed_ip\` text,
    \`signed_pdf_url\` text,
    \`pdf_hash\` text,
    \`status\` text DEFAULT 'draft',
    \`signing_token\` text,
    \`signing_token_expires_at\` text,
    \`sent_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`);
  await run("contracts_proposal_idx", "CREATE INDEX IF NOT EXISTS `contracts_proposal_idx` ON `contracts` (`proposal_id`)");
  await run("contracts_client_idx", "CREATE INDEX IF NOT EXISTS `contracts_client_idx` ON `contracts` (`client_id`)");
  await run("contracts_signing_token_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `contracts_signing_token_idx` ON `contracts` (`signing_token`)");
  await run("contracts_status_idx", "CREATE INDEX IF NOT EXISTS `contracts_status_idx` ON `contracts` (`status`)");
  await run("contracts_created_at_idx", "CREATE INDEX IF NOT EXISTS `contracts_created_at_idx` ON `contracts` (`created_at`)");
  await run("contracts_updated_at_idx", "CREATE INDEX IF NOT EXISTS `contracts_updated_at_idx` ON `contracts` (`updated_at`)");
  await run("locked_docs_rels.contracts_id", "ALTER TABLE `payload_locked_documents_rels` ADD `contracts_id` integer");

  // Contract fields on clients
  await run("clients.signed_contract_url", "ALTER TABLE `clients` ADD `signed_contract_url` text");
  await run("clients.signed_contract_id", "ALTER TABLE `clients` ADD `signed_contract_id` integer REFERENCES `contracts`(`id`) ON DELETE set null");

  // ── New contract columns (2026-03-05) ──
  await run("contracts.client_title", "ALTER TABLE `contracts` ADD `client_title` text");
  await run("contracts.client_phone", "ALTER TABLE `contracts` ADD `client_phone` text");
  await run("contracts.client_website", "ALTER TABLE `contracts` ADD `client_website` text");
  await run("contracts.agency_contact_name", "ALTER TABLE `contracts` ADD `agency_contact_name` text");
  await run("contracts.agency_contact_email", "ALTER TABLE `contracts` ADD `agency_contact_email` text");
  await run("contracts.agency_contact_phone", "ALTER TABLE `contracts` ADD `agency_contact_phone` text");
  await run("contracts.monthly_retainer", "ALTER TABLE `contracts` ADD `monthly_retainer` numeric");
  await run("contracts.client_contact_name", "ALTER TABLE `contracts` ADD `client_contact_name` text");
  await run("contracts.pricing_notes", "ALTER TABLE `contracts` ADD `pricing_notes` text");
  await run("contracts.payment_terms_override", "ALTER TABLE `contracts` ADD `payment_terms_override` text");

  // ── Contract signature upload + template flag (2026-03-05) ──
  // agency_signature changed from text (base64) to upload FK (media)
  // DROP COLUMN requires SQLite 3.35+ / libSQL
  await run("contracts.drop_agency_signature_text", "ALTER TABLE `contracts` DROP COLUMN `agency_signature`");
  await run("contracts.agency_signature_id", "ALTER TABLE `contracts` ADD `agency_signature_id` integer REFERENCES `media`(`id`) ON DELETE set null");
  await run("contracts.agency_signature_idx", "CREATE INDEX IF NOT EXISTS `contracts_agency_signature_idx` ON `contracts` (`agency_signature_id`)");
  await run("contracts.is_template", "ALTER TABLE `contracts` ADD `is_template` integer DEFAULT 0");
  await run("contracts.pdf_hash", "ALTER TABLE `contracts` ADD `pdf_hash` text");

  let allTables: string[] = [];
  try {
    const tablesResult = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    allTables = tablesResult.rows.map((r: any) => r.name || r[0]);
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, version: "2026-03-05-contracts-v2", results, allTables });
}
