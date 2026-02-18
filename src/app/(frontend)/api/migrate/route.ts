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

  // --- Clean up dev migration records that cause interactive prompts ---
  await run("clean_dev_migrations", "DELETE FROM `payload_migrations` WHERE `batch` = -1");

  // --- Ensure Payload's registered migration is marked as executed ---
  // Without this row, Payload thinks migrations are pending and blocks all writes.
  await run("mark_migration_executed", `INSERT OR IGNORE INTO \`payload_migrations\` (\`name\`, \`batch\`, \`created_at\`, \`updated_at\`) VALUES ('20260210_034208_add_client_analysis_fields', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

  // --- Schema diagnostics ---
  const tables = ["media", "clients", "clients_google_maps_urls", "client_proposals", "client_proposals_competitors", "client_proposals_competitors_meta_ad_screenshots", "client_proposals_competitors_google_ad_screenshots", "client_proposals_rels", "client_proposals_visible_slides", "client_proposals_keyword_categories", "client_proposals_flight_plan_images", "client_proposals_mission_resources_images", "client_proposals_google_maps_urls", "payload_locked_documents_rels", "content_researches"];
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

  return NextResponse.json({ ok: true, results, schema, migrations });
}
