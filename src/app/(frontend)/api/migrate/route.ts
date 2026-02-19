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

  // --- Clean up dev migration records that cause interactive prompts ---
  await run("clean_dev_migrations", "DELETE FROM `payload_migrations` WHERE `batch` = -1");

  // --- Ensure Payload's registered migration is marked as executed ---
  // Without this row, Payload thinks migrations are pending and blocks all writes.
  await run("mark_migration_executed", `INSERT OR IGNORE INTO \`payload_migrations\` (\`name\`, \`batch\`, \`created_at\`, \`updated_at\`) VALUES ('20260210_034208_add_client_analysis_fields', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

  // --- One-time blog import (skips if slugs already exist) ---
  const blogPosts = [
    {
      title: "5 reasons your digital marketing isn't working",
      slug: "5-reasons-your-digital-marketing-isnt-working",
      author: "Peter Tu",
      excerpt: "Before you spend more on ads, make sure these five fundamentals are in place. Most digital marketing failures come down to these common issues.",
      publishedDate: "2025-07-28",
      imageAlt: "Five broken chain links representing common digital marketing mistakes including poor targeting, disconnected analytics, and missing conversion tracking",
      tags: ["Digital Growth & Strategy", "Conversion Optimisation & UX"],
      imageUrl: "https://www.optimisedigital.online/images/blog/five-reasons-digital-marketing-not-working.webp",
    },
    {
      title: "Deciding your Google Ads budget: a guide for small to medium business owners",
      slug: "deciding-your-google-ads-budget",
      author: "Peter Tu",
      excerpt: "Determining your Google Ads budget doesn't have to be complicated. Follow these seven steps to set a budget that works for your business.",
      publishedDate: "2023-06-04",
      imageAlt: "Google Ads budget planning illustration showing calculator, coins allocated into campaign buckets, and budget distribution pie chart",
      tags: ["Google Ads", "Digital Marketing Spend"],
      imageUrl: "https://www.optimisedigital.online/images/blog/google-ads-budget-planning.webp",
    },
    {
      title: "What is the difference between digital marketing and traditional marketing?",
      slug: "digital-marketing-vs-traditional-marketing",
      author: "Peter Tu",
      excerpt: "Understanding the key differences between digital and traditional marketing helps you make smarter decisions about where to invest your marketing budget.",
      publishedDate: "2023-06-03",
      imageAlt: "Split-screen comparison of digital marketing with analytics dashboard, social media, and search on the left versus traditional marketing with newspaper, billboard, TV, and radio on the right",
      tags: ["Marketing Trends & Insights", "Digital Growth & Strategy"],
      imageUrl: "https://www.optimisedigital.online/images/blog/digital-marketing-vs-traditional-marketing.webp",
    },
    {
      title: "How much can digital marketing impact your business?",
      slug: "how-much-can-digital-marketing-impact-your-business",
      author: "Peter Tu",
      excerpt: "Digital marketing effectiveness varies by business type. Results range from minimal to transformative depending on your model and readiness.",
      publishedDate: "2025-05-11",
      imageAlt: "MacBook Pro on a modern office desk displaying a marketing analytics dashboard with lead generation growth chart and total leads metric",
      tags: ["Digital Growth & Strategy", "Digital Marketing Spend"],
      imageUrl: "https://www.optimisedigital.online/images/blog/digital-marketing-business-growth-impact.webp",
    },
    {
      title: "Where should I invest my money if I want to grow my business?",
      slug: "where-to-invest-money-to-grow-your-business",
      author: "Peter Tu",
      excerpt: "Choosing between performance marketing and brand marketing? Here's how to think about allocating your marketing budget for sustainable growth.",
      publishedDate: "2023-03-22",
      imageAlt: "Business owner at her desk reviewing marketing budget allocation charts and growth reports on laptop and printed documents",
      tags: ["Digital Marketing Spend", "Performance Marketing"],
      imageUrl: "https://www.optimisedigital.online/images/blog/business-investment-growth-planning.webp",
    },
    {
      title: "Why your digital marketing isn't working anymore",
      slug: "why-your-digital-marketing-isnt-working-anymore",
      author: "Peter Tu",
      excerpt: "Digital marketing has changed. Rising ad costs, privacy updates, and shifting customer behaviour have made it harder to get results.",
      publishedDate: "2025-07-28",
      imageAlt: "Young professional woman looking up thoughtfully from her MacBook Pro while considering why her digital marketing strategy is not delivering results",
      tags: ["Digital Growth & Strategy", "Marketing Trends & Insights"],
      imageUrl: "https://www.optimisedigital.online/images/blog/why-digital-marketing-is-not-working.webp",
    },
  ];

  const blogMarkdown: Record<string, string> = {
    "5-reasons-your-digital-marketing-isnt-working": "If your digital marketing isn't delivering results, you're not alone. But before you throw more money at the problem, it's worth examining whether you've got the fundamentals right. Here are five common reasons digital marketing fails, and what to fix first.\n\n## 1. Your Website Isn't Built to Convert\n\nYou can drive all the traffic in the world to your website, but if it's not built to convert, you're wasting your money.\n\nSigns your site isn't conversion-ready:\n- Slow loading speeds (especially on mobile)\n- Poor mobile experience\n- Unclear calls-to-action\n- Confusing navigation\n- No clear user journey\n\n**The fix:** Before investing in more traffic, invest in your website. Speed it up, simplify the user journey, and make it crystal clear what action you want visitors to take.\n\n## 2. You're Neglecting SEO and Organic Visibility\n\nPaid advertising gets all the attention, but SEO remains one of the most valuable long-term investments you can make.\n\nWhy SEO matters:\n- It compounds over time\n- It reduces advertising dependency\n- It builds trust before customers even click\n- It captures high-intent search traffic\n\n**The fix:** Start ranking for the queries your customers are searching. Build helpful content that establishes your expertise. SEO takes time, but the results are worth the wait.\n\n## 3. You're Over-Relying on Unoptimised Ads\n\nToo many businesses treat advertising as their entire strategy rather than one component of it. Worse, they run generic boosted posts or send all traffic to their homepage.\n\nCommon advertising mistakes:\n- Boosting posts without a strategy\n- Sending ad traffic to your homepage instead of relevant landing pages\n- No conversion tracking set up\n- Not testing different audiences or creative\n\n**The fix:** View ads as fuel, not a crutch. Every ad should have a specific purpose, a relevant landing page, and proper tracking. Test, measure, and optimise continuously.\n\n## 4. You're Not Building Enough Trust\n\nPeople buy from businesses they trust. If you're not actively building trust throughout your marketing, you're leaving conversions on the table.\n\nTrust signals that matter:\n- Customer reviews and testimonials\n- Case studies with real results\n- Industry credentials and certifications\n- Social proof across all channels\n\n**The fix:** Display trust signals prominently. Collect and showcase reviews. Share customer success stories. Make it easy for prospects to see that others have had positive experiences with you.\n\n## 5. You Have Weak Customer Retention\n\nAcquisition gets all the glory, but retention is where the real growth happens. Keeping customers is cheaper and far more effective than constantly chasing new ones.\n\nWhy retention matters:\n- Repeat customers spend more\n- They refer others\n- Lower cost than acquisition\n- Higher lifetime value\n\n**The fix:** Don't neglect existing customers in pursuit of new ones. Build email sequences, loyalty programs, and ongoing communication that keeps customers coming back.\n\n## The Bottom Line\n\nBefore you invest heavily in paid advertising, make sure your foundations are solid. A leaky bucket won't hold water no matter how fast you pour it in.\n\nGet these five elements right, and your paid campaigns will work much harder for you.",
    "deciding-your-google-ads-budget": "One of the most common questions small to medium business owners ask is: \"How much should I spend on Google Ads?\" It's a fair question, and the answer requires careful consideration of several factors.\n\n## Seven Steps to Setting Your Google Ads Budget\n\n### 1. Define Your Goals\n\nBefore allocating any budget, clarify what you're trying to achieve:\n- Sales and revenue\n- Lead generation\n- Website traffic\n- Brand awareness\n\nEach goal requires a different approach and potentially different budget levels. Be specific about what success looks like for your business.\n\n### 2. Assess Your Financial Capacity\n\nEvaluate what your business can sustainably invest while maintaining profitability and stability. Google Ads should be an investment that generates returns, not a financial strain.\n\nConsider:\n- Your overall marketing budget\n- Cash flow requirements\n- How long you can sustain spend before seeing returns\n\n### 3. Start With a Test Budget\n\nBegin modestly to gather performance data and validate strategies before committing substantial resources. There's no point spending big until you know what works.\n\nA test budget allows you to:\n- Understand your cost-per-click in your industry\n- Test different keywords and ad copy\n- Identify which campaigns show promise\n- Learn without significant financial risk\n\n### 4. Research Industry Competition\n\nDifferent sectors have varying cost-per-click rates. Understanding your competitive landscape helps set realistic expectations.\n\nSome industries (legal, insurance, finance) have very high CPCs, while others are more affordable. Know what you're getting into before you commit.\n\n### 5. Calculate Your Maximum CPA\n\nDetermine your maximum cost per acquisition by analysing:\n- Your conversion rates\n- Customer lifetime value\n- Profit margins\n\nIf a customer is worth $500 to your business and you need a 3x return, your maximum CPA is roughly $165. Work backwards from the value a customer brings.\n\n### 6. Monitor and Optimise\n\nTrack metrics including:\n- Click-through rates (CTR)\n- Conversion rates\n- Cost per conversion\n- Return on ad spend (ROAS)\n\nUse this data to continuously refine your campaigns. The businesses that win with Google Ads are those that obsess over optimisation.\n\n### 7. Test and Scale\n\nGradually increase budgets for successful campaigns that demonstrate positive returns. At the same time, continue testing new strategies, keywords, and ad variations.\n\nDon't put all your budget into one campaign. Maintain a testing budget to discover new opportunities.\n\n## Key Takeaway\n\nBudget allocation should be an ongoing process, allowing for adjustments and optimisations based on real-time data. Start conservatively, measure everything, and scale what works.\n\nThe right budget isn't a fixed number. It's the amount that generates profitable returns for your specific business.",
    "digital-marketing-vs-traditional-marketing": "Small-to-medium business owners increasingly favour digital channels for growth and expansion. But understanding the differences between digital and traditional marketing helps you make informed decisions about where to invest.\n\n## Traditional Marketing: The Conventional Approach\n\nTraditional marketing encompasses the promotional methods that existed before the internet era:\n- Newspapers and magazines\n- Television and radio\n- Billboards and signage\n- Direct mail\n- Flyers and brochures\n\n### Characteristics of Traditional Marketing\n\n**Broad reach through offline channels** - Traditional media can reach large audiences, but targeting is limited to general demographics like geographic area or publication readership.\n\n**High costs** - Media placement and production costs for TV commercials, print ads, or billboard space can be substantial, often putting them out of reach for smaller businesses.\n\n**One-directional communication** - Traditional marketing is primarily broadcast messaging. You speak, the audience listens, but there's limited opportunity for dialogue.\n\n**Slow feedback loops** - Measuring effectiveness is difficult and delayed. You might wait weeks or months to understand if a campaign worked, making real-time adjustments impossible.\n\n## Digital Marketing: The Modern Approach\n\nDigital marketing leverages online platforms and technologies:\n- Websites and SEO\n- Search engine advertising\n- Social media marketing\n- Email marketing\n- Content marketing\n\n### Characteristics of Digital Marketing\n\n**Precise audience targeting** - Target based on demographics, interests, behaviours, search intent, and more. Reach exactly who you want to reach.\n\n**Flexible budgeting** - Start small and scale up. Adjust spending in real-time based on performance. No minimum commitments like traditional media buys.\n\n**Real-time analytics** - See immediately what's working and what isn't. Make data-driven decisions and optimise continuously.\n\n**Interactive engagement** - Two-way communication builds relationships. Respond to comments, answer questions, and create dialogue with your audience.\n\n## Key Differences at a Glance\n\n| Dimension | Traditional | Digital |\n|-----------|-------------|--------|\n| **Reach** | Broad audience | Precise targeting |\n| **Cost** | Generally expensive | Cost-effective, scalable |\n| **Measurement** | Difficult, delayed | Real-time tracking |\n| **Interaction** | One-way communication | Two-way engagement |\n| **Flexibility** | Fixed once placed | Adjustable anytime |\n| **Speed** | Slow to deploy | Immediate deployment |\n\n## Which Is Right for Your Business?\n\nWhile traditional marketing maintains relevance for certain goals (brand awareness, local presence, older demographics), digital marketing provides superior advantages for most modern businesses:\n\n- Lower barrier to entry\n- Better targeting capabilities\n- Measurable results\n- Ability to optimise in real-time\n- Direct customer engagement\n\nFor small to medium businesses seeking growth and strong online presence, digital marketing typically offers the best return on investment.\n\nThat said, the best approach for your business depends on your specific audience, goals, and industry. Sometimes a blend of both works best.",
    "how-much-can-digital-marketing-impact-your-business": "One of the most common questions we hear is \"how much can digital marketing actually impact my business?\" The honest answer: it depends. Results range from minimal to transformative depending on several key factors.\n\n## The Impact Spectrum\n\nDigital marketing effectiveness isn't uniform. Six factors influence how much impact you can expect:\n\n1. **Type of business** - Some business models are naturally better suited to digital\n2. **Scale of delivery** - Local, national, or online operations each have different potential\n3. **Business maturity** - Established demand vs building awareness from scratch\n4. **Product or service quality** - Marketing amplifies what you have, good or bad\n5. **Operational capacity** - Can you handle increased demand?\n6. **Marketing goals** - Leads, sales, awareness, or loyalty all require different approaches\n\n## Matching Goals to Channels\n\nDifferent business goals align with different digital marketing channels:\n\n| Goal | Recommended Channels |\n|------|---------------------|\n| Phone calls | Local SEO, Google Ads |\n| Store visits | Google Maps, organic rankings |\n| Free trials | Lead forms, email, retargeting |\n| Lead generation | Typeform, Meta Lead Ads, LinkedIn |\n| Bookings | Booking flows, automation |\n| Purchases | CRO, Search, Social ads |\n\n## Growth Strategies at Every Stage\n\n### Stage 1: Free Growth\n\nBefore spending anything, exhaust these options:\n- Network outreach and referrals\n- Social media posting (organic)\n- Competitor research\n- Cold outreach\n\n### Stage 2: Foundations Without Paid Spend\n\nBuild your infrastructure before advertising:\n- Technical SEO improvements\n- Website usability enhancements\n- Content strategy development\n- Lead magnets (eBooks, calculators, guides)\n- Email automation setup\n- CRM implementation\n- Google Business Profile optimisation\n- Referral systems\n- Performance tracking\n\n### Stage 3: Paid Digital Growth\n\nOnce foundations are solid, scale with paid:\n- Google Ads (Search, Shopping, Display)\n- Meta/Instagram advertising\n- LinkedIn campaigns (B2B)\n- TikTok campaigns\n- YouTube video ads\n- Affiliate and influencer marketing\n\n## Critical Questions Before Investing\n\nBefore committing budget, honestly evaluate:\n\n1. **Does advertising align with your business model?** - Not every business benefits equally from digital advertising\n2. **Does your website serve customer needs?** - Traffic to a poor website is wasted\n3. **What actions should visitors take?** - Clear conversion paths are essential\n4. **Do digital channels generate actual demand?** - Is your audience searching online?\n5. **What's your customer lifetime value?** - This determines how much you can spend to acquire\n6. **What's the realistic ROI potential?** - Be honest about expected returns\n\n## The Bottom Line\n\nWe focus our resources on businesses where measurable growth is achievable. Not every business is ready for digital marketing investment, and that's okay.\n\nReadiness and alignment are essential prerequisites for success. Get the foundations right, answer the hard questions honestly, and you'll be in a much better position to see real impact from your digital marketing efforts.",
    "where-to-invest-money-to-grow-your-business": "One of the most fundamental questions for small to medium-sized business owners is how to allocate marketing budget between different approaches. Should you focus on immediate results or long-term brand building?\n\n## Performance Marketing vs Brand Marketing\n\nUnderstanding these two approaches is essential for making smart investment decisions.\n\n### Performance Marketing\n\nPerformance marketing focuses on measurable results, such as conversions and sales, through targeted digital channels. You can track every dollar spent and its return.\n\nExamples include:\n- Google Ads\n- Facebook/Instagram advertising\n- Retargeting campaigns\n- Affiliate marketing\n\n**Pros:** Measurable, scalable, immediate results\n**Cons:** Stops working when you stop spending, can become expensive over time\n\n### Brand Marketing\n\nBrand marketing emphasises building a strong brand identity and emotional connection with consumers through consistent messaging. It's about creating long-term value and recognition.\n\nExamples include:\n- Content marketing\n- PR and media coverage\n- Sponsorships\n- Social media presence (organic)\n\n**Pros:** Compounds over time, builds lasting value, reduces acquisition costs long-term\n**Cons:** Harder to measure, takes longer to show results\n\n## The Recommended Approach\n\nRather than choosing one approach exclusively, blend both strategies. A suggested starting allocation:\n\n- **60% Performance Marketing** - Drive immediate results and revenue\n- **40% Brand Marketing** - Build long-term value and recognition\n\nThis ratio should adjust based on your individual business circumstances, goals, and stage of growth.\n\n## Strategic Progression\n\nYour approach should evolve as your business matures:\n\n### Early Stage\nNewer businesses should prioritise brand establishment initially. Build credibility, define your positioning, and create awareness before optimising for immediate conversions.\n\n### Growth Stage\nAs you accumulate operational data and market presence, transition toward more performance-driven tactics. You'll have the brand foundation to support conversion-focused campaigns.\n\n### Mature Stage\nEstablished businesses can be more aggressive with performance marketing while maintaining brand investments to protect market position.\n\n## Start Small, Scale What Works\n\nThe key principle: start modestly and scale investment based on demonstrated results rather than committing large budgets upfront.\n\nTest different channels and approaches with small budgets. Double down on what works. Cut what doesn't. This iterative approach minimises risk while maximising learning.\n\n## The Bottom Line\n\nThere's no one-size-fits-all answer to marketing investment. The right allocation depends on your business stage, industry, competitive landscape, and goals.\n\nWhat matters most is having a clear strategy, measuring results, and adjusting based on data rather than gut feeling.",
    "why-your-digital-marketing-isnt-working-anymore": "Digital marketing isn't broken. It's simply evolved. Many businesses face declining returns from previously reliable tactics like paid search and social advertising. Understanding why this has happened is the first step to fixing it.\n\n## The Major Changes in Digital Marketing\n\nThe digital marketing landscape has shifted dramatically in recent years. Here are the four most significant changes:\n\n### 1. Privacy Updates Have Limited Targeting\n\nApple's iOS 14 privacy updates have significantly limited Meta ad targeting capabilities. Users can now opt out of tracking, which means advertisers have less data to work with when building audiences.\n\n### 2. Algorithm Changes Prioritise Quality\n\nGoogle's algorithm now prioritises helpful content over SEO shortcuts. The days of keyword stuffing and thin content are over. Search engines want to surface content that genuinely helps users.\n\n### 3. Longer Buyer Journeys\n\nCustomers now take longer to make purchasing decisions. The instant conversion is becoming rarer as buyers do more research, compare more options, and take their time before committing.\n\n### 4. Reduced Organic Reach\n\nSocial platforms increasingly favour paid content over organic posts. Building an audience through organic reach alone is harder than ever.\n\n## What Still Works\n\nSuccess in today's digital marketing environment requires a different approach:\n\n- **Strong product-market fit** - No amount of marketing can fix a product people don't want\n- **Platform-native, audience-relevant content** - Content that feels natural to each platform\n- **Full-funnel strategy** - From discovery through retention, not just acquisition\n- **Focus on customer lifetime value** - Long-term relationships over one-time sales\n- **Brand building and trust signals** - Credibility matters more than ever\n\n## The Right Approach\n\nBefore spending on paid advertising, audit these foundational elements:\n\n1. **Offer clarity and appeal** - Is what you're selling clearly communicated and genuinely attractive?\n2. **Website conversion capacity** - Can your site actually convert the traffic you send to it?\n3. **Trust-building content** - Do you have content that builds credibility with potential customers?\n4. **Navigation and funnel guidance** - Is it easy for visitors to take the next step?\n\n## Start With the Foundations\n\nWe recommend prioritising SEO and conversion rate optimisation as foundational elements before scaling paid media. These investments compound over time and reduce your dependence on increasingly expensive advertising platforms.\n\nThe businesses seeing the best results aren't those spending the most. They're the ones who've built solid foundations first.",
  };

  const blogImportResults: { slug: string; status: string; error?: string }[] = [];
  for (const post of blogPosts) {
    try {
      const existing = await payload.find({
        collection: "blog-posts",
        where: { slug: { equals: post.slug } },
        limit: 1,
      });
      if (existing.docs.length > 0) {
        blogImportResults.push({ slug: post.slug, status: "skipped (exists)" });
        continue;
      }

      // Download image from the live website
      let featuredImageId: number | undefined;
      try {
        const imgRes = await fetch(post.imageUrl);
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const fileName = post.imageUrl.split("/").pop() || "image.webp";
          const media = await payload.create({
            collection: "media",
            data: { alt: post.imageAlt },
            file: { data: imgBuffer, name: fileName, mimetype: "image/webp", size: imgBuffer.length },
          });
          featuredImageId = media.id;
        }
      } catch { /* image upload failed, continue without */ }

      await payload.create({
        collection: "blog-posts",
        data: {
          title: post.title,
          slug: post.slug,
          author: post.author,
          excerpt: post.excerpt,
          publishedDate: post.publishedDate,
          markdownContent: blogMarkdown[post.slug] || "",
          featuredImage: featuredImageId || undefined,
          featuredImageAlt: post.imageAlt,
          tags: post.tags,
          client: 1,
          clientConfirmed: true,
          status: "published",
          _status: "published",
        },
      });
      blogImportResults.push({ slug: post.slug, status: "created" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      blogImportResults.push({ slug: post.slug, status: "error", error: msg });
    }
  }
  results.push(`BLOG_IMPORT: ${JSON.stringify(blogImportResults)}`);

  // --- Schema diagnostics ---
  const tables = ["media", "clients", "clients_google_maps_urls", "client_proposals", "client_proposals_competitors", "client_proposals_competitors_meta_ad_screenshots", "client_proposals_competitors_google_ad_screenshots", "client_proposals_rels", "client_proposals_visible_slides", "client_proposals_keyword_categories", "client_proposals_flight_plan_images", "client_proposals_mission_resources_images", "client_proposals_google_maps_urls", "payload_locked_documents_rels", "content_researches", "blog_posts", "_blog_posts_v", "blog_posts_rels", "_blog_posts_v_rels"];
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

  return NextResponse.json({ ok: true, results, schema, migrations, allTables });
}
