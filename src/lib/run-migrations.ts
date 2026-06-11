import type { Payload } from "payload";

/**
 * One result row per `run()` call inside `runMigrations`.
 * Mirrors the OK/SKIP/ERROR semantics the legacy `/api/migrate` POST response
 * exposed so any tooling parsing those response strings keeps working.
 */
export type MigrationResult = {
  label: string;
  status: "ok" | "skip" | "error";
  message?: string;
};

/**
 * Run the full idempotent CREATE TABLE / ALTER TABLE sweep that brings the
 * underlying SQLite (Turso/libSQL) database up to the schema the current
 * Payload config expects.
 *
 * Designed to be called from two places:
 *  - `POST /api/migrate` — the manual escape hatch (auth-gated).
 *  - Payload `onInit` — auto-heal on every cold lambda start so a deploy
 *    that adds tables/columns doesn't leave production with a stale schema.
 *
 * Contract:
 *  - **Never throws.** A fatal error becomes a single
 *    `{ status: 'error', message }` entry. If `onInit` propagated an error,
 *    Payload wouldn't start, which is strictly worse than running with
 *    stale-but-functional schema.
 *  - Each individual statement is wrapped: `already exists` /
 *    `duplicate column` collapses to `skip`, anything else is `error`.
 *  - Statement order matches the legacy POST handler exactly — some ALTERs
 *    depend on prior CREATEs.
 */
export async function runMigrations(
  payload: Payload,
  opts?: { onProgress?: (result: MigrationResult) => void },
): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  const client = (payload.db as unknown as { client?: { execute: (sql: string) => Promise<unknown> } }).client;
  if (!client) {
    const r: MigrationResult = { label: "init", status: "error", message: "No LibSQL client" };
    opts?.onProgress?.(r);
    results.push(r);
    return results;
  }

  async function run(
    label: string,
    statement: string,
    // Per-statement allow-list of error-message substrings that mean "this
    // one-time migration is already applied on this database" and should be
    // reported as `skip`, not `error`. Used for statements whose idempotency
    // can't be expressed with IF [NOT] EXISTS (e.g. RENAME whose target already
    // exists or whose source table is already gone). Kept per-call rather than
    // global so genuine `no such table` / constraint failures in OTHER
    // migrations still surface as errors.
    okErrors?: string[],
  ): Promise<void> {
    let r: MigrationResult;
    try {
      await client!.execute(statement);
      r = { label, status: "ok" };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        r = { label, status: "skip", message: "already exists" };
      } else if (msg.includes("no such column") || msg.includes("no column named")) {
        // Idempotent DROP COLUMN / UPDATE on a column that's already gone.
        // Treat as a successful no-op so re-runs don't spam errors.
        r = { label, status: "skip", message: "column already removed" };
      } else if (okErrors?.some((substr) => msg.includes(substr))) {
        // Known-idempotent statement whose "already applied" signal isn't one
        // of the generic cases above. Re-runs are expected no-ops.
        r = { label, status: "skip", message: "already applied" };
      } else {
        r = { label, status: "error", message: msg };
      }
    }
    opts?.onProgress?.(r);
    results.push(r);
  }

  try {
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
    await run("clients.client_type", "ALTER TABLE `clients` ADD `client_type` text DEFAULT 'recurring'");
    await run("clients_services", `CREATE TABLE IF NOT EXISTS \`clients_services\` (
      \`order\` integer NOT NULL,
      \`parent_id\` integer NOT NULL,
      \`value\` text,
      \`id\` integer PRIMARY KEY NOT NULL,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_services_order_idx", "CREATE INDEX IF NOT EXISTS `clients_services_order_idx` ON `clients_services` (`order`)");
    await run("clients_services_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_services_parent_id_idx` ON `clients_services` (`parent_id`)");

    // --- Client Pulse leadership config ---
    await run("clients.client_pulse_enabled", "ALTER TABLE `clients` ADD `client_pulse_enabled` integer DEFAULT false");
    await run("clients.client_pulse_priority", "ALTER TABLE `clients` ADD `client_pulse_priority` text DEFAULT 'normal'");
    await run("clients.client_pulse_primary_target", "ALTER TABLE `clients` ADD `client_pulse_primary_target` text DEFAULT 'traffic'");
    await run("clients.client_pulse_target_label", "ALTER TABLE `clients` ADD `client_pulse_target_label` text");
    await run("clients.client_pulse_target_value", "ALTER TABLE `clients` ADD `client_pulse_target_value` numeric");
    await run("clients.client_pulse_target_unit", "ALTER TABLE `clients` ADD `client_pulse_target_unit` text DEFAULT 'custom'");
    await run("clients.client_pulse_target_direction", "ALTER TABLE `clients` ADD `client_pulse_target_direction` text DEFAULT 'increase'");
    await run("clients.client_pulse_comparison_window", "ALTER TABLE `clients` ADD `client_pulse_comparison_window` text DEFAULT 'last_90_days'");
    await run("clients.client_pulse_neglect_warning_days", "ALTER TABLE `clients` ADD `client_pulse_neglect_warning_days` numeric DEFAULT 14");
    await run("clients.client_pulse_neglect_critical_days", "ALTER TABLE `clients` ADD `client_pulse_neglect_critical_days` numeric DEFAULT 30");
    await run("clients.client_pulse_notes", "ALTER TABLE `clients` ADD `client_pulse_notes` text");
    await run("clients_client_pulse_services_tracked", `CREATE TABLE IF NOT EXISTS \`clients_client_pulse_services_tracked\` (
      \`order\` integer NOT NULL,
      \`parent_id\` integer NOT NULL,
      \`value\` text,
      \`id\` integer PRIMARY KEY NOT NULL,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_client_pulse_services_tracked_order_idx", "CREATE INDEX IF NOT EXISTS `clients_client_pulse_services_tracked_order_idx` ON `clients_client_pulse_services_tracked` (`order`)");
    await run("clients_client_pulse_services_tracked_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_client_pulse_services_tracked_parent_id_idx` ON `clients_client_pulse_services_tracked` (`parent_id`)");
    await run("clients_client_pulse_analytics_metrics", `CREATE TABLE IF NOT EXISTS \`clients_client_pulse_analytics_metrics\` (
      \`order\` integer NOT NULL,
      \`parent_id\` integer NOT NULL,
      \`value\` text,
      \`id\` integer PRIMARY KEY NOT NULL,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_client_pulse_analytics_metrics_order_idx", "CREATE INDEX IF NOT EXISTS `clients_client_pulse_analytics_metrics_order_idx` ON `clients_client_pulse_analytics_metrics` (`order`)");
    await run("clients_client_pulse_analytics_metrics_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_client_pulse_analytics_metrics_parent_id_idx` ON `clients_client_pulse_analytics_metrics` (`parent_id`)");
    await run("client_pulse_history", `CREATE TABLE IF NOT EXISTS "client_pulse_history" (
      "id" integer PRIMARY KEY NOT NULL,
      "client_id" integer NOT NULL,
      "date" text NOT NULL,
      "score" numeric NOT NULL,
      "status" text NOT NULL,
      "label" text,
      "organic_score" numeric,
      "paid_search_score" numeric,
      "service_coverage_score" numeric,
      "neglect_score" numeric,
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_pulse_history_client_idx", "CREATE INDEX IF NOT EXISTS `client_pulse_history_client_idx` ON `client_pulse_history` (`client_id`)");
    await run("client_pulse_history_date_idx", "CREATE INDEX IF NOT EXISTS `client_pulse_history_date_idx` ON `client_pulse_history` (`date`)");
    await run("client_pulse_history_client_date_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `client_pulse_history_client_date_idx` ON `client_pulse_history` (`client_id`, `date`)");
    await run("client_pulse_history_updated_at_idx", "CREATE INDEX IF NOT EXISTS `client_pulse_history_updated_at_idx` ON `client_pulse_history` (`updated_at`)");
    await run("client_pulse_history_created_at_idx", "CREATE INDEX IF NOT EXISTS `client_pulse_history_created_at_idx` ON `client_pulse_history` (`created_at`)");
    await run("payload_locked_documents_rels.client_pulse_history_id", "ALTER TABLE `payload_locked_documents_rels` ADD `client_pulse_history_id` integer REFERENCES `client_pulse_history`(`id`) ON DELETE CASCADE");

    // --- Google Ads automation client config ---
    await run("clients.gads_auto_match_type_monitor_exact", "ALTER TABLE `clients` ADD `gads_auto_match_type_monitor_exact` integer DEFAULT true");
    await run("clients.gads_auto_match_type_monitor_phrase", "ALTER TABLE `clients` ADD `gads_auto_match_type_monitor_phrase` integer DEFAULT true");
    await run("gads_mtm_allowlist", `CREATE TABLE IF NOT EXISTS \`gads_mtm_allowlist\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`scope\` text DEFAULT 'campaign' NOT NULL,
      \`pattern\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("gads_mtm_allowlist_order_idx", "CREATE INDEX IF NOT EXISTS `gads_mtm_allowlist_order_idx` ON `gads_mtm_allowlist` (`_order`)");
    await run("gads_mtm_allowlist_parent_id_idx", "CREATE INDEX IF NOT EXISTS `gads_mtm_allowlist_parent_id_idx` ON `gads_mtm_allowlist` (`_parent_id`)");
    await run("gads_report_emails", `CREATE TABLE IF NOT EXISTS \`gads_report_emails\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`email\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("gads_report_emails_order_idx", "CREATE INDEX IF NOT EXISTS `gads_report_emails_order_idx` ON `gads_report_emails` (`_order`)");
    await run("gads_report_emails_parent_id_idx", "CREATE INDEX IF NOT EXISTS `gads_report_emails_parent_id_idx` ON `gads_report_emails` (`_parent_id`)");
    await run("gads_weekly_emails", `CREATE TABLE IF NOT EXISTS \`gads_weekly_emails\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`email\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("gads_weekly_emails_order_idx", "CREATE INDEX IF NOT EXISTS `gads_weekly_emails_order_idx` ON `gads_weekly_emails` (`_order`)");
    await run("gads_weekly_emails_parent_id_idx", "CREATE INDEX IF NOT EXISTS `gads_weekly_emails_parent_id_idx` ON `gads_weekly_emails` (`_parent_id`)");

    // --- Core Update Review client config ---
    await run("clients.core_update_review_enabled", "ALTER TABLE `clients` ADD `core_update_review_enabled` integer DEFAULT false");
    await run("clients.core_update_review_max_pages", "ALTER TABLE `clients` ADD `core_update_review_max_pages` numeric DEFAULT 50");
    await run("clients.core_update_review_last_checked_at", "ALTER TABLE `clients` ADD `core_update_review_last_checked_at` text");
    await run("clients.core_update_review_last_email_sent_at", "ALTER TABLE `clients` ADD `core_update_review_last_email_sent_at` text");
    await run("clients.core_update_review_last_update_name", "ALTER TABLE `clients` ADD `core_update_review_last_update_name` text");
    await run("clients_core_update_review_recipient_emails", `CREATE TABLE IF NOT EXISTS \`clients_core_update_review_recipient_emails\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`email\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_core_update_review_recipient_emails_order_idx", "CREATE INDEX IF NOT EXISTS `clients_core_update_review_recipient_emails_order_idx` ON `clients_core_update_review_recipient_emails` (`_order`)");
    await run("clients_core_update_review_recipient_emails_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_core_update_review_recipient_emails_parent_id_idx` ON `clients_core_update_review_recipient_emails` (`_parent_id`)");
    await run("clients_core_update_review_include_update_types", `CREATE TABLE IF NOT EXISTS \`clients_core_update_review_include_update_types\` (
      \`order\` integer NOT NULL,
      \`parent_id\` integer NOT NULL,
      \`value\` text,
      \`id\` integer PRIMARY KEY NOT NULL,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_core_update_review_include_update_types_order_idx", "CREATE INDEX IF NOT EXISTS `clients_core_update_review_include_update_types_order_idx` ON `clients_core_update_review_include_update_types` (`order`)");
    await run("clients_core_update_review_include_update_types_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_core_update_review_include_update_types_parent_id_idx` ON `clients_core_update_review_include_update_types` (`parent_id`)");
  
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
  
    // --- Mission Priorities array table (v2 deck slide 13) ---
    await run("client_proposals_mission_priorities", `CREATE TABLE IF NOT EXISTS \`client_proposals_mission_priorities\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`tag\` text NOT NULL, \`title\` text NOT NULL, \`description\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("mission_priorities_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_mission_priorities_order_idx` ON `client_proposals_mission_priorities` (`_order`)");
    await run("mission_priorities_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_mission_priorities_parent_id_idx` ON `client_proposals_mission_priorities` (`_parent_id`)");
  
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
    // Last-minute manual overrides for the Paid Burn / Competitor Analysis slides.
    // Lets the team flip a competitor's Google/Meta ads status + count without
    // re-running an audit (e.g. when the SERP scraper missed live ads).
    await run("client_proposals_competitors.has_google_ads", "ALTER TABLE `client_proposals_competitors` ADD `has_google_ads` integer DEFAULT false");
    await run("client_proposals_competitors.google_ad_count_override", "ALTER TABLE `client_proposals_competitors` ADD `google_ad_count_override` integer");
    await run("client_proposals_competitors.meta_ad_count_override", "ALTER TABLE `client_proposals_competitors` ADD `meta_ad_count_override` integer");
  
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
  
    // --- Roadmap / Commercial / Launch scalar columns (v2 deck slides 21, 23, 25) ---
    await run("client_proposals.roadmap_template", "ALTER TABLE `client_proposals` ADD `roadmap_template` text DEFAULT 'build-launch'");
    await run("client_proposals.roadmap_meta", "ALTER TABLE `client_proposals` ADD `roadmap_meta` text");
    await run("client_proposals.roadmap_note", "ALTER TABLE `client_proposals` ADD `roadmap_note` text");
    await run("client_proposals.commercial_meta", "ALTER TABLE `client_proposals` ADD `commercial_meta` text");
    await run("client_proposals.commercial_note", "ALTER TABLE `client_proposals` ADD `commercial_note` text");
    await run("client_proposals.launch_meta", "ALTER TABLE `client_proposals` ADD `launch_meta` text");
  
    // --- Roadmap cells array table (v2 deck slide 21) ---
    await run("client_proposals_roadmap_cells", `CREATE TABLE IF NOT EXISTS \`client_proposals_roadmap_cells\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`week\` text NOT NULL, \`step\` text NOT NULL, \`desc\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("roadmap_cells_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_roadmap_cells_order_idx` ON `client_proposals_roadmap_cells` (`_order`)");
    await run("roadmap_cells_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_roadmap_cells_parent_id_idx` ON `client_proposals_roadmap_cells` (`_parent_id`)");
  
    // --- Commercial phases array table (v2 deck slide 23) ---
    await run("client_proposals_commercial_phases", `CREATE TABLE IF NOT EXISTS \`client_proposals_commercial_phases\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`tier\` text NOT NULL, \`name\` text NOT NULL, \`amount\` text NOT NULL,
      \`amount_sub\` text, \`featured\` integer DEFAULT 0,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("commercial_phases_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_commercial_phases_order_idx` ON `client_proposals_commercial_phases` (`_order`)");
    await run("commercial_phases_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_commercial_phases_parent_id_idx` ON `client_proposals_commercial_phases` (`_parent_id`)");
  
    // --- Commercial phases features nested sub-table ---
    await run("client_proposals_commercial_phases_features", `CREATE TABLE IF NOT EXISTS \`client_proposals_commercial_phases_features\` (
      \`_order\` integer NOT NULL, \`_parent_id\` text NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL, \`item\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals_commercial_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("commercial_features_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_commercial_phases_features_order_idx` ON `client_proposals_commercial_phases_features` (`_order`)");
    await run("commercial_features_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_commercial_phases_features_parent_id_idx` ON `client_proposals_commercial_phases_features` (`_parent_id`)");
  
    // --- Launch steps array table (v2 deck slide 25) ---
    await run("client_proposals_launch_steps", `CREATE TABLE IF NOT EXISTS \`client_proposals_launch_steps\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`step_label\` text NOT NULL, \`title\` text NOT NULL, \`body\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("launch_steps_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_launch_steps_order_idx` ON `client_proposals_launch_steps` (`_order`)");
    await run("launch_steps_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_launch_steps_parent_id_idx` ON `client_proposals_launch_steps` (`_parent_id`)");
  
    // --- Launch blocks array table (v2 deck slide 25) ---
    await run("client_proposals_launch_blocks", `CREATE TABLE IF NOT EXISTS \`client_proposals_launch_blocks\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`tag\` text NOT NULL, \`title\` text NOT NULL, \`body\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("launch_blocks_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_launch_blocks_order_idx` ON `client_proposals_launch_blocks` (`_order`)");
    await run("launch_blocks_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_launch_blocks_parent_id_idx` ON `client_proposals_launch_blocks` (`_parent_id`)");
  
    // Rename `desc` -> `body` on roadmap_cells: `desc` is a SQL reserved word
    // that caused 400 errors when Payload queried the client_proposals collection.
    await run("roadmap_cells.rename_desc_to_body", "ALTER TABLE `client_proposals_roadmap_cells` RENAME COLUMN `desc` TO `body`");
  
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

    // --- Acquisition / Referral attribution columns on clients ---
    await run("clients.acquisition_channel", "ALTER TABLE `clients` ADD `acquisition_channel` text");
    await run("clients.acquisition_detail", "ALTER TABLE `clients` ADD `acquisition_detail` text");
    await run("clients.referred_by", "ALTER TABLE `clients` ADD `referred_by` text");
    await run("clients.referred_by_contact", "ALTER TABLE `clients` ADD `referred_by_contact` text");

    // --- Referral Commissions sub-table ---
    await run("clients_referral_commissions", `CREATE TABLE IF NOT EXISTS \`clients_referral_commissions\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`payee_name\` text NOT NULL,
      \`payee_contact\` text,
      \`frequency\` text NOT NULL,
      \`commission_type\` text,
      \`percentage\` numeric,
      \`monthly_amount\` numeric,
      \`one_off_amount\` numeric,
      \`start_date\` text NOT NULL,
      \`end_date\` text,
      \`notes\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_referral_commissions_order_idx", "CREATE INDEX IF NOT EXISTS `clients_referral_commissions_order_idx` ON `clients_referral_commissions` (`_order`)");
    await run("clients_referral_commissions_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_referral_commissions_parent_id_idx` ON `clients_referral_commissions` (`_parent_id`)");
  
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
  
    // --- clients.dashboard_conversion_actions, blog_categories, blog_tags columns ---
    await run("clients.dashboard_conversion_actions", "ALTER TABLE `clients` ADD `dashboard_conversion_actions` text");
    await run("clients.blog_categories", "ALTER TABLE `clients` ADD `blog_categories` text");
    await run("clients.blog_tags", "ALTER TABLE `clients` ADD `blog_tags` text");
  
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
    // "Managed Google Ads account" toggle. When false, the client's Google Ads
    // account is hidden from OptiMate and active account pickers while the
    // customer ID stays on record for MCC visibility. Only shipped in the
    // Payload registry migration (20260616), never in this sweep — so prod
    // lacked the column and the OptiMate accounts route could not filter on it.
    await run("clients.gads_auto_is_managed_google_ads_account", "ALTER TABLE `clients` ADD `gads_auto_is_managed_google_ads_account` integer DEFAULT true");
    // Client logo (upload FK → media). Only shipped in the registry migration
    // (20260617), never in this sweep — so prod lacked the `logo_id` column and
    // creating/saving ANY client 500'd (Payload's insert + read-back reference
    // the column). See src/migrations/20260617_120000_add_client_logo.ts.
    await run("clients.logo_id", "ALTER TABLE `clients` ADD `logo_id` integer REFERENCES `media`(`id`) ON DELETE set null");
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
    await run("rename_gads_sweep_exclude", "ALTER TABLE `clients_gads_sweep_exclude` RENAME TO `gads_sweep_exclude`", ["already another table or index with this name"]);
    await run("rename_gads_report_emails", "ALTER TABLE `clients_gads_report_emails` RENAME TO `gads_report_emails`", ["already another table or index with this name"]);
  
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
  
    // --- Blog Settings global + client blog tone fields ---
    await run("blog_settings", `CREATE TABLE IF NOT EXISTS \`blog_settings\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`global_blog_rules\` text,
      \`global_markdown_rules\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    await run("clients.blog_tone", "ALTER TABLE `clients` ADD `blog_tone` text");
    await run("clients_blog_category_tones", `CREATE TABLE IF NOT EXISTS \`clients_blog_category_tones\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`category\` text,
      \`tone\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_blog_category_tones_order_idx", "CREATE INDEX IF NOT EXISTS `clients_blog_category_tones_order_idx` ON `clients_blog_category_tones` (`_order`)");
    await run("clients_blog_category_tones_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_blog_category_tones_parent_id_idx` ON `clients_blog_category_tones` (`_parent_id`)");

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
  
    // Fix sales_leads_stage_history.id and sales_leads_services.id from integer to text
    // (Payload v3 generates 24-char hex IDs for array sub-rows → SQLITE_MISMATCH on save).
    // Rebuild pattern matches the meeting_schedulers_attendees fix below.
    await run("sl_stage_history_drop_new", "DROP TABLE IF EXISTS `sales_leads_stage_history_new`");
    await run("sl_stage_history_new", `CREATE TABLE \`sales_leads_stage_history_new\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`from_stage\` text,
      \`to_stage\` text,
      \`transition_date\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("sl_stage_history_copy", `INSERT INTO \`sales_leads_stage_history_new\` (\`_order\`, \`_parent_id\`, \`id\`, \`from_stage\`, \`to_stage\`, \`transition_date\`) SELECT \`_order\`, \`_parent_id\`, CAST(\`id\` AS text), \`from_stage\`, \`to_stage\`, \`transition_date\` FROM \`sales_leads_stage_history\``);
    await run("sl_stage_history_drop_old", "DROP TABLE IF EXISTS `sales_leads_stage_history`");
    await run("sl_stage_history_rename", "ALTER TABLE `sales_leads_stage_history_new` RENAME TO `sales_leads_stage_history`");
    await run("sl_stage_history_parent_idx2", "CREATE INDEX IF NOT EXISTS `sales_leads_stage_history_parent_idx` ON `sales_leads_stage_history` (`_parent_id`)");
    await run("sl_stage_history_order_idx2", "CREATE INDEX IF NOT EXISTS `sales_leads_stage_history_order_idx` ON `sales_leads_stage_history` (`_order`)");

    await run("sl_services_drop_new", "DROP TABLE IF EXISTS `sales_leads_services_new`");
    await run("sl_services_new", `CREATE TABLE \`sales_leads_services_new\` (
      \`order\` integer NOT NULL,
      \`parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`value\` text,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`sales_leads\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("sl_services_copy", `INSERT INTO \`sales_leads_services_new\` (\`order\`, \`parent_id\`, \`id\`, \`value\`) SELECT \`order\`, \`parent_id\`, CAST(\`id\` AS text), \`value\` FROM \`sales_leads_services\``);
    await run("sl_services_drop_old", "DROP TABLE IF EXISTS `sales_leads_services`");
    await run("sl_services_rename", "ALTER TABLE `sales_leads_services_new` RENAME TO `sales_leads_services`");
    await run("sl_services_parent_idx2", "CREATE INDEX IF NOT EXISTS `sales_leads_services_parent_idx` ON `sales_leads_services` (`parent_id`)");
    await run("sl_services_order_idx2", "CREATE INDEX IF NOT EXISTS `sales_leads_services_order_idx` ON `sales_leads_services` (`order`)");

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
  
    // ── Client Timeline Templates ──
    await run("client_timeline_templates", `CREATE TABLE IF NOT EXISTS \`client_timeline_templates\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`name\` text NOT NULL,
      \`slug\` text NOT NULL,
      \`service_type\` text NOT NULL,
      \`duration_days\` integer NOT NULL DEFAULT 90,
      \`description\` text,
      \`is_default\` integer DEFAULT false,
      \`is_active\` integer DEFAULT true,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("client_timeline_templates_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `client_timeline_templates_slug_idx` ON `client_timeline_templates` (`slug`)");
    await run("client_timeline_templates_created_at_idx", "CREATE INDEX IF NOT EXISTS `client_timeline_templates_created_at_idx` ON `client_timeline_templates` (`created_at`)");
    await run("client_timeline_templates_updated_at_idx", "CREATE INDEX IF NOT EXISTS `client_timeline_templates_updated_at_idx` ON `client_timeline_templates` (`updated_at`)");
  
    // ── client_timeline_templates_phases array table ──
    await run("client_timeline_templates_phases", `CREATE TABLE IF NOT EXISTS \`client_timeline_templates_phases\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`phase_name\` text NOT NULL,
      \`phase_order\` numeric NOT NULL,
      \`week_range\` text,
      \`phase_description\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_timeline_templates\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_timeline_templates_phases_order_idx", "CREATE INDEX IF NOT EXISTS `client_timeline_templates_phases_order_idx` ON `client_timeline_templates_phases` (`_order`)");
    await run("client_timeline_templates_phases_parent_idx", "CREATE INDEX IF NOT EXISTS `client_timeline_templates_phases_parent_idx` ON `client_timeline_templates_phases` (`_parent_id`)");
  
    // ── client_timeline_templates_phases_items nested array table ──
    await run("client_timeline_templates_phases_items", `CREATE TABLE IF NOT EXISTS \`client_timeline_templates_phases_items\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` text NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`item_name\` text NOT NULL,
      \`item_order\` numeric NOT NULL,
      \`item_description\` text,
      \`requires_approval\` integer DEFAULT false,
      \`internal_notes\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_timeline_templates_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_timeline_templates_phases_items_order_idx", "CREATE INDEX IF NOT EXISTS `client_timeline_templates_phases_items_order_idx` ON `client_timeline_templates_phases_items` (`_order`)");
    await run("client_timeline_templates_phases_items_parent_idx", "CREATE INDEX IF NOT EXISTS `client_timeline_templates_phases_items_parent_idx` ON `client_timeline_templates_phases_items` (`_parent_id`)");
  
    // ── Client Timelines ──
    await run("client_timelines", `CREATE TABLE IF NOT EXISTS \`client_timelines\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`title\` text NOT NULL,
      \`client_id\` integer NOT NULL,
      \`template_id\` integer,
      \`service_type\` text NOT NULL,
      \`overall_status\` text DEFAULT 'not_started' NOT NULL,
      \`start_date\` text,
      \`end_date\` text,
      \`notes\` text,
      \`last_shared_at\` text,
      \`shared_count\` integer DEFAULT 0,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("client_timelines_client_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_client_idx` ON `client_timelines` (`client_id`)");
    await run("client_timelines_template_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_template_idx` ON `client_timelines` (`template_id`)");
    await run("client_timelines_overall_status_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_overall_status_idx` ON `client_timelines` (`overall_status`)");
    await run("client_timelines_created_at_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_created_at_idx` ON `client_timelines` (`created_at`)");
    await run("client_timelines_updated_at_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_updated_at_idx` ON `client_timelines` (`updated_at`)");
  
    // ── client_timelines_phases array table ──
    await run("client_timelines_phases", `CREATE TABLE IF NOT EXISTS \`client_timelines_phases\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`phase_name\` text NOT NULL,
      \`phase_order\` numeric NOT NULL,
      \`week_range\` text,
      \`phase_description\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_timelines\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_timelines_phases_order_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_phases_order_idx` ON `client_timelines_phases` (`_order`)");
    await run("client_timelines_phases_parent_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_phases_parent_idx` ON `client_timelines_phases` (`_parent_id`)");
  
    // ── client_timelines_phases_items nested array table ──
    await run("client_timelines_phases_items", `CREATE TABLE IF NOT EXISTS \`client_timelines_phases_items\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` text NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`item_name\` text NOT NULL,
      \`item_order\` numeric NOT NULL,
      \`item_description\` text,
      \`estimated_hours\` numeric,
      \`item_status\` text DEFAULT 'not_started',
      \`completed_at\` text,
      \`completed_by_id\` integer,
      \`requires_approval\` integer DEFAULT false,
      \`approval_status\` text DEFAULT 'not_needed',
      \`client_approved_at\` text,
      \`internal_notes\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_timelines_phases\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`completed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("client_timelines_phases_items_est_hours", "ALTER TABLE `client_timelines_phases_items` ADD `estimated_hours` numeric");
    await run("client_timelines_phases_items_order_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_phases_items_order_idx` ON `client_timelines_phases_items` (`_order`)");
    await run("client_timelines_phases_items_parent_idx", "CREATE INDEX IF NOT EXISTS `client_timelines_phases_items_parent_idx` ON `client_timelines_phases_items` (`_parent_id`)");
  
    // ── locked_docs_rels for new collections ──
    await run("locked_docs_rels.client_timeline_templates_id", "ALTER TABLE `payload_locked_documents_rels` ADD `client_timeline_templates_id` integer REFERENCES `client_timeline_templates`(`id`) ON DELETE cascade");
    await run("locked_docs_rels.client_timelines_id", "ALTER TABLE `payload_locked_documents_rels` ADD `client_timelines_id` integer REFERENCES `client_timelines`(`id`) ON DELETE cascade");
  
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
      '20260320_120000_add_yearly_sales_target',
      '20260325_120000_add_client_account_timeline',
      '20260327_120000_add_client_to_proposals',
      '20260410_120000_add_client_timeline_templates_and_client_timelines',
      '20260420_120000_add_ai_visibility_snapshots',
      '20260508_120000_add_client_presentations',
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
  
    // Campaign build (Google Ads push) fields
    await run("google_ads_audits.campaign_build_status", "ALTER TABLE `google_ads_audits` ADD `campaign_build_status` text");
    await run("google_ads_audits.generated_ad_copy", "ALTER TABLE `google_ads_audits` ADD `generated_ad_copy` text");
    await run("google_ads_audits.campaign_build_result", "ALTER TABLE `google_ads_audits` ADD `campaign_build_result` text");
    await run("google_ads_audits.campaign_build_error", "ALTER TABLE `google_ads_audits` ADD `campaign_build_error` text");
    await run("google_ads_audits.campaign_build_started_at", "ALTER TABLE `google_ads_audits` ADD `campaign_build_started_at` text");
    await run("google_ads_audits.campaign_build_completed_at", "ALTER TABLE `google_ads_audits` ADD `campaign_build_completed_at` text");
  
    // Ad Copy fields
    await run("google_ads_audits.ad_copy_brand_headlines", "ALTER TABLE `google_ads_audits` ADD `ad_copy_brand_headlines` text");
    await run("google_ads_audits.ad_copy_status", "ALTER TABLE `google_ads_audits` ADD `ad_copy_status` text");
    await run("google_ads_audits.ad_copy_published", "ALTER TABLE `google_ads_audits` ADD `ad_copy_published` integer DEFAULT 0");
    await run("google_ads_audits.ad_copy_comments", "ALTER TABLE `google_ads_audits` ADD `ad_copy_comments` text");
    await run("google_ads_audits.ad_copy_generated_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_generated_at` text");
    await run("google_ads_audits.ad_copy_published_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_published_at` text");
    await run("google_ads_audits.ad_copy_approved_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_approved_at` text");
    await run("google_ads_audits.ad_copy_original_copy", "ALTER TABLE `google_ads_audits` ADD `ad_copy_original_copy` text");
    await run("google_ads_audits.ad_copy_deploy_status", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_status` text");
    await run("google_ads_audits.ad_copy_deploy_started_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_started_at` text");
    await run("google_ads_audits.ad_copy_deployed_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deployed_at` text");
    await run("google_ads_audits.ad_copy_deploy_result", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_result` text");
    await run("google_ads_audits.ad_copy_deploy_error", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_error` text");
    await run("google_ads_audits.ad_copy_deploy_label", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_label` text");
  
    // Account managers array table for clients
    await run("clients_account_managers_post", `CREATE TABLE IF NOT EXISTS \`clients_account_managers\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`name\` text NOT NULL,
      \`email\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
  
    // Campaign Proposal Negative Keywords (array table for google_ads_audits)
    // Note: dbName shortened to "gads_proposal_negatives" to avoid 63-char enum name limit
    await run("gads_proposal_negatives_table", `
      CREATE TABLE IF NOT EXISTS \`gads_proposal_negatives\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`pattern\` text NOT NULL,
        \`neg_scope\` text DEFAULT 'global',
        \`category\` text,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
      )
    `);
    // Drop old long-named table if it exists (was created before dbName fix)
    await run("drop_old_negatives_table", "DROP TABLE IF EXISTS \`google_ads_audits_campaign_proposal_negative_keywords\`");
  
    // ── Client Notes (2026-03-14) ──
    // Rename legacy notes column
    await run("clients.rename_notes_to_legacy", "ALTER TABLE `clients` RENAME COLUMN `notes` TO `legacy_notes`");
  
    // Array table for client notes (dbName: client_notes)
    await run("client_notes", `CREATE TABLE IF NOT EXISTS \`client_notes\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`category\` text DEFAULT 'general',
      \`date\` text NOT NULL,
      \`author\` text,
      \`content\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_notes_order_idx", "CREATE INDEX IF NOT EXISTS `client_notes_order_idx` ON `client_notes` (`_order`)");
    await run("client_notes_parent_idx", "CREATE INDEX IF NOT EXISTS `client_notes_parent_idx` ON `client_notes` (`_parent_id`)");
  
    // Mark migration as executed
    await run("mark_migration:20260312_120000_add_site_url_to_gsc_indexing_audits", `INSERT OR IGNORE INTO \`payload_migrations\` (\`name\`, \`batch\`, \`created_at\`, \`updated_at\`) VALUES ('20260312_120000_add_site_url_to_gsc_indexing_audits', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);
  
    // --- Campaign Proposal Engine Config columns on google_ads_audits ---
    await run("google_ads_audits.proposal_biz_type", "ALTER TABLE `google_ads_audits` ADD `proposal_biz_type` text DEFAULT 'other'");
    await run("google_ads_audits.proposal_conv_goal", "ALTER TABLE `google_ads_audits` ADD `proposal_conv_goal` text");
    await run("google_ads_audits.proposal_svc_radius", "ALTER TABLE `google_ads_audits` ADD `proposal_svc_radius` text");
    // Collapsible children are top-level columns (Payload auto-names from camelCase → snake_case)
    await run("google_ads_audits.proposal_min_ad_group_volume", "ALTER TABLE `google_ads_audits` ADD `proposal_min_ad_group_volume` numeric");
    await run("google_ads_audits.proposal_min_brand_impressions", "ALTER TABLE `google_ads_audits` ADD `proposal_min_brand_impressions` numeric");
    await run("google_ads_audits.proposal_brand_volume_exempt", "ALTER TABLE `google_ads_audits` ADD `proposal_brand_volume_exempt` integer DEFAULT 0");
  
    // hasMany select for enabled campaigns (Payload creates sub-table from collection + field name)
    await run("google_ads_audits_proposal_enabled_campaigns", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_proposal_enabled_campaigns\` (
      \`order\` integer NOT NULL, \`parent_id\` integer NOT NULL,
      \`value\` text,
      \`id\` integer PRIMARY KEY NOT NULL,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("google_ads_audits_proposal_enabled_campaigns_order_idx", "CREATE INDEX IF NOT EXISTS `google_ads_audits_proposal_enabled_campaigns_order_idx` ON `google_ads_audits_proposal_enabled_campaigns` (`order`)");
    await run("google_ads_audits_proposal_enabled_campaigns_parent_id_idx", "CREATE INDEX IF NOT EXISTS `google_ads_audits_proposal_enabled_campaigns_parent_id_idx` ON `google_ads_audits_proposal_enabled_campaigns` (`parent_id`)");
  
    await run("mark_migration:20260315_120000_campaign_proposal_engine_config", `INSERT OR IGNORE INTO \`payload_migrations\` (\`name\`, \`batch\`, \`created_at\`, \`updated_at\`) VALUES ('20260315_120000_campaign_proposal_engine_config', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);
  
    // Rename proposal select columns: old dbName overrides → Payload's default camelCase-to-snake_case names
    // Without this, Payload generates SQL referencing proposal_business_type etc. but DB has proposal_biz_type etc.
    await run("rename_proposal_biz_type", "ALTER TABLE `google_ads_audits` RENAME COLUMN `proposal_biz_type` TO `proposal_business_type`");
    await run("rename_proposal_conv_goal", "ALTER TABLE `google_ads_audits` RENAME COLUMN `proposal_conv_goal` TO `proposal_conversion_goal`");
    await run("rename_proposal_svc_radius", "ALTER TABLE `google_ads_audits` RENAME COLUMN `proposal_svc_radius` TO `proposal_service_radius`");
  
    // Clean up empty-string select values that cause Payload validation failures on save
    await run("clean_empty_proposal_selects", "UPDATE `google_ads_audits` SET `proposal_business_type` = NULL WHERE `proposal_business_type` = ''");
    await run("clean_empty_proposal_conv_goal", "UPDATE `google_ads_audits` SET `proposal_conversion_goal` = NULL WHERE `proposal_conversion_goal` = ''");
    await run("clean_empty_proposal_svc_radius", "UPDATE `google_ads_audits` SET `proposal_service_radius` = NULL WHERE `proposal_service_radius` = ''");
  
  
    // Clear rawData (full Google Ads API dump, multi-MB) — it's only needed during scoring and
    // causes 413 on every admin save since Payload sends the full document body.
    // The afterRead hook now also strips it on read, but this clears existing data from the DB.
    await run("clear_raw_data_for_413_fix", "UPDATE `google_ads_audits` SET `raw_data` = NULL WHERE `raw_data` IS NOT NULL");
  
    // ── Revert tag_audits back to tag_setup_audits (undo premature rename) ──
    // These reverts run only when the old `tag_audits*` tables still exist; once
    // renamed back to `tag_setup_audits*` a re-run hits "no such table", which is
    // the expected already-applied signal.
    await run("revert_tag_audits_to_tag_setup_audits", "ALTER TABLE `tag_audits` RENAME TO `tag_setup_audits`", ["no such table"]);
    await run("revert_tag_audits_audit_history", "ALTER TABLE `tag_audits_audit_history` RENAME TO `tag_setup_audits_audit_history`", ["no such table"]);
    await run("revert_tag_audits_verify_history", "ALTER TABLE `tag_audits_verify_history` RENAME TO `tag_setup_audits_verify_history`", ["no such table"]);
    // Revert column rename
    await run("revert_website_url_to_url", "ALTER TABLE `tag_setup_audits` RENAME COLUMN `website_url` TO `url`");
  
    // ── Campaign Proposal Layer 1 config fields ──
    await run("add_proposal_service_split", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_service_split` text");
    await run("add_proposal_max_industry_verticals", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_max_industry_verticals` numeric");
    await run("add_proposal_max_ad_groups_per_campaign", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_max_ad_groups_per_campaign` numeric");
    await run("add_proposal_primary_focus", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_primary_focus` text");

    // ── Campaign Proposal geo-isolation + labelling config fields ──
    // These shipped in the collection config but were never added to this
    // sweep, so prod's google_ads_audits lacked the columns. Any audit insert
    // (including the lightweight on-demand audit the OptiMate accounts route
    // creates for managed client-only accounts) references them and rolls back,
    // which is why a managed account with no audit row never appeared in the
    // OptiMate account picker.
    await run("add_proposal_geo_isolation_mode", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_geo_isolation_mode` text DEFAULT 'off'");
    await run("add_proposal_near_me_strategy", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_near_me_strategy` text DEFAULT 'include_in_local_only'");
    await run("add_proposal_geo_negative_strategy", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_geo_negative_strategy` text DEFAULT 'keyword_and_location'");
    await run("add_proposal_preserve_keyword_cpc", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_preserve_keyword_cpc` integer DEFAULT true");
    await run("add_proposal_phrase_match_requires_approval", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_phrase_match_requires_approval` integer DEFAULT true");
    await run("add_proposal_created_by_label", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_created_by_label` text DEFAULT 'Created by Optimise Digital'");
    await run("add_proposal_pending_activation_label", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_pending_activation_label` text DEFAULT 'Pending activation - Optimise Digital'");
    await run("add_proposal_activated_label", "ALTER TABLE `google_ads_audits` ADD COLUMN `proposal_activated_label` text DEFAULT 'Activated by Optimise Digital'");
  
    // ── Approved campaign structure (CSV import) ──
    await run("add_approved_campaign_structure", "ALTER TABLE `google_ads_audits` ADD COLUMN `approved_campaign_structure` text");
  
    // --- Client Account Timeline array table (2026-03-25) ---
    await run("client_account_timeline", `CREATE TABLE IF NOT EXISTS \`client_account_timeline\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`date\` text NOT NULL,
      \`service_area\` text DEFAULT 'google_ads',
      \`action_type\` text NOT NULL,
      \`description\` text NOT NULL,
      \`added_by\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_account_timeline_order_idx", "CREATE INDEX IF NOT EXISTS `client_account_timeline_order_idx` ON `client_account_timeline` (`_order`)");
    await run("client_account_timeline_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_account_timeline_parent_id_idx` ON `client_account_timeline` (`_parent_id`)");
  
    // ── Negative Keyword Lists ──
    await run("negative_keyword_lists", `CREATE TABLE IF NOT EXISTS \`negative_keyword_lists\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`name\` text NOT NULL, \`scope\` text DEFAULT 'account',
      \`campaign_name\` text, \`ad_group_name\` text, \`campaign_regex\` text,
      \`keyword_count\` numeric DEFAULT 0, \`is_active\` integer DEFAULT true,
      \`client_id\` integer NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("negative_keyword_lists_keywords", `CREATE TABLE IF NOT EXISTS \`negative_keyword_lists_keywords\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL, \`keyword\` text NOT NULL,
      \`match_type\` text DEFAULT 'exact', \`flagged_for_removal\` integer DEFAULT false,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`negative_keyword_lists\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("nkl_client_idx", "CREATE INDEX IF NOT EXISTS `nkl_client_idx` ON `negative_keyword_lists` (`client_id`)");
    await run("nkl_created_idx", "CREATE INDEX IF NOT EXISTS `nkl_created_idx` ON `negative_keyword_lists` (`created_at`)");
    await run("nkl_updated_idx", "CREATE INDEX IF NOT EXISTS `nkl_updated_idx` ON `negative_keyword_lists` (`updated_at`)");
    await run("nkl_kw_order_idx", "CREATE INDEX IF NOT EXISTS `nkl_kw_order_idx` ON `negative_keyword_lists_keywords` (`_order`)");
    await run("nkl_kw_parent_idx", "CREATE INDEX IF NOT EXISTS `nkl_kw_parent_idx` ON `negative_keyword_lists_keywords` (`_parent_id`)");
    await run("locked_docs_rels.negative_keyword_lists_id", "ALTER TABLE `payload_locked_documents_rels` ADD `negative_keyword_lists_id` integer REFERENCES `negative_keyword_lists`(`id`) ON DELETE cascade");
    await run("negative_keyword_lists_campaigns", `CREATE TABLE IF NOT EXISTS \`negative_keyword_lists_campaigns\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL, \`campaign_name\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`negative_keyword_lists\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("nkl_camp_order_idx", "CREATE INDEX IF NOT EXISTS `nkl_camp_order_idx` ON `negative_keyword_lists_campaigns` (`_order`)");
    await run("nkl_camp_parent_idx", "CREATE INDEX IF NOT EXISTS `nkl_camp_parent_idx` ON `negative_keyword_lists_campaigns` (`_parent_id`)");
  
    // ── SEO Auto Notification Emails (Payload array: seoAuto.notificationEmails on Clients) ──
    await run("clients_seo_auto_notification_emails", `CREATE TABLE IF NOT EXISTS \`clients_seo_auto_notification_emails\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL, \`email\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_seo_auto_notification_emails_order_idx", "CREATE INDEX IF NOT EXISTS `clients_seo_auto_notification_emails_order_idx` ON `clients_seo_auto_notification_emails` (`_order`)");
    await run("clients_seo_auto_notification_emails_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_seo_auto_notification_emails_parent_id_idx` ON `clients_seo_auto_notification_emails` (`_parent_id`)");
  
    // ── Site Health Reports ──
    await run("site_health_reports", `CREATE TABLE IF NOT EXISTS \`site_health_reports\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`audit_status\` text DEFAULT 'pending',
      \`audit_progress\` text,
      \`audit_error\` text,
      \`site_url\` text NOT NULL,
      \`report_date\` text NOT NULL,
      \`health_score\` numeric,
      \`crawl_stats_total_pages_crawled\` numeric,
      \`crawl_stats_total_pages_in_sitemap\` numeric,
      \`crawl_stats_crawl_duration_ms\` numeric,
      \`issues_summary_critical\` numeric,
      \`issues_summary_warning\` numeric,
      \`issues_summary_notice\` numeric,
      \`issues_summary_total\` numeric,
      \`issues_by_category\` text,
      \`comparison_previous_score\` numeric,
      \`comparison_score_change\` numeric,
      \`comparison_new_issues\` numeric,
      \`comparison_fixed_issues\` numeric,
      \`comparison_previous_date\` text,
      \`issues\` text,
      \`pages\` text,
      \`gsc_data_indexed_pages\` numeric,
      \`gsc_data_not_indexed_pages\` numeric,
      \`gsc_data_total_clicks\` numeric,
      \`gsc_data_total_impressions\` numeric,
      \`gsc_data_average_ctr\` numeric,
      \`gsc_data_average_position\` numeric,
      \`gsc_data_indexing_issues\` text,
      \`gsc_data_canonical_mismatches\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("site_health_reports_client_idx", "CREATE INDEX IF NOT EXISTS `site_health_reports_client_idx` ON `site_health_reports` (`client_id`)");
    await run("site_health_reports_created_at_idx", "CREATE INDEX IF NOT EXISTS `site_health_reports_created_at_idx` ON `site_health_reports` (`created_at`)");
    await run("site_health_reports_updated_at_idx", "CREATE INDEX IF NOT EXISTS `site_health_reports_updated_at_idx` ON `site_health_reports` (`updated_at`)");
    await run("locked_docs_rels.site_health_reports_id", "ALTER TABLE `payload_locked_documents_rels` ADD `site_health_reports_id` integer REFERENCES `site_health_reports`(`id`) ON DELETE cascade");
  
    // ── SEO Health columns on clients table ──
    await run("clients.seo_auto_monthly_health_enabled", "ALTER TABLE `clients` ADD `seo_auto_monthly_health_enabled` integer DEFAULT false");
    await run("clients.seo_auto_site_url", "ALTER TABLE `clients` ADD `seo_auto_site_url` text");
    await run("clients.seo_auto_gsc_site_url", "ALTER TABLE `clients` ADD `seo_auto_gsc_site_url` text");
    await run("clients.seo_auto_health_report_day_of_month", "ALTER TABLE `clients` ADD `seo_auto_health_report_day_of_month` numeric DEFAULT 1");
    await run("clients.seo_auto_max_pages", "ALTER TABLE `clients` ADD `seo_auto_max_pages` numeric DEFAULT 200");
    await run("clients.seo_auto_check_external_links", "ALTER TABLE `clients` ADD `seo_auto_check_external_links` integer DEFAULT false");
  
    // ── Client Proposals: client_id column (links proposal to converted client) ──
    await run("client_proposals.client_id", "ALTER TABLE `client_proposals` ADD `client_id` integer REFERENCES `clients`(`id`) ON DELETE set null");

    // ── Client Proposals: "Start as lead" toggle (creates a SalesLead from a proposal) ──
    await run("client_proposals.start_as_lead", "ALTER TABLE `client_proposals` ADD `start_as_lead` integer DEFAULT false");
    await run("client_proposals.sales_lead_id", "ALTER TABLE `client_proposals` ADD `sales_lead_id` integer REFERENCES `sales_leads`(`id`) ON DELETE set null");
    await run("client_proposals_sales_lead_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_sales_lead_idx` ON `client_proposals` (`sales_lead_id`)");
  
    // ── payload_locked_documents_rels: negative_sweep_candidates_id ──
    // The NegativeSweepCandidates collection is registered in payload.config.ts but
    // the join column wasn't added to payload_locked_documents_rels. Without it,
    // every collection update fails because Payload's locked-docs check generates
    // SQL that references the missing column. Manifested as "Failed to update <id>"
    // when pushing budget changes.
    await run("payload_locked_documents_rels.negative_sweep_candidates_id", "ALTER TABLE `payload_locked_documents_rels` ADD `negative_sweep_candidates_id` integer");
  
    // ── Site Health Reports: GSC "why pages aren't indexed" rollup + coverage meta ──
    // New JSON columns on the gscData group. Without these, completed audits
    // silently drop the reasons breakdown and inspection metadata.
    await run("site_health_reports.gsc_data_reasons_breakdown", "ALTER TABLE `site_health_reports` ADD `gsc_data_reasons_breakdown` text");
    await run("site_health_reports.gsc_data_inspection_meta", "ALTER TABLE `site_health_reports` ADD `gsc_data_inspection_meta` text");

    // ── Clients: per-client GSC inspection cap for monthly health monitor ──
    await run("clients.seo_auto_max_gsc_inspections", "ALTER TABLE `clients` ADD `seo_auto_max_gsc_inspections` numeric DEFAULT 200");

    // ── google_ads_campaign_budgets.last_pushed_source ──
    // Tracks what triggered the most recent push to Google Ads ('manual',
    // 'cron-monthly-reset', 'cron-mid-month', 'agent'). The Optimate agent reads
    // this to skip work the cron has already handled within a recent window.
    await run("google_ads_campaign_budgets.last_pushed_source", "ALTER TABLE `google_ads_campaign_budgets` ADD `last_pushed_source` text");
  
    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  ADD NEW MIGRATION STATEMENTS ABOVE THIS LINE                  ║
    // ║  This is the POST handler — all migrations must be here.       ║
    // ║  The GET handler below is a legacy diagnostic, not used.       ║
    // ╚══════════════════════════════════════════════════════════════════╝
  
  
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
  
    // Add monthly_hosting column (must be after contracts table creation)
    await run("contracts.monthly_hosting_post", "ALTER TABLE `contracts` ADD `monthly_hosting` integer");
    // Add annual_hosting column for clients billed yearly for hosting
    await run("contracts.annual_hosting_post", "ALTER TABLE `contracts` ADD `annual_hosting` integer");
    // Add template_label column for the "Create from Template" button display
    await run("contracts.template_label_post", "ALTER TABLE `contracts` ADD `template_label` text");
    // Add termination_override column for custom termination sections
    await run("contracts.termination_override_post", "ALTER TABLE `contracts` ADD `termination_override` text");
  
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
  
    // ── Merge Timeline Into Processes (20260415) ──
    // ProcessTemplates: phases — add week_range
    await run("pt_phases.week_range", "ALTER TABLE `process_templates_phases` ADD `week_range` text");
    // ProcessTemplates: steps — add client-facing fields
    await run("pt_steps.client_visible", "ALTER TABLE `process_templates_phases_steps` ADD `client_visible` integer DEFAULT false");
    await run("pt_steps.client_label", "ALTER TABLE `process_templates_phases_steps` ADD `client_label` text");
    await run("pt_steps.requires_approval", "ALTER TABLE `process_templates_phases_steps` ADD `requires_approval` integer DEFAULT false");
    await run("pt_steps.internal_notes", "ALTER TABLE `process_templates_phases_steps` ADD `internal_notes` text");
    // ProcessTemplates: root — add duration_days
    await run("pt.duration_days", "ALTER TABLE `process_templates` ADD `duration_days` numeric");
  
    // ClientProcesses: phases — add week_range
    await run("cp_phases.week_range", "ALTER TABLE `client_processes_phases` ADD `week_range` text");
    // ClientProcesses: steps — add client-facing and tracking fields
    await run("cp_steps.client_visible", "ALTER TABLE `client_processes_phases_steps` ADD `client_visible` integer DEFAULT false");
    await run("cp_steps.client_label", "ALTER TABLE `client_processes_phases_steps` ADD `client_label` text");
    await run("cp_steps.requires_approval", "ALTER TABLE `client_processes_phases_steps` ADD `requires_approval` integer DEFAULT false");
    await run("cp_steps.approval_status", "ALTER TABLE `client_processes_phases_steps` ADD `approval_status` text DEFAULT 'not_needed'");
    await run("cp_steps.client_approved_at", "ALTER TABLE `client_processes_phases_steps` ADD `client_approved_at` text");
    await run("cp_steps.estimated_hours", "ALTER TABLE `client_processes_phases_steps` ADD `estimated_hours` numeric");
    await run("cp_steps.internal_notes", "ALTER TABLE `client_processes_phases_steps` ADD `internal_notes` text");
    await run("cp_steps.completed_by_id", "ALTER TABLE `client_processes_phases_steps` ADD `completed_by_id` integer REFERENCES users(id) ON DELETE SET NULL");
    // ClientProcesses: root — add timeline sharing fields
    await run("cp.start_date", "ALTER TABLE `client_processes` ADD `start_date` text");
    await run("cp.end_date", "ALTER TABLE `client_processes` ADD `end_date` text");
    await run("cp.last_shared_at", "ALTER TABLE `client_processes` ADD `last_shared_at` text");
    await run("cp.shared_count", "ALTER TABLE `client_processes` ADD `shared_count` integer DEFAULT 0");
    await run("cp.duration_days", "ALTER TABLE `client_processes` ADD `duration_days` numeric");
  
    // Mark the merge migration
    await run("mark_migration:20260415_120000_merge_timeline_into_processes", `INSERT INTO payload_migrations (name, batch, created_at, updated_at) SELECT '20260415_120000_merge_timeline_into_processes', 1, datetime('now'), datetime('now') WHERE NOT EXISTS (SELECT 1 FROM payload_migrations WHERE name = '20260415_120000_merge_timeline_into_processes')`);
  
  
    // ── Email Templates global (2026-03-24) ──
    await run("email_templates", `CREATE TABLE IF NOT EXISTS \`email_templates\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`seo_opener\` text,
      \`cro_opener\` text,
      \`google_ads_opener\` text,
      \`facebook_ads_opener\` text,
      \`ai_automation_opener\` text,
      \`ai_search_opener\` text,
      \`integrated_strategy_opener\` text,
      \`open_to_recommendations_opener\` text,
      \`multi_service_opener\` text,
      \`getting_started\` text,
      \`growing_steadily\` text,
      \`scaling\` text,
      \`investing_heavily\` text,
      \`qualified_leads\` text,
      \`conversion_rate\` text,
      \`lower_cac\` text,
      \`growth_strategy\` text,
      \`measurement\` text,
      \`focus_sentence_template\` text,
      \`not_sure\` text,
      \`inconsistent\` text,
      \`know_what_works\` text,
      \`need_efficiency\` text,
      \`closing_paragraph\` text,
      \`subject_template\` text,
      \`questions_intro\` text,
      \`updated_at\` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      \`created_at\` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
  
    await run("email_templates_service_questions", `CREATE TABLE IF NOT EXISTS \`email_templates_service_questions\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`service_slug\` text,
      \`theme\` text,
      \`question\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    )`);
    await run("email_templates_service_questions_order_idx", "CREATE INDEX IF NOT EXISTS `email_templates_service_questions_order_idx` ON `email_templates_service_questions` (`_order`)");
    await run("email_templates_service_questions_parent_id_idx", "CREATE INDEX IF NOT EXISTS `email_templates_service_questions_parent_id_idx` ON `email_templates_service_questions` (`_parent_id`)");
  
    await run("email_templates_focus_questions", `CREATE TABLE IF NOT EXISTS \`email_templates_focus_questions\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`focus_slug\` text,
      \`theme\` text,
      \`question\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    )`);
    await run("email_templates_focus_questions_order_idx", "CREATE INDEX IF NOT EXISTS `email_templates_focus_questions_order_idx` ON `email_templates_focus_questions` (`_order`)");
    await run("email_templates_focus_questions_parent_id_idx", "CREATE INDEX IF NOT EXISTS `email_templates_focus_questions_parent_id_idx` ON `email_templates_focus_questions` (`_parent_id`)");
  
    await run("email_templates_setup_questions", `CREATE TABLE IF NOT EXISTS \`email_templates_setup_questions\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`setup_slug\` text,
      \`theme\` text,
      \`question\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    )`);
    await run("email_templates_setup_questions_order_idx", "CREATE INDEX IF NOT EXISTS `email_templates_setup_questions_order_idx` ON `email_templates_setup_questions` (`_order`)");
    await run("email_templates_setup_questions_parent_id_idx", "CREATE INDEX IF NOT EXISTS `email_templates_setup_questions_parent_id_idx` ON `email_templates_setup_questions` (`_parent_id`)");
  
    // --- Meeting Schedulers ---
    await run("meeting_schedulers", `CREATE TABLE IF NOT EXISTS \`meeting_schedulers\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`title\` text NOT NULL,
      \`client_id\` integer,
      \`meeting_topic\` text,
      \`duration_minutes\` text DEFAULT '30',
      \`date_range_start\` text,
      \`date_range_end\` text,
      \`business_hours_start\` text DEFAULT '09:00',
      \`business_hours_end\` text DEFAULT '17:00',
      \`timezone\` text DEFAULT 'Australia/Sydney',
      \`slot_interval_minutes\` numeric DEFAULT 30,
      \`generated_slots\` text,
      \`slots_generated_at\` text,
      \`matched_slot\` text,
      \`google_event_id\` text,
      \`google_event_link\` text,
      \`status\` text DEFAULT 'draft',
      \`slug\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("meeting_schedulers_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `meeting_schedulers_slug_idx` ON `meeting_schedulers` (`slug`)");
    await run("meeting_schedulers_status_idx", "CREATE INDEX IF NOT EXISTS `meeting_schedulers_status_idx` ON `meeting_schedulers` (`status`)");
    await run("meeting_schedulers_client_idx", "CREATE INDEX IF NOT EXISTS `meeting_schedulers_client_idx` ON `meeting_schedulers` (`client_id`)");
    await run("meeting_schedulers_created_at_idx", "CREATE INDEX IF NOT EXISTS `meeting_schedulers_created_at_idx` ON `meeting_schedulers` (`created_at`)");
    await run("meeting_schedulers_updated_at_idx", "CREATE INDEX IF NOT EXISTS `meeting_schedulers_updated_at_idx` ON `meeting_schedulers` (`updated_at`)");
  
    await run("meeting_schedulers_attendees", `CREATE TABLE IF NOT EXISTS \`meeting_schedulers_attendees\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY NOT NULL,
      \`name\` text NOT NULL,
      \`email\` text NOT NULL,
      \`internal_confirmed\` integer DEFAULT 0,
      \`token\` text,
      \`responded\` integer DEFAULT 0,
      \`responded_at\` text,
      \`email_sent_at\` text,
      \`selected_slots\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`meeting_schedulers\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("meeting_schedulers_attendees_order_idx", "CREATE INDEX IF NOT EXISTS `meeting_schedulers_attendees_order_idx` ON `meeting_schedulers_attendees` (`_order`)");
    await run("meeting_schedulers_attendees_parent_idx", "CREATE INDEX IF NOT EXISTS `meeting_schedulers_attendees_parent_idx` ON `meeting_schedulers_attendees` (`_parent_id`)");
    await run("meeting_schedulers_attendees_token_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `meeting_schedulers_attendees_token_idx` ON `meeting_schedulers_attendees` (`token`)");
  
    // --- Calendar Auth global ---
    await run("calendar_auth", `CREATE TABLE IF NOT EXISTS \`calendar_auth\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`refresh_token\` text,
      \`connected_email\` text,
      \`connected_at\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
  
    // locked_documents_rels column for meeting_schedulers
    await run("locked_docs_meeting_schedulers_id", "ALTER TABLE `payload_locked_documents_rels` ADD `meeting_schedulers_id` integer");
  
    // Per-day availability schedule (JSON)
    await run("meeting_schedulers_day_schedule", "ALTER TABLE `meeting_schedulers` ADD `day_schedule` text");
    await run("meeting_schedulers_date_overrides", "ALTER TABLE `meeting_schedulers` ADD `date_overrides` text");
  
    // Fix meeting_schedulers_attendees.id type from integer to text (Payload v3 uses 24-char hex IDs)
    await run("att_id_check", `SELECT type FROM pragma_table_info('meeting_schedulers_attendees') WHERE name='id'`);
    await run("att_new_table", `CREATE TABLE IF NOT EXISTS \`meeting_schedulers_attendees_new\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`name\` text NOT NULL,
      \`email\` text NOT NULL,
      \`internal_confirmed\` integer DEFAULT 0,
      \`token\` text,
      \`responded\` integer DEFAULT 0,
      \`responded_at\` text,
      \`email_sent_at\` text,
      \`selected_slots\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`meeting_schedulers\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("att_copy_rows", `INSERT INTO \`meeting_schedulers_attendees_new\` (\`_order\`, \`_parent_id\`, \`id\`, \`name\`, \`email\`, \`token\`, \`responded\`, \`responded_at\`, \`email_sent_at\`, \`selected_slots\`) SELECT \`_order\`, \`_parent_id\`, CAST(\`id\` AS text), \`name\`, \`email\`, \`token\`, \`responded\`, \`responded_at\`, \`email_sent_at\`, \`selected_slots\` FROM \`meeting_schedulers_attendees\``);
    await run("att_drop_old", "DROP TABLE IF EXISTS `meeting_schedulers_attendees`");
    await run("att_rename", "ALTER TABLE `meeting_schedulers_attendees_new` RENAME TO `meeting_schedulers_attendees`");
    await run("att_idx_order", "CREATE INDEX IF NOT EXISTS `meeting_schedulers_attendees_order_idx` ON `meeting_schedulers_attendees` (`_order`)");
    await run("att_idx_parent", "CREATE INDEX IF NOT EXISTS `meeting_schedulers_attendees_parent_idx` ON `meeting_schedulers_attendees` (`_parent_id`)");
    await run("att_idx_token", "CREATE UNIQUE INDEX IF NOT EXISTS `meeting_schedulers_attendees_token_idx` ON `meeting_schedulers_attendees` (`token`)");
    await run("meeting_schedulers_attendees_internal_confirmed", "ALTER TABLE `meeting_schedulers_attendees` ADD `internal_confirmed` integer DEFAULT 0");
    // Accept / maybe / decline response per attendee (2026-07-02).
    await run("meeting_schedulers_attendees_response", "ALTER TABLE `meeting_schedulers_attendees` ADD `response` text");
    // Brevo delivery status per attendee, updated via webhook (2026-07-03).
    await run("meeting_schedulers_attendees_delivery_status", "ALTER TABLE `meeting_schedulers_attendees` ADD `delivery_status` text");
    await run("meeting_schedulers_attendees_delivery_detail", "ALTER TABLE `meeting_schedulers_attendees` ADD `delivery_detail` text");
    await run("meeting_schedulers_attendees_delivery_updated_at", "ALTER TABLE `meeting_schedulers_attendees` ADD `delivery_updated_at` text");
  
    // --- Negative List Builder (JSON column on google_ads_audits) ---
    await run("gads_negative_list_builder", "ALTER TABLE `google_ads_audits` ADD `negative_list_builder` text");
    await run("gads_nlb_published", "ALTER TABLE `google_ads_audits` ADD `negative_list_builder_published` integer DEFAULT 0");
  
    // ── GBP override fields on competitors (2026-04-14) ──
    await run("client_proposals_competitors.gbp_rating", "ALTER TABLE `client_proposals_competitors` ADD `gbp_rating` numeric");
    await run("client_proposals_competitors.gbp_review_count", "ALTER TABLE `client_proposals_competitors` ADD `gbp_review_count` numeric");
    await run("client_proposals_competitors.gbp_responds_to_reviews", "ALTER TABLE `client_proposals_competitors` ADD `gbp_responds_to_reviews` integer DEFAULT 0");
  
    // ── Flight Plan Recommendations sub-table (missing from earlier migration) ──
    await run("client_proposals_flight_plan_recommendations", `CREATE TABLE IF NOT EXISTS \`client_proposals_flight_plan_recommendations\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`enabled\` integer DEFAULT false, \`title\` text NOT NULL,
      \`description\` text, \`benefit\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("flight_plan_recs_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_flight_plan_recommendations_order_idx` ON `client_proposals_flight_plan_recommendations` (`_order`)");
    await run("flight_plan_recs_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_flight_plan_recommendations_parent_id_idx` ON `client_proposals_flight_plan_recommendations` (`_parent_id`)");
  
    // ── Hidden keyword categories JSON column on client_proposals (2026-04-15) ──
    await run("client_proposals.hidden_keyword_categories", "ALTER TABLE `client_proposals` ADD `hidden_keyword_categories` text");
  
    // ── AI Visibility Snapshots (2026-04-20) ──
    await run("ai_visibility_snapshots", `CREATE TABLE IF NOT EXISTS \`ai_visibility_snapshots\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`client_id\` integer NOT NULL,
      \`client_name\` text,
      \`property_id\` text NOT NULL,
      \`period_start\` text NOT NULL,
      \`period_end\` text NOT NULL,
      \`total_sessions\` numeric NOT NULL,
      \`total_users\` numeric NOT NULL,
      \`total_conversions\` numeric NOT NULL,
      \`conversion_value\` numeric DEFAULT 0,
      \`engaged_sessions\` numeric DEFAULT 0,
      \`avg_engagement_time\` numeric DEFAULT 0,
      \`by_source\` text,
      \`share_by_source\` text,
      \`fetched_at\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("ai_visibility_snapshots_client_idx", "CREATE INDEX IF NOT EXISTS `ai_visibility_snapshots_client_idx` ON `ai_visibility_snapshots` (`client_id`)");
    await run("ai_visibility_snapshots_period_end_idx", "CREATE INDEX IF NOT EXISTS `ai_visibility_snapshots_period_end_idx` ON `ai_visibility_snapshots` (`period_end`)");
    await run("ai_visibility_snapshots_client_period_end_idx", "CREATE INDEX IF NOT EXISTS `ai_visibility_snapshots_client_period_end_idx` ON `ai_visibility_snapshots` (`client_id`, `period_end`)");
    await run("ai_visibility_snapshots_created_at_idx", "CREATE INDEX IF NOT EXISTS `ai_visibility_snapshots_created_at_idx` ON `ai_visibility_snapshots` (`created_at`)");
    await run("ai_visibility_snapshots_updated_at_idx", "CREATE INDEX IF NOT EXISTS `ai_visibility_snapshots_updated_at_idx` ON `ai_visibility_snapshots` (`updated_at`)");
    await run("locked_docs_rels.ai_visibility_snapshots_id", "ALTER TABLE `payload_locked_documents_rels` ADD `ai_visibility_snapshots_id` integer REFERENCES `ai_visibility_snapshots`(`id`) ON DELETE CASCADE");

    // ── proposal_id on ai_visibility_snapshots / serp_displacement_snapshots ──
    // Both collections declare a `proposal` relationship in their Payload
    // config but the create-table migrations never added the matching column.
    // The convert-to-client hook filters these tables by `proposal`, so the
    // missing column 500s the toggle. Idempotent — `run()` wraps the ALTER in
    // try/catch via the runner helper.
    await run(
      "ai_visibility_snapshots.proposal_id",
      "ALTER TABLE `ai_visibility_snapshots` ADD `proposal_id` integer REFERENCES `client_proposals`(`id`) ON DELETE set null",
    );
    await run(
      "ai_visibility_snapshots_proposal_idx",
      "CREATE INDEX IF NOT EXISTS `ai_visibility_snapshots_proposal_idx` ON `ai_visibility_snapshots` (`proposal_id`)",
    );
    await run(
      "serp_displacement_snapshots.proposal_id",
      "ALTER TABLE `serp_displacement_snapshots` ADD `proposal_id` integer REFERENCES `client_proposals`(`id`) ON DELETE set null",
    );
    await run(
      "serp_displacement_snapshots_proposal_idx",
      "CREATE INDEX IF NOT EXISTS `serp_displacement_snapshots_proposal_idx` ON `serp_displacement_snapshots` (`proposal_id`)",
    );

    // ── Negative Keyword Lists: source column (2026-04-29) ──
    // Tracks where the list originated: 'nlb' (Negative List Builder) or
    // 'deep_dive' (Keyword Deep Dive). Added to the collection config but the
    // matching column was never added to the live DB.
    await run(
      "negative_keyword_lists.source",
      "ALTER TABLE `negative_keyword_lists` ADD `source` text DEFAULT 'nlb'",
    );
  
    // ── Keyword Deep Dive Sessions (2026-04-29) ──
    // An earlier deploy created a broken keyword_deep_dive_sessions table with
    // the relationship columns named `client`/`google_ads_audit`/`applied_to_nkl`
    // (no `_id` suffix), which Drizzle's relationship mapper can't read. Drop
    // the broken table once and recreate it with the correct schema.
    //
    // NOTE on column naming: Drizzle converts camelCase Payload field names to
    // snake_case by inserting underscores between EVERY consecutive letter case
    // change. So `appliedToNKL` becomes `applied_to_n_k_l` (each capital in NKL
    // gets its own underscore), then `_id` is appended for the FK. The other
    // relationship fields (`client`, `googleAdsAudit`) follow the normal
    // snake_case + `_id` rule.
    await run(
      "drop_broken_keyword_deep_dive_sessions",
      "DROP TABLE IF EXISTS `keyword_deep_dive_sessions_keywords`",
    );
    await run(
      "drop_broken_keyword_deep_dive_sessions_root",
      "DROP TABLE IF EXISTS `keyword_deep_dive_sessions`",
    );
    await run(
      "keyword_deep_dive_sessions",
      `CREATE TABLE IF NOT EXISTS \`keyword_deep_dive_sessions\` (
        \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        \`client_id\` integer NOT NULL,
        \`google_ads_audit_id\` integer,
        \`applied_to_n_k_l_id\` integer,
        \`title\` text,
        \`notes\` text,
        \`status\` text DEFAULT 'pending',
        \`keyword_count\` numeric DEFAULT 0,
        \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
        FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
        FOREIGN KEY (\`google_ads_audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE set null,
        FOREIGN KEY (\`applied_to_n_k_l_id\`) REFERENCES \`negative_keyword_lists\`(\`id\`) ON UPDATE no action ON DELETE set null
      )`,
    );
    // If the table was already created with the wrong column name (e.g. from
    // the earlier broken migration), rename it. ALTER TABLE RENAME COLUMN is
    // idempotent only when wrapped in try/catch via the run() helper.
    await run(
      "keyword_deep_dive_sessions.rename_applied_to_nkl_id",
      "ALTER TABLE `keyword_deep_dive_sessions` RENAME COLUMN `applied_to_nkl_id` TO `applied_to_n_k_l_id`",
    );
    await run(
      "keyword_deep_dive_sessions_keywords",
      `CREATE TABLE IF NOT EXISTS \`keyword_deep_dive_sessions_keywords\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`keyword\` text NOT NULL,
        \`match_type\` text DEFAULT 'exact',
        \`flagged_for_removal\` integer DEFAULT false,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`keyword_deep_dive_sessions\`(\`id\`) ON UPDATE no action ON DELETE cascade
      )`,
    );
    await run(
      "kdds_client_idx",
      "CREATE INDEX IF NOT EXISTS `keyword_deep_dive_sessions_client_idx` ON `keyword_deep_dive_sessions` (`client_id`)",
    );
    await run(
      "kdds_audit_idx",
      "CREATE INDEX IF NOT EXISTS `keyword_deep_dive_sessions_audit_idx` ON `keyword_deep_dive_sessions` (`google_ads_audit_id`)",
    );
    await run(
      "kdds_status_idx",
      "CREATE INDEX IF NOT EXISTS `keyword_deep_dive_sessions_status_idx` ON `keyword_deep_dive_sessions` (`status`)",
    );
    await run(
      "kdds_created_idx",
      "CREATE INDEX IF NOT EXISTS `keyword_deep_dive_sessions_created_idx` ON `keyword_deep_dive_sessions` (`created_at`)",
    );
    await run(
      "kdds_kw_order_idx",
      "CREATE INDEX IF NOT EXISTS `keyword_deep_dive_sessions_keywords_order_idx` ON `keyword_deep_dive_sessions_keywords` (`_order`)",
    );
    await run(
      "kdds_kw_parent_idx",
      "CREATE INDEX IF NOT EXISTS `keyword_deep_dive_sessions_keywords_parent_idx` ON `keyword_deep_dive_sessions_keywords` (`_parent_id`)",
    );
    await run(
      "locked_docs_rels.keyword_deep_dive_sessions_id",
      "ALTER TABLE `payload_locked_documents_rels` ADD `keyword_deep_dive_sessions_id` integer REFERENCES `keyword_deep_dive_sessions`(`id`) ON DELETE CASCADE",
    );
  
    // ── Negative keyword avoided-spend cache (2026-04-30) ──
    await run("negative_keyword_avoided_spend_cache", `CREATE TABLE IF NOT EXISTS \`negative_keyword_avoided_spend_cache\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`client_id\` integer NOT NULL,
      \`keyword\` text NOT NULL,
      \`match_type\` text NOT NULL,
      \`year_month\` text NOT NULL,
      \`spend\` numeric DEFAULT 0 NOT NULL,
      \`is_final\` integer DEFAULT 0,
      \`fetched_at\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("avoided_spend_cache_unique_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `avoided_spend_cache_unique_idx` ON `negative_keyword_avoided_spend_cache` (`client_id`, `keyword`, `match_type`, `year_month`)");
    await run("avoided_spend_cache_client_month_idx", "CREATE INDEX IF NOT EXISTS `avoided_spend_cache_client_month_idx` ON `negative_keyword_avoided_spend_cache` (`client_id`, `year_month`)");
    await run("avoided_spend_cache_client_idx", "CREATE INDEX IF NOT EXISTS `avoided_spend_cache_client_idx` ON `negative_keyword_avoided_spend_cache` (`client_id`)");
    await run("avoided_spend_cache_keyword_idx", "CREATE INDEX IF NOT EXISTS `avoided_spend_cache_keyword_idx` ON `negative_keyword_avoided_spend_cache` (`keyword`)");
    await run("avoided_spend_cache_year_month_idx", "CREATE INDEX IF NOT EXISTS `avoided_spend_cache_year_month_idx` ON `negative_keyword_avoided_spend_cache` (`year_month`)");
    await run("avoided_spend_cache_created_at_idx", "CREATE INDEX IF NOT EXISTS `avoided_spend_cache_created_at_idx` ON `negative_keyword_avoided_spend_cache` (`created_at`)");
    await run("avoided_spend_cache_updated_at_idx", "CREATE INDEX IF NOT EXISTS `avoided_spend_cache_updated_at_idx` ON `negative_keyword_avoided_spend_cache` (`updated_at`)");
    // locked_docs_rels FK column for the new collection — without this, saving any
    // cache row crashes with "no such column".
    await run("locked_docs_rels.negative_keyword_avoided_spend_cache_id", "ALTER TABLE `payload_locked_documents_rels` ADD `negative_keyword_avoided_spend_cache_id` integer REFERENCES `negative_keyword_avoided_spend_cache`(`id`) ON DELETE cascade");
    // negated_at sub-field on negative_keyword_lists.keywords array.
    await run("negative_keyword_lists_keywords.negated_at", "ALTER TABLE `negative_keyword_lists_keywords` ADD `negated_at` text");
    // Backfill existing entries to their parent list's created_at so older NKLs
    // get an honest "we know it was negated by this date" timestamp.
    await run("backfill_negated_at", `UPDATE \`negative_keyword_lists_keywords\`
      SET \`negated_at\` = (
        SELECT \`created_at\` FROM \`negative_keyword_lists\`
        WHERE \`negative_keyword_lists\`.\`id\` = \`negative_keyword_lists_keywords\`.\`_parent_id\`
      )
      WHERE \`negated_at\` IS NULL`);
  
    // ── Negative keyword monthly waste/relevancy cache (2026-05-01) ──
    // Mirrors the avoided-spend cache: one row per (client, yearMonth). Past
    // months are immutable, current month refreshed at most every hour. Warmed
    // nightly by /api/dashboard/prewarm so dashboard loads are fast.
    await run("negative_keyword_monthly_waste_relevancy_cache", `CREATE TABLE IF NOT EXISTS \`negative_keyword_monthly_waste_relevancy_cache\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`client_id\` integer NOT NULL,
      \`year_month\` text NOT NULL,
      \`total_spend\` numeric DEFAULT 0 NOT NULL,
      \`non_converting_spend\` numeric DEFAULT 0 NOT NULL,
      \`irrelevant_spend\` numeric DEFAULT 0 NOT NULL,
      \`is_final\` integer DEFAULT 0,
      \`fetched_at\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("waste_relevancy_cache_unique_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `waste_relevancy_cache_unique_idx` ON `negative_keyword_monthly_waste_relevancy_cache` (`client_id`, `year_month`)");
    await run("waste_relevancy_cache_client_idx", "CREATE INDEX IF NOT EXISTS `waste_relevancy_cache_client_idx` ON `negative_keyword_monthly_waste_relevancy_cache` (`client_id`)");
    await run("waste_relevancy_cache_year_month_idx", "CREATE INDEX IF NOT EXISTS `waste_relevancy_cache_year_month_idx` ON `negative_keyword_monthly_waste_relevancy_cache` (`year_month`)");
    await run("waste_relevancy_cache_created_at_idx", "CREATE INDEX IF NOT EXISTS `waste_relevancy_cache_created_at_idx` ON `negative_keyword_monthly_waste_relevancy_cache` (`created_at`)");
    await run("waste_relevancy_cache_updated_at_idx", "CREATE INDEX IF NOT EXISTS `waste_relevancy_cache_updated_at_idx` ON `negative_keyword_monthly_waste_relevancy_cache` (`updated_at`)");
    await run("locked_docs_rels.negative_keyword_monthly_waste_relevancy_cache_id", "ALTER TABLE `payload_locked_documents_rels` ADD `negative_keyword_monthly_waste_relevancy_cache_id` integer REFERENCES `negative_keyword_monthly_waste_relevancy_cache`(`id`) ON DELETE cascade");
  
    // ── contractor invoicing tables (2026-05-05) ──
    await run("contractors_table", `CREATE TABLE IF NOT EXISTS \`contractors\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`name\` text NOT NULL,
      \`email\` text,
      \`hourly_rate\` numeric DEFAULT 20.5 NOT NULL,
      \`currency\` text DEFAULT 'AUD' NOT NULL,
      \`default_weekly_hours\` numeric DEFAULT 16,
      \`chat_gpt_reimbursement_per_fortnight\` numeric DEFAULT 31.83,
      \`transfer_fee_default\` numeric DEFAULT 4,
      \`transfer_reference_template\` text DEFAULT '{startShort}-{endShort} Optimise',
      \`fortnight_anchor_date\` text,
      \`is_active\` integer DEFAULT 1,
      \`portal_token\` text,
      \`notes\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("contractors_portal_token_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `contractors_portal_token_idx` ON `contractors` (`portal_token`)");
    await run("contractors_is_active_idx", "CREATE INDEX IF NOT EXISTS `contractors_is_active_idx` ON `contractors` (`is_active`)");
  
    await run("contractor_payments_table", `CREATE TABLE IF NOT EXISTS \`contractor_payments\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`contractor_id\` integer NOT NULL,
      \`fortnight_start_date\` text NOT NULL,
      \`fortnight_end_date\` text,
      \`total_hours\` numeric,
      \`subtotal\` numeric,
      \`chat_gpt_reimbursement\` numeric,
      \`transfer_fee\` numeric,
      \`transfer_amount\` numeric,
      \`transfer_reference\` text,
      \`status\` text DEFAULT 'scheduled' NOT NULL,
      \`payment_date\` text,
      \`sent_at\` text,
      \`notes\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`contractor_id\`) REFERENCES \`contractors\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("contractor_payments_contractor_idx", "CREATE INDEX IF NOT EXISTS `contractor_payments_contractor_idx` ON `contractor_payments` (`contractor_id`)");
    await run("contractor_payments_fortnight_start_idx", "CREATE INDEX IF NOT EXISTS `contractor_payments_fortnight_start_idx` ON `contractor_payments` (`fortnight_start_date`)");
  
    await run("contractor_time_entries_table", `CREATE TABLE IF NOT EXISTS \`contractor_time_entries\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`contractor_id\` integer NOT NULL,
      \`week_commencing\` text NOT NULL,
      \`hours\` numeric DEFAULT 0 NOT NULL,
      \`status\` text DEFAULT 'draft' NOT NULL,
      \`hourly_rate_snapshot\` numeric,
      \`total_fee\` numeric,
      \`payment_id\` integer,
      \`submitted_at\` text,
      \`approved_at\` text,
      \`paid_at\` text,
      \`notes\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`contractor_id\`) REFERENCES \`contractors\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`payment_id\`) REFERENCES \`contractor_payments\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("contractor_time_entries_contractor_idx", "CREATE INDEX IF NOT EXISTS `contractor_time_entries_contractor_idx` ON `contractor_time_entries` (`contractor_id`)");
    await run("contractor_time_entries_week_commencing_idx", "CREATE INDEX IF NOT EXISTS `contractor_time_entries_week_commencing_idx` ON `contractor_time_entries` (`week_commencing`)");
    await run("contractor_time_entries_status_idx", "CREATE INDEX IF NOT EXISTS `contractor_time_entries_status_idx` ON `contractor_time_entries` (`status`)");
    await run("contractor_time_entries_unique_week", "CREATE UNIQUE INDEX IF NOT EXISTS `contractor_time_entries_unique_week` ON `contractor_time_entries` (`contractor_id`, `week_commencing`)");
  
    await run("locked_docs_rels.contractors_id", "ALTER TABLE `payload_locked_documents_rels` ADD `contractors_id` integer REFERENCES `contractors`(`id`) ON DELETE cascade");
    await run("locked_docs_rels.contractor_payments_id", "ALTER TABLE `payload_locked_documents_rels` ADD `contractor_payments_id` integer REFERENCES `contractor_payments`(`id`) ON DELETE cascade");
    await run("locked_docs_rels.contractor_time_entries_id", "ALTER TABLE `payload_locked_documents_rels` ADD `contractor_time_entries_id` integer REFERENCES `contractor_time_entries`(`id`) ON DELETE cascade");
  
    // ── Conversion split categorisation columns on clients (2026-05-05) ──
    await run("clients.phone_call_conversion_actions", "ALTER TABLE `clients` ADD `phone_call_conversion_actions` text");
    await run("clients.form_submit_conversion_actions", "ALTER TABLE `clients` ADD `form_submit_conversion_actions` text");
  
    // ── Editable conversion-action categories array sub-table (2026-05-05) ──
    await run("clients_conversion_action_categories_table", `CREATE TABLE IF NOT EXISTS \`clients_conversion_action_categories\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`label\` text NOT NULL,
      \`color\` text DEFAULT 'sky',
      \`actions\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_conversion_action_categories_order_idx", "CREATE INDEX IF NOT EXISTS `clients_conversion_action_categories_order_idx` ON `clients_conversion_action_categories` (`_order`)");
    await run("clients_conversion_action_categories_parent_idx", "CREATE INDEX IF NOT EXISTS `clients_conversion_action_categories_parent_idx` ON `clients_conversion_action_categories` (`_parent_id`)");
  
    // ── Brand spend column on waste/relevancy cache (2026-05-06) ──
    await run("waste_relevancy_cache.brand_spend", "ALTER TABLE `negative_keyword_monthly_waste_relevancy_cache` ADD `brand_spend` numeric DEFAULT 0");
  
    // ── Optimate agents Phase 0 (2026-05-07) ──
    // Two new collections + 9 new columns on activity_log so the agent loop can
    // log per-step traces (tool calls, reasoning, model + auth source used).
    // See src/lib/agents/_shared/ for the runtime that reads/writes these.
  
    // Agent Approval Queue: drafts produced by agents, awaiting human review.
    await run("agent_approval_queue", `CREATE TABLE IF NOT EXISTS \`agent_approval_queue\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`title\` text NOT NULL,
      \`agent_name\` text NOT NULL,
      \`client_id\` integer,
      \`proposal_type\` text NOT NULL,
      \`agent_run_id\` text NOT NULL,
      \`proposal_payload\` text NOT NULL,
      \`rendered_client_html\` text,
      \`rendered_internal_markdown\` text,
      \`status\` text DEFAULT 'pending' NOT NULL,
      \`reviewed_by_id\` integer,
      \`reviewed_at\` text,
      \`applied_at\` text,
      \`apply_error\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`reviewed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("agent_approval_queue_agent_name_idx", "CREATE INDEX IF NOT EXISTS `agent_approval_queue_agent_name_idx` ON `agent_approval_queue` (`agent_name`)");
    await run("agent_approval_queue_client_idx", "CREATE INDEX IF NOT EXISTS `agent_approval_queue_client_idx` ON `agent_approval_queue` (`client_id`)");
    await run("agent_approval_queue_proposal_type_idx", "CREATE INDEX IF NOT EXISTS `agent_approval_queue_proposal_type_idx` ON `agent_approval_queue` (`proposal_type`)");
    await run("agent_approval_queue_agent_run_id_idx", "CREATE INDEX IF NOT EXISTS `agent_approval_queue_agent_run_id_idx` ON `agent_approval_queue` (`agent_run_id`)");
    await run("agent_approval_queue_status_idx", "CREATE INDEX IF NOT EXISTS `agent_approval_queue_status_idx` ON `agent_approval_queue` (`status`)");
    await run("agent_approval_queue_created_at_idx", "CREATE INDEX IF NOT EXISTS `agent_approval_queue_created_at_idx` ON `agent_approval_queue` (`created_at`)");
    await run("agent_approval_queue_updated_at_idx", "CREATE INDEX IF NOT EXISTS `agent_approval_queue_updated_at_idx` ON `agent_approval_queue` (`updated_at`)");
    await run("locked_docs_rels.agent_approval_queue_id", "ALTER TABLE `payload_locked_documents_rels` ADD `agent_approval_queue_id` integer REFERENCES `agent_approval_queue`(`id`) ON DELETE CASCADE");
  
    // Agent Credentials: encrypted OAuth tokens + API key references per provider.
    await run("agent_credentials", `CREATE TABLE IF NOT EXISTS \`agent_credentials\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`provider\` text NOT NULL UNIQUE,
      \`kind\` text NOT NULL,
      \`data\` text NOT NULL,
      \`force_fallback\` integer DEFAULT 0,
      \`last_refreshed_at\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("agent_credentials_provider_idx", "CREATE INDEX IF NOT EXISTS `agent_credentials_provider_idx` ON `agent_credentials` (`provider`)");
    await run("locked_docs_rels.agent_credentials_id", "ALTER TABLE `payload_locked_documents_rels` ADD `agent_credentials_id` integer REFERENCES `agent_credentials`(`id`) ON DELETE CASCADE");
  
    // Activity Log extensions: agent step fields. All optional; populated only on
    // agent-emitted rows. The matching enum values for activity_log.type are
    // validated by Payload at write time, no schema change needed for those.
    await run("activity_log.agent_run_id", "ALTER TABLE `activity_log` ADD `agent_run_id` text");
    await run("activity_log.agent_name", "ALTER TABLE `activity_log` ADD `agent_name` text");
    await run("activity_log.step", "ALTER TABLE `activity_log` ADD `step` numeric");
    await run("activity_log.tool_name", "ALTER TABLE `activity_log` ADD `tool_name` text");
    await run("activity_log.input", "ALTER TABLE `activity_log` ADD `input` text");
    await run("activity_log.output", "ALTER TABLE `activity_log` ADD `output` text");
    await run("activity_log.reasoning", "ALTER TABLE `activity_log` ADD `reasoning` text");
    await run("activity_log.model", "ALTER TABLE `activity_log` ADD `model` text");
    await run("activity_log.source", "ALTER TABLE `activity_log` ADD `source` text");
    await run("activity_log.duration_ms", "ALTER TABLE `activity_log` ADD `duration_ms` numeric");
    await run("activity_log_agent_run_id_idx", "CREATE INDEX IF NOT EXISTS `activity_log_agent_run_id_idx` ON `activity_log` (`agent_run_id`)");
    await run("activity_log_agent_name_idx", "CREATE INDEX IF NOT EXISTS `activity_log_agent_name_idx` ON `activity_log` (`agent_name`)");
  
    // ── Client Presentations array table (2026-05-08) ──
    await run("clients_presentations", `CREATE TABLE IF NOT EXISTS \`clients_presentations\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`title\` text NOT NULL,
      \`deck_slug\` text NOT NULL,
      \`presented_on\` text,
      \`kind\` text DEFAULT 'deck',
      \`is_public\` integer DEFAULT true,
      \`notes\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_presentations_order_idx", "CREATE INDEX IF NOT EXISTS `clients_presentations_order_idx` ON `clients_presentations` (`_order`)");
    await run("clients_presentations_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_presentations_parent_id_idx` ON `clients_presentations` (`_parent_id`)");
  
    // ── Client Proposal Presentations array table (2026-05-13) ──
    await run("client_proposals_presentations", `CREATE TABLE IF NOT EXISTS \`client_proposals_presentations\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`title\` text NOT NULL,
      \`deck_slug\` text NOT NULL,
      \`presented_on\` text,
      \`kind\` text DEFAULT 'deck',
      \`is_public\` integer DEFAULT true,
      \`notes\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_proposals_presentations_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_presentations_order_idx` ON `client_proposals_presentations` (`_order`)");
    await run("client_proposals_presentations_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_presentations_parent_id_idx` ON `client_proposals_presentations` (`_parent_id`)");
  
    // ── Scheduled Agent Tasks (2026-05-09) ──
    // Recurring agent runs created from chat. The cron tick endpoint loads
    // isActive=true rows whose nextRunAt has elapsed, runs the prompt through
    // the named agent against the linked audit, drops the result into the
    // owner's Gmail Drafts folder, and advances nextRunAt.
    await run("scheduled_agent_tasks", `CREATE TABLE IF NOT EXISTS \`scheduled_agent_tasks\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`title\` text NOT NULL,
      \`task_type\` text DEFAULT 'agent-gmail-draft' NOT NULL,
      \`agent_name\` text DEFAULT 'optimate-google-ads' NOT NULL,
      \`prompt\` text NOT NULL,
      \`audit_id\` integer NOT NULL,
      \`client_id\` integer NOT NULL,
      \`created_by_id\` integer NOT NULL,
      \`recipient_email\` text NOT NULL,
      \`schedule\` text NOT NULL,
      \`timezone\` text DEFAULT 'Australia/Brisbane' NOT NULL,
      \`next_run_at\` text NOT NULL,
      \`last_run_at\` text,
      \`last_run_status\` text,
      \`last_run_error\` text,
      \`last_draft_id\` text,
      \`is_active\` integer DEFAULT 1 NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("scheduled_agent_tasks.task_type", "ALTER TABLE `scheduled_agent_tasks` ADD `task_type` text DEFAULT 'agent-gmail-draft' NOT NULL");
    await run("scheduled_agent_tasks.schedule_mode", "ALTER TABLE `scheduled_agent_tasks` ADD `schedule_mode` text DEFAULT 'manual_cron' NOT NULL");
    await run("scheduled_agent_tasks.monthly_day", "ALTER TABLE `scheduled_agent_tasks` ADD `monthly_day` integer DEFAULT 1");
    await run("scheduled_agent_tasks.time_of_day", "ALTER TABLE `scheduled_agent_tasks` ADD `time_of_day` text DEFAULT '09:00'");
    await run("scheduled_agent_tasks_task_type_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_task_type_idx` ON `scheduled_agent_tasks` (`task_type`)");
    await run("scheduled_agent_tasks_schedule_mode_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_schedule_mode_idx` ON `scheduled_agent_tasks` (`schedule_mode`)");
    await run("scheduled_agent_tasks_audit_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_audit_idx` ON `scheduled_agent_tasks` (`audit_id`)");
    await run("scheduled_agent_tasks_client_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_client_idx` ON `scheduled_agent_tasks` (`client_id`)");
    await run("scheduled_agent_tasks_created_by_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_created_by_idx` ON `scheduled_agent_tasks` (`created_by_id`)");
    await run("scheduled_agent_tasks_next_run_at_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_next_run_at_idx` ON `scheduled_agent_tasks` (`next_run_at`)");
    await run("scheduled_agent_tasks_is_active_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_is_active_idx` ON `scheduled_agent_tasks` (`is_active`)");
    await run("scheduled_agent_tasks_rels", `CREATE TABLE IF NOT EXISTS \`scheduled_agent_tasks_rels\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`order\` integer,
      \`parent_id\` integer NOT NULL,
      \`path\` text NOT NULL,
      \`google_ads_audits_id\` integer,
      \`clients_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`scheduled_agent_tasks\`(\`id\`) ON DELETE CASCADE,
      FOREIGN KEY (\`google_ads_audits_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON DELETE CASCADE,
      FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE CASCADE
    )`);
    await run("scheduled_agent_tasks_rels.clients_id", "ALTER TABLE `scheduled_agent_tasks_rels` ADD `clients_id` integer REFERENCES `clients`(`id`) ON DELETE CASCADE");
    await run("scheduled_agent_tasks_rels_order_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_rels_order_idx` ON `scheduled_agent_tasks_rels` (`order`)");
    await run("scheduled_agent_tasks_rels_parent_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_rels_parent_idx` ON `scheduled_agent_tasks_rels` (`parent_id`)");
    await run("scheduled_agent_tasks_rels_path_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_rels_path_idx` ON `scheduled_agent_tasks_rels` (`path`)");
    await run("scheduled_agent_tasks_rels_google_ads_audits_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_rels_google_ads_audits_idx` ON `scheduled_agent_tasks_rels` (`google_ads_audits_id`)");
    await run("scheduled_agent_tasks_rels_clients_idx", "CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_rels_clients_idx` ON `scheduled_agent_tasks_rels` (`clients_id`)");
    await run("scheduled_agent_tasks.clientsCovered.primary", `INSERT INTO \`scheduled_agent_tasks_rels\` (\`parent_id\`, \`path\`, \`clients_id\`)
      SELECT task.\`id\`, 'clientsCovered', audit.\`client_id\`
      FROM \`scheduled_agent_tasks\` task
      JOIN \`google_ads_audits\` audit ON audit.\`id\` = task.\`audit_id\`
      WHERE audit.\`client_id\` IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM \`scheduled_agent_tasks_rels\` rel
          WHERE rel.\`parent_id\` = task.\`id\`
            AND rel.\`path\` = 'clientsCovered'
            AND rel.\`clients_id\` = audit.\`client_id\`
        )`);
    await run("scheduled_agent_tasks.clientsCovered.additional", `INSERT INTO \`scheduled_agent_tasks_rels\` (\`parent_id\`, \`path\`, \`clients_id\`)
      SELECT DISTINCT rel.\`parent_id\`, 'clientsCovered', audit.\`client_id\`
      FROM \`scheduled_agent_tasks_rels\` rel
      JOIN \`google_ads_audits\` audit ON audit.\`id\` = rel.\`google_ads_audits_id\`
      WHERE rel.\`path\` = 'audits'
        AND audit.\`client_id\` IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM \`scheduled_agent_tasks_rels\` existing
          WHERE existing.\`parent_id\` = rel.\`parent_id\`
            AND existing.\`path\` = 'clientsCovered'
            AND existing.\`clients_id\` = audit.\`client_id\`
        )`);
    await run("locked_docs_rels.scheduled_agent_tasks_id", "ALTER TABLE `payload_locked_documents_rels` ADD `scheduled_agent_tasks_id` integer REFERENCES `scheduled_agent_tasks`(`id`) ON DELETE CASCADE");
  
    // Per-user Gmail OAuth fields used by scheduled-agent-tasks to drop
    // recurring agent reports into the user's own Gmail Drafts folder.
    await run("users.gmail_connected", "ALTER TABLE `users` ADD `gmail_connected` integer DEFAULT 0");
    await run("users.gmail_email", "ALTER TABLE `users` ADD `gmail_email` text");
    await run("users.gmail_access_token", "ALTER TABLE `users` ADD `gmail_access_token` text");
    await run("users.gmail_refresh_token", "ALTER TABLE `users` ADD `gmail_refresh_token` text");
    await run("users.gmail_token_expiry", "ALTER TABLE `users` ADD `gmail_token_expiry` text");

    // ── gsc_site_url on clients (2026-05-11) ──
    await run("clients.gsc_site_url", "ALTER TABLE `clients` ADD `gsc_site_url` text");

    // ── agent_memory + agent_soul (2026-05-12, lazy-loaded memory inspired by Pocket Agent) ──
    await run("agent_memory", `CREATE TABLE IF NOT EXISTS \`agent_memory\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`scope\` text NOT NULL DEFAULT 'client',
      \`client_id\` integer,
      \`category\` text NOT NULL,
      \`subject\` text NOT NULL,
      \`content\` text NOT NULL,
      \`importance\` integer DEFAULT 50,
      \`last_accessed_at\` text,
      \`created_by_id\` integer,
      \`agent_run_id\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("agent_memory_scope_idx", "CREATE INDEX IF NOT EXISTS `agent_memory_scope_idx` ON `agent_memory` (`scope`)");
    await run("agent_memory_client_idx", "CREATE INDEX IF NOT EXISTS `agent_memory_client_idx` ON `agent_memory` (`client_id`)");
    await run("agent_memory_subject_idx", "CREATE INDEX IF NOT EXISTS `agent_memory_subject_idx` ON `agent_memory` (`subject`)");
    await run("agent_memory_dedupe_idx", "CREATE INDEX IF NOT EXISTS `agent_memory_dedupe_idx` ON `agent_memory` (`scope`, `client_id`, `subject`)");
    await run("agent_memory_importance_idx", "CREATE INDEX IF NOT EXISTS `agent_memory_importance_idx` ON `agent_memory` (`importance`)");

    await run("agent_soul", `CREATE TABLE IF NOT EXISTS \`agent_soul\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`aspect\` text NOT NULL,
      \`content\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("agent_soul_aspect_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `agent_soul_aspect_idx` ON `agent_soul` (`aspect`)");
    await run("locked_docs_rels.agent_memory_id", "ALTER TABLE `payload_locked_documents_rels` ADD `agent_memory_id` integer REFERENCES `agent_memory`(`id`) ON DELETE CASCADE");
    await run("locked_docs_rels.agent_soul_id", "ALTER TABLE `payload_locked_documents_rels` ADD `agent_soul_id` integer REFERENCES `agent_soul`(`id`) ON DELETE CASCADE");

    // ── optimate_chat_turns (2026-05-12, persistent chat history per audit + user) ──
    await run("optimate_chat_turns", `CREATE TABLE IF NOT EXISTS \`optimate_chat_turns\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`session_id\` text NOT NULL,
      \`audit_id\` integer NOT NULL,
      \`user_id\` integer NOT NULL,
      \`client_id\` integer,
      \`role\` text NOT NULL,
      \`content\` text NOT NULL,
      \`preview\` text,
      \`run_id\` text,
      \`model_used\` text,
      \`proposal_ids\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("optimate_chat_turns_session_id_idx", "CREATE INDEX IF NOT EXISTS `optimate_chat_turns_session_id_idx` ON `optimate_chat_turns` (`session_id`)");
    await run("optimate_chat_turns_audit_idx", "CREATE INDEX IF NOT EXISTS `optimate_chat_turns_audit_idx` ON `optimate_chat_turns` (`audit_id`)");
    await run("optimate_chat_turns_user_idx", "CREATE INDEX IF NOT EXISTS `optimate_chat_turns_user_idx` ON `optimate_chat_turns` (`user_id`)");
    await run("optimate_chat_turns_client_idx", "CREATE INDEX IF NOT EXISTS `optimate_chat_turns_client_idx` ON `optimate_chat_turns` (`client_id`)");
    await run("optimate_chat_turns_created_at_idx", "CREATE INDEX IF NOT EXISTS `optimate_chat_turns_created_at_idx` ON `optimate_chat_turns` (`created_at`)");
    await run("optimate_chat_turns_session_created_idx", "CREATE INDEX IF NOT EXISTS `optimate_chat_turns_session_created_idx` ON `optimate_chat_turns` (`session_id`, `created_at`)");
    await run("locked_docs_rels.optimate_chat_turns_id", "ALTER TABLE `payload_locked_documents_rels` ADD `optimate_chat_turns_id` integer REFERENCES `optimate_chat_turns`(`id`) ON DELETE CASCADE");

    // ── Match Type Violation Candidates (2026-05-20) ──
    await run("match_type_violation_candidates", `CREATE TABLE IF NOT EXISTS \`match_type_violation_candidates\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`client_id\` integer NOT NULL REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      \`search_term\` text NOT NULL,
      \`triggering_keyword\` text NOT NULL,
      \`campaign_name\` text,
      \`ad_group_name\` text,
      \`match_type\` text NOT NULL,
      \`violation_type\` text NOT NULL,
      \`impressions\` numeric DEFAULT 0,
      \`clicks\` numeric DEFAULT 0,
      \`cost\` numeric DEFAULT 0,
      \`status\` text DEFAULT 'pending',
      \`assigned_list_id\` integer,
      \`approved_at\` text,
      \`rejected_at\` text,
      \`approved_by_id\` integer REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
      \`last_seen_at\` text NOT NULL,
      \`first_seen_at\` text NOT NULL,
      \`run_date\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("mtvc_client_idx", "CREATE INDEX IF NOT EXISTS `match_type_violation_candidates_client_idx` ON `match_type_violation_candidates` (`client_id`)");
    await run("mtvc_status_idx", "CREATE INDEX IF NOT EXISTS `match_type_violation_candidates_status_idx` ON `match_type_violation_candidates` (`status`)");
    await run("mtvc_dedup_unique", "CREATE UNIQUE INDEX IF NOT EXISTS `match_type_violation_candidates_dedup_unique` ON `match_type_violation_candidates` (`client_id`, `search_term`, `triggering_keyword`)");
    await run("locked_docs_rels.match_type_violation_candidates_id", "ALTER TABLE `payload_locked_documents_rels` ADD `match_type_violation_candidates_id` integer REFERENCES `match_type_violation_candidates`(`id`) ON DELETE CASCADE");

    // ── Match Type Sync State (2026-05-20) ──
    await run("match_type_sync_state", `CREATE TABLE IF NOT EXISTS \`match_type_sync_state\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`client_id\` integer NOT NULL UNIQUE REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      \`last_run_at\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("locked_docs_rels.match_type_sync_state_id", "ALTER TABLE `payload_locked_documents_rels` ADD `match_type_sync_state_id` integer REFERENCES `match_type_sync_state`(`id`) ON DELETE CASCADE");

    // ── Client toggle: match type monitor (2026-05-21) ──
    await run("clients.gadsAuto_matchTypeMonitorEnabled", "ALTER TABLE `clients` ADD `gads_auto_match_type_monitor_enabled` integer DEFAULT false");

    // ── CronSettings global (2026-05-21) ──
    await run("cron_settings", `CREATE TABLE IF NOT EXISTS \`cron_settings\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`timezone\` text DEFAULT 'Australia/Sydney' NOT NULL,
      \`match_type_monitor_sync_hour\` numeric DEFAULT 9 NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    // Enable/disable toggle for the Match Type Monitor schedule (2026-05-29).
    // Defaults to true so existing rows keep running until explicitly disabled.
    await run(
      "cron_settings.match_type_monitor_enabled",
      "ALTER TABLE `cron_settings` ADD `match_type_monitor_enabled` integer DEFAULT true NOT NULL",
    );

    // ── ConsolidationCandidates collection (2026-05-21) ──
    await run("consolidation_candidates", `CREATE TABLE IF NOT EXISTS \`consolidation_candidates\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`client\` integer NOT NULL,
      \`nkl\` integer NOT NULL,
      \`nkl_name\` text,
      \`phrase_candidate\` text NOT NULL,
      \`exact_negatives_to_remove\` text NOT NULL,
      \`exact_count\` numeric,
      \`overlap_risk\` integer DEFAULT false,
      \`overlap_details\` text,
      \`status\` text DEFAULT 'pending' NOT NULL,
      \`approved_at\` text,
      \`rejected_at\` text,
      \`approved_by\` integer,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("consolidation_candidates_client_idx", "CREATE INDEX IF NOT EXISTS \`consolidation_candidates_client_idx\` ON \`consolidation_candidates\` (\`client\`)");
    await run("consolidation_candidates_nkl_idx", "CREATE INDEX IF NOT EXISTS \`consolidation_candidates_nkl_idx\` ON \`consolidation_candidates\` (\`nkl\`)");
    await run("consolidation_candidates_status_idx", "CREATE INDEX IF NOT EXISTS \`consolidation_candidates_status_idx\` ON \`consolidation_candidates\` (\`status\`)");
    await run("consolidation_candidates_client_status_idx", "CREATE INDEX IF NOT EXISTS \`consolidation_candidates_client_status_idx\` ON \`consolidation_candidates\` (\`client\`, \`status\`)");
    await run("locked_docs_rels.consolidation_candidates_id", "ALTER TABLE \`payload_locked_documents_rels\` ADD \`consolidation_candidates_id\` integer REFERENCES \`consolidation_candidates\`(\`id\`) ON DELETE cascade");

    // ── client_proposals_cro_key_findings (2026-05-13) ──
    await run("client_proposals_cro_key_findings", `CREATE TABLE IF NOT EXISTS \`client_proposals_cro_key_findings\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`bullet\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("cro_key_findings_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_cro_key_findings_order_idx` ON `client_proposals_cro_key_findings` (`_order`)");
    await run("cro_key_findings_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_cro_key_findings_parent_id_idx` ON `client_proposals_cro_key_findings` (`_parent_id`)");

    // ── google_ads_campaign_budgets standalone fields (2026-05-16) ──
    await run("gacb.standalone", "ALTER TABLE `google_ads_campaign_budgets` ADD `standalone` integer DEFAULT 0");
    await run("gacb.standalone_budget", "ALTER TABLE `google_ads_campaign_budgets` ADD `standalone_budget` numeric");
    await run("gacb.standalone_start_date", "ALTER TABLE `google_ads_campaign_budgets` ADD `standalone_start_date` text");
    await run("gacb.standalone_end_date", "ALTER TABLE `google_ads_campaign_budgets` ADD `standalone_end_date` text");

    // ── deck_url on presentations (2026-05-17) ──
    await run("clients_presentations.deck_url", "ALTER TABLE `clients_presentations` ADD `deck_url` text");
    await run("client_proposals_presentations.deck_url", "ALTER TABLE `client_proposals_presentations` ADD `deck_url` text");

    // ── Template support on clients_presentations (Payload schema requires these for the
    // templateSlug + deckPayload fields in the presentations array — see src/collections/Clients.ts).
    // Missing these blanks out the entire /admin/collections/clients list view.
    await run("clients_presentations.template_slug_id", "ALTER TABLE `clients_presentations` ADD `template_slug_id` integer REFERENCES `deck_templates`(`id`) ON DELETE set null");
    await run("clients_presentations.deck_payload", "ALTER TABLE `clients_presentations` ADD `deck_payload` text");
    await run("clients_presentations_template_slug_idx", "CREATE INDEX IF NOT EXISTS `clients_presentations_template_slug_idx` ON `clients_presentations` (`template_slug_id`)");

    // ── deck_templates (2026-05-17) ──
    // preview_image is a Payload upload field → stored as preview_image_id integer FK to media.
    // Note: the formal migration in src/migrations/ originally wrote `preview_image integer` (no _id, no FK).
    // We use the correct shape here; if a prior run created the wrong column, the repair ALTER below adds
    // the correct one (the bad column is ignored by Payload).
    await run("deck_templates", `CREATE TABLE IF NOT EXISTS \`deck_templates\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`template_slug\` text NOT NULL,
      \`name\` text NOT NULL,
      \`description\` text,
      \`category\` text NOT NULL,
      \`preview_image_id\` integer REFERENCES \`media\`(\`id\`) ON DELETE set null,
      \`is_active\` integer DEFAULT 1,
      \`is_default\` integer DEFAULT 0,
      \`notes\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run("deck_templates.preview_image_id_repair", "ALTER TABLE `deck_templates` ADD `preview_image_id` integer REFERENCES `media`(`id`) ON DELETE set null");
    await run("deck_templates_template_slug_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `deck_templates_template_slug_idx` ON `deck_templates` (`template_slug`)");
    await run("deck_templates_category_idx", "CREATE INDEX IF NOT EXISTS `deck_templates_category_idx` ON `deck_templates` (`category`)");
    await run("deck_templates_created_at_idx", "CREATE INDEX IF NOT EXISTS `deck_templates_created_at_idx` ON `deck_templates` (`created_at`)");
    await run("deck_templates_updated_at_idx", "CREATE INDEX IF NOT EXISTS `deck_templates_updated_at_idx` ON `deck_templates` (`updated_at`)");
    await run("deck_templates_preview_image_idx", "CREATE INDEX IF NOT EXISTS `deck_templates_preview_image_idx` ON `deck_templates` (`preview_image_id`)");
    await run("locked_docs_rels.deck_templates_id", "ALTER TABLE `payload_locked_documents_rels` ADD `deck_templates_id` integer REFERENCES `deck_templates`(`id`) ON DELETE CASCADE");

    // ── contracts: Annual Review & Tier Adjustment (2026-05-15) ──
    // Optional section gated by `annual_review_enabled`. Rich-text fields
    // are stored as JSON-encoded text (matching Payload's other richText
    // columns); the tier table is plain text (tab/multi-space separated)
    // and parsed at render time by parseTierTable().
    await run("contracts.annual_review_enabled", "ALTER TABLE `contracts` ADD `annual_review_enabled` integer DEFAULT 0");
    await run("contracts.annual_review_intro", "ALTER TABLE `contracts` ADD `annual_review_intro` text");
    await run("contracts.annual_review_tier_table_text", "ALTER TABLE `contracts` ADD `annual_review_tier_table_text` text");
    await run("contracts.annual_review_notice", "ALTER TABLE `contracts` ADD `annual_review_notice` text");
    await run("contracts.annual_review_good_faith_review", "ALTER TABLE `contracts` ADD `annual_review_good_faith_review` text");
    await run("contracts.annual_review_acceptance", "ALTER TABLE `contracts` ADD `annual_review_acceptance` text");

    // ── contracts.currency (2026-05-15) ──
    // Currency code (AUD/USD/GBP/EUR/NZD/CAD/SGD). Shown in the pricing
    // table header as "Amount (CCY)" and used by formatCurrency() to format
    // every monetary value.
    await run("contracts.currency", "ALTER TABLE `contracts` ADD `currency` text DEFAULT 'AUD'");

    // ── contracts.effective_date_confirmed (2026-05-15) ──
    // Toggle controlling the "(to be confirmed with client)" qualifier on
    // the cover page next to the effective date. When ON the qualifier
    // is hidden (rendered as a plain date).
    await run("contracts.effective_date_confirmed", "ALTER TABLE `contracts` ADD `effective_date_confirmed` integer DEFAULT 0");

    // ── client_proposals: pre-sale Notes + Prospect Timeline + Discovery Notes (2026-05-18) ──
    // Schemas mirror clients.client_notes / clients.client_account_timeline so the existing
    // ClientNotesTable / AccountTimelineTable React components work unchanged (they read the
    // field path from props). The discovery_notes column is a single text field on client_proposals
    // — the Pre-sale Discovery tab in admin will grow more tools later, but the column is enough for v1.
    await run("client_proposals_notes", `CREATE TABLE IF NOT EXISTS \`client_proposals_notes\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`category\` text DEFAULT 'general',
      \`date\` text NOT NULL,
      \`author\` text,
      \`content\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_proposals_notes_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_notes_order_idx` ON `client_proposals_notes` (`_order`)");
    await run("client_proposals_notes_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_notes_parent_id_idx` ON `client_proposals_notes` (`_parent_id`)");

    await run("client_proposals_account_timeline", `CREATE TABLE IF NOT EXISTS \`client_proposals_account_timeline\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`date\` text NOT NULL,
      \`service_area\` text DEFAULT 'google_ads',
      \`action_type\` text NOT NULL,
      \`description\` text NOT NULL,
      \`added_by\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_proposals_account_timeline_order_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_account_timeline_order_idx` ON `client_proposals_account_timeline` (`_order`)");
    await run("client_proposals_account_timeline_parent_id_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_account_timeline_parent_id_idx` ON `client_proposals_account_timeline` (`_parent_id`)");

    await run("client_proposals.discovery_notes", "ALTER TABLE `client_proposals` ADD `discovery_notes` text");

    // ── Contract annual-review reminders (2026-05-15) ──
    // Master toggle on contracts + dedicated rels rows for the hasMany
    // recipient relationship + new contract_reminders / notifications tables
    // + their locked-docs FKs.
    await run("contracts.annual_review_reminder_enabled", "ALTER TABLE `contracts` ADD `annual_review_reminder_enabled` integer DEFAULT 1");

    // Payload stores hasMany relationship fields in a `<collection>_rels`
    // table (see permission_profiles migration for the precedent).
    // contracts.annualReviewReminderRecipients (hasMany users) needs:
    //   - a `contracts_rels` table if it doesn't exist (path='annualReviewReminderRecipients', users_id FK)
    await run("contracts_rels", `CREATE TABLE IF NOT EXISTS \`contracts_rels\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`order\` integer,
      \`parent_id\` integer NOT NULL,
      \`path\` text NOT NULL,
      \`users_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("contracts_rels_order_idx", "CREATE INDEX IF NOT EXISTS `contracts_rels_order_idx` ON `contracts_rels` (`order`)");
    await run("contracts_rels_parent_idx", "CREATE INDEX IF NOT EXISTS `contracts_rels_parent_idx` ON `contracts_rels` (`parent_id`)");
    await run("contracts_rels_path_idx", "CREATE INDEX IF NOT EXISTS `contracts_rels_path_idx` ON `contracts_rels` (`path`)");
    await run("contracts_rels_users_idx", "CREATE INDEX IF NOT EXISTS `contracts_rels_users_id_idx` ON `contracts_rels` (`users_id`)");

    // contract_reminders: one row per scheduled reminder.
    await run("contract_reminders", `CREATE TABLE IF NOT EXISTS \`contract_reminders\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`contract_id\` integer NOT NULL,
      \`kind\` text NOT NULL,
      \`send_at\` text NOT NULL,
      \`status\` text NOT NULL DEFAULT 'pending',
      \`sent_at\` text,
      \`last_error\` text,
      \`notes\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("contract_reminders_contract_idx", "CREATE INDEX IF NOT EXISTS `contract_reminders_contract_idx` ON `contract_reminders` (`contract_id`)");
    await run("contract_reminders_status_idx", "CREATE INDEX IF NOT EXISTS `contract_reminders_status_idx` ON `contract_reminders` (`status`)");
    await run("contract_reminders_send_at_idx", "CREATE INDEX IF NOT EXISTS `contract_reminders_send_at_idx` ON `contract_reminders` (`send_at`)");
    await run("contract_reminders_status_send_at_idx", "CREATE INDEX IF NOT EXISTS `contract_reminders_status_send_at_idx` ON `contract_reminders` (`status`, `send_at`)");

    // contract_reminders.recipients (hasMany users) -> contract_reminders_rels
    await run("contract_reminders_rels", `CREATE TABLE IF NOT EXISTS \`contract_reminders_rels\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`order\` integer,
      \`parent_id\` integer NOT NULL,
      \`path\` text NOT NULL,
      \`users_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`contract_reminders\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("contract_reminders_rels_order_idx", "CREATE INDEX IF NOT EXISTS `contract_reminders_rels_order_idx` ON `contract_reminders_rels` (`order`)");
    await run("contract_reminders_rels_parent_idx", "CREATE INDEX IF NOT EXISTS `contract_reminders_rels_parent_idx` ON `contract_reminders_rels` (`parent_id`)");
    await run("contract_reminders_rels_path_idx", "CREATE INDEX IF NOT EXISTS `contract_reminders_rels_path_idx` ON `contract_reminders_rels` (`path`)");
    await run("contract_reminders_rels_users_idx", "CREATE INDEX IF NOT EXISTS `contract_reminders_rels_users_id_idx` ON `contract_reminders_rels` (`users_id`)");

    // notifications: per-user in-CMS notifications.
    await run("notifications", `CREATE TABLE IF NOT EXISTS \`notifications\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`recipient_id\` integer NOT NULL,
      \`kind\` text NOT NULL,
      \`title\` text NOT NULL,
      \`body\` text,
      \`url\` text,
      \`related_contract_id\` integer,
      \`related_client_id\` integer,
      \`read_at\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`recipient_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`related_contract_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`related_client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("notifications_recipient_idx", "CREATE INDEX IF NOT EXISTS `notifications_recipient_idx` ON `notifications` (`recipient_id`)");
    await run("notifications_read_at_idx", "CREATE INDEX IF NOT EXISTS `notifications_read_at_idx` ON `notifications` (`read_at`)");
    await run("notifications_recipient_read_at_idx", "CREATE INDEX IF NOT EXISTS `notifications_recipient_read_at_idx` ON `notifications` (`recipient_id`, `read_at`)");
    await run("notifications_created_at_idx", "CREATE INDEX IF NOT EXISTS `notifications_created_at_idx` ON `notifications` (`created_at`)");

    // payload_locked_documents_rels FKs for the two new collections.
    await run("locked_docs_rels.contract_reminders_id", "ALTER TABLE `payload_locked_documents_rels` ADD `contract_reminders_id` integer REFERENCES `contract_reminders`(`id`) ON DELETE cascade");
    await run("locked_docs_rels.notifications_id", "ALTER TABLE `payload_locked_documents_rels` ADD `notifications_id` integer REFERENCES `notifications`(`id`) ON DELETE cascade");

    // ── invoice_statement_drafts (2026-05-19) ─────────────────────────────────
    // Aggregated outstanding-invoice statement drafts generated by the
    // monthly sweep cron (`/api/invoice-statements/sweep`).
    await run("invoice_statement_drafts", `CREATE TABLE IF NOT EXISTS \`invoice_statement_drafts\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`status\` text DEFAULT 'pending' NOT NULL,
      \`generated_at\` text NOT NULL,
      \`xero_contact_id\` text NOT NULL,
      \`contact_name\` text NOT NULL,
      \`recipient_email\` text DEFAULT '' NOT NULL,
      \`client_id\` integer,
      \`total_outstanding\` numeric DEFAULT 0 NOT NULL,
      \`total_overdue\` numeric DEFAULT 0 NOT NULL,
      \`unpaid_count\` numeric DEFAULT 0 NOT NULL,
      \`overdue_count\` numeric DEFAULT 0 NOT NULL,
      \`snapshot\` text NOT NULL,
      \`custom_message\` text,
      \`reviewed_by_id\` integer,
      \`reviewed_at\` text,
      \`sent_at\` text,
      \`postmark_message_id\` text,
      \`cc_list\` text,
      \`send_error\` text,
      \`rejection_reason\` text,
      \`last_refreshed_at\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`reviewed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("invoice_statement_drafts_status_idx", "CREATE INDEX IF NOT EXISTS `invoice_statement_drafts_status_idx` ON `invoice_statement_drafts` (`status`)");
    await run("invoice_statement_drafts_generated_at_idx", "CREATE INDEX IF NOT EXISTS `invoice_statement_drafts_generated_at_idx` ON `invoice_statement_drafts` (`generated_at`)");
    await run("invoice_statement_drafts_xero_contact_id_idx", "CREATE INDEX IF NOT EXISTS `invoice_statement_drafts_xero_contact_id_idx` ON `invoice_statement_drafts` (`xero_contact_id`)");
    await run("locked_docs_rels.invoice_statement_drafts_id", "ALTER TABLE `payload_locked_documents_rels` ADD `invoice_statement_drafts_id` integer REFERENCES `invoice_statement_drafts`(`id`) ON DELETE cascade");
    await run("invoice_statement_drafts.greeting_override", "ALTER TABLE `invoice_statement_drafts` ADD `greeting_override` text");

    // ── email_templates: Signature + Invoice Statement tab columns (2026-05-19) ──
    // Added when EmailTemplates global gained the Signature and Invoice
    // Statement nested tabs. Each column is a separate ALTER (SQLite has no
    // multi-column ADD), wrapped by `run()` which already catches "duplicate
    // column" errors and reports them as SKIP.
    const emailTemplatesAdds: Array<[string, string]> = [
      ["signature_html", "text"],
      ["signature_logo_image_id", "integer REFERENCES `media`(`id`) ON DELETE set null"],
      ["signature_google_badge_id", "integer REFERENCES `media`(`id`) ON DELETE set null"],
      ["signature_meta_badge_id", "integer REFERENCES `media`(`id`) ON DELETE set null"],
      ["statement_from_email", "text"],
      ["statement_reply_to_email", "text"],
      ["statement_cc_emails", "text"],
      ["statement_subject_template", "text"],
      ["statement_greeting", "text"],
      ["statement_opening_line", "text"],
      ["statement_summary_template", "text"],
      ["statement_payment_methods_html", "text"],
      ["statement_closing_line", "text"],
      ["statement_sign_off", "text"],
      ["statement_sender_name", "text"],
    ];
    for (const [col, type] of emailTemplatesAdds) {
      await run(
        `email_templates.${col}`,
        `ALTER TABLE \`email_templates\` ADD \`${col}\` ${type}`,
      );
    }

    // ── pin_rate_limits (2026-05-20) ───────────────────────────────────────────────
    // Persistent per-target lockout buckets for 4-digit PIN endpoints.
    // Replaces in-memory IP-keyed rate-limiters — see
    // `src/collections/PinRateLimits.ts` for the rationale. Bucketed per
    // target (audit/proposal/client), immune to lambda fan-out and XFF
    // rotation. 5 wrong attempts in 15min → 15min lockout.
    await run("pin_rate_limits", `CREATE TABLE IF NOT EXISTS \`pin_rate_limits\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`bucket_key\` text NOT NULL,
      \`attempts\` numeric DEFAULT 0 NOT NULL,
      \`locked_until\` text,
      \`window_start\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )`);
    await run(
      "pin_rate_limits_bucket_key_idx",
      "CREATE UNIQUE INDEX IF NOT EXISTS `pin_rate_limits_bucket_key_idx` ON `pin_rate_limits` (`bucket_key`)",
    );
    await run(
      "locked_docs_rels.pin_rate_limits_id",
      "ALTER TABLE `payload_locked_documents_rels` ADD `pin_rate_limits_id` integer REFERENCES `pin_rate_limits`(`id`) ON DELETE cascade",
    );

    // ── Setup fee, pro-rated retainer, retainer-tagged one-offs, contract
    //    additionalWork (2026-05-18) ──────────────────────────────────────────────
    // Clients: one-time setup fee, counts toward Retainer YTD in the calendar
    // year of clientStartDate.
    await run(
      "clients.setup_fee",
      "ALTER TABLE `clients` ADD `setup_fee` numeric",
    );
    // One-off project rows can now be flagged as "part of the retainer".
    await run(
      "clients_one_off_projects.count_towards_retainer",
      "ALTER TABLE `clients_one_off_projects` ADD `count_towards_retainer` integer DEFAULT false",
    );
    // Contracts: explicit engagement-effective date (separate from contractDate).
    await run(
      "contracts.contract_start_date",
      "ALTER TABLE `contracts` ADD `contract_start_date` text",
    );
    // Contracts: additionalWork sub-table (mirrors clients' oneOffProjects).
    await run(
      "contracts_additional_work",
      `CREATE TABLE IF NOT EXISTS \`contracts_additional_work\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`project_name\` text NOT NULL,
        \`amount\` numeric NOT NULL,
        \`count_towards_retainer\` integer DEFAULT false,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE cascade
      )`,
    );
    await run(
      "contracts_additional_work_order_idx",
      "CREATE INDEX IF NOT EXISTS `contracts_additional_work_order_idx` ON `contracts_additional_work` (`_order`)",
    );
    await run(
      "contracts_additional_work_parent_id_idx",
      "CREATE INDEX IF NOT EXISTS `contracts_additional_work_parent_id_idx` ON `contracts_additional_work` (`_parent_id`)",
    );

    // ── Per-year historical revenue (2026-05-18) ──────────────────────────────────
    // Replaces the single `clients.historical_revenue` column. The old
    // column stays on disk — Payload just stops surfacing it. The sum of
    // these rows now feeds `billingSummary` and the dashboard's
    // `historicalTotal` rollup.
    await run(
      "clients_historical_revenue_by_year",
      `CREATE TABLE IF NOT EXISTS \`clients_historical_revenue_by_year\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`year\` numeric NOT NULL,
        \`amount\` numeric NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
      )`,
    );
    await run(
      "clients_historical_revenue_by_year_order_idx",
      "CREATE INDEX IF NOT EXISTS `clients_historical_revenue_by_year_order_idx` ON `clients_historical_revenue_by_year` (`_order`)",
    );
    await run(
      "clients_historical_revenue_by_year_parent_id_idx",
      "CREATE INDEX IF NOT EXISTS `clients_historical_revenue_by_year_parent_id_idx` ON `clients_historical_revenue_by_year` (`_parent_id`)",
    );

    // ── Revenue share percentage on clients (2026-05-18) ──────────────────
    // Agency's share of a client's revenue, in percent. Defaults to 100;
    // set to 50 for a 50/50 partner split. Applied at the dashboard
    // rollup + billingSummary layer; contract amounts unchanged.
    await run(
      "clients.revenue_share_percent",
      "ALTER TABLE `clients` ADD `revenue_share_percent` numeric DEFAULT 100",
    );

    // ── Hide-setup-fee toggle (2026-05-18) ───────────────────────────────
    // Contracts: per-contract toggle to hide the setup-fee row in the pricing
    // table and the matching default Payment Terms bullet. Used when an
    // Additional Work line item replaces the setup fee.
    // ── Contracts soft-delete trash (2026-05-18) ─────────────────────────
    // Adds deletedAt to support a 30-day recovery window. Trashed contracts
    // are hidden from the default list and auto-purged via a daily cron.
    await run(
      "contracts.deleted_at",
      "ALTER TABLE `contracts` ADD `deleted_at` text",
    );
    await run(
      "contracts_deleted_at_idx",
      "CREATE INDEX IF NOT EXISTS `contracts_deleted_at_idx` ON `contracts` (`deleted_at`)",
    );

    // ── Per-year sales targets on clients (2026-05-18) ───────────────────
    // Replaces the single `yearlySalesTarget` + `targetDeadlineDate` fields
    // on the agency client. Any non-agency client can also have rows here
    // for tracking purposes (no agency-wide aggregation yet).
    await run(
      "clients_yearly_targets",
      `CREATE TABLE IF NOT EXISTS \`clients_yearly_targets\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`year\` numeric NOT NULL,
        \`target\` numeric NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
      )`,
    );
    await run(
      "clients_yearly_targets_order_idx",
      "CREATE INDEX IF NOT EXISTS `clients_yearly_targets_order_idx` ON `clients_yearly_targets` (`_order`)",
    );
    await run(
      "clients_yearly_targets_parent_id_idx",
      "CREATE INDEX IF NOT EXISTS `clients_yearly_targets_parent_id_idx` ON `clients_yearly_targets` (`_parent_id`)",
    );
    // Backfill: copy each client's existing yearly_sales_target into a row
    // for the current calendar year, but only if the client doesn't already
    // have any rows in the new table. Idempotent — re-running this is a
    // no-op once rows exist.
    await run(
      "clients_yearly_targets_backfill",
      `INSERT INTO \`clients_yearly_targets\` (\`_order\`, \`_parent_id\`, \`id\`, \`year\`, \`target\`)
       SELECT 1, c.id, lower(hex(randomblob(12))), CAST(strftime('%Y', 'now') AS INTEGER), c.yearly_sales_target
       FROM clients c
       WHERE c.yearly_sales_target IS NOT NULL
         AND c.yearly_sales_target > 0
         AND NOT EXISTS (SELECT 1 FROM clients_yearly_targets t WHERE t._parent_id = c.id)`,
    );

    await run(
      "contracts.hide_setup_fee",
      "ALTER TABLE `contracts` ADD `hide_setup_fee` integer DEFAULT 0",
    );

    // ── Effective-date-on-deposit toggle (2026-05-18) ───────────────────
    // Contracts: per-contract toggle that switches the cover-page qualifier
    // from "(to be confirmed with client)" to "(once the deposit has been
    // paid)". Ignored when effective_date_confirmed is ON.
    await run(
      "contracts.effective_date_on_deposit",
      "ALTER TABLE `contracts` ADD `effective_date_on_deposit` integer DEFAULT 0",
    );

    // ── Agent-approval bell broadcasts (2026-05-19) ─────────────────
    // Notifications gained a `relatedApproval` field so per-user bell rows
    // created when an agent queues a proposal can be cleared in one shot
    // once any teammate approves or rejects the queue item.
    await run(
      "notifications.related_approval_id",
      "ALTER TABLE `notifications` ADD `related_approval_id` integer REFERENCES `agent_approval_queue`(`id`) ON UPDATE no action ON DELETE set null",
    );
    await run(
      "notifications_related_approval_idx",
      "CREATE INDEX IF NOT EXISTS `notifications_related_approval_idx` ON `notifications` (`related_approval_id`)",
    );

    // Notifications gained a `relatedMeetingScheduler` field (2026-07-02) so
    // bell rows for meeting accept/decline/confirmed link back to the scheduler.
    await run(
      "notifications.related_meeting_scheduler_id",
      "ALTER TABLE `notifications` ADD `related_meeting_scheduler_id` integer REFERENCES `meeting_schedulers`(`id`) ON UPDATE no action ON DELETE set null",
    );
    await run(
      "notifications_related_meeting_scheduler_idx",
      "CREATE INDEX IF NOT EXISTS `notifications_related_meeting_scheduler_idx` ON `notifications` (`related_meeting_scheduler_id`)",
    );

    // ── Per-contract toggle: hide the tier table inside Annual Review (2026-05-19)
    // Defaults to 1 (TRUE) so every existing contract keeps its table rendered.
    // When set to 0, the contract template, PDF, HTML signing page, and DOCX
    // export all skip just the tier-table block. The surrounding intro,
    // notice, good-faith, and acceptance paragraphs continue to render.
    await run(
      "contracts.annual_review_tier_table_enabled",
      "ALTER TABLE `contracts` ADD `annual_review_tier_table_enabled` integer DEFAULT 1",
    );

    // ── SERP Displacement / AI Visibility / GA4 / GSC carry-over fields on
    // client_proposals (2026-05-22). Lets the Audit Results tab persist the
    // proposal-side GA4 property + GSC URL, exposes the SERP/AI Visibility
    // enable toggles, and tracks the latest snapshot via FK so the proposal
    // page can link straight to it. All nullable; safe defaults for existing
    // rows.
    await run(
      "client_proposals.ga4_property_id",
      "ALTER TABLE `client_proposals` ADD `ga4_property_id` text",
    );
    await run(
      "client_proposals.gsc_site_url",
      "ALTER TABLE `client_proposals` ADD `gsc_site_url` text",
    );
    await run(
      "client_proposals.serp_monitor_enabled",
      "ALTER TABLE `client_proposals` ADD `serp_monitor_enabled` integer DEFAULT false",
    );
    await run(
      "client_proposals.ai_visibility_enabled",
      "ALTER TABLE `client_proposals` ADD `ai_visibility_enabled` integer DEFAULT false",
    );
    await run(
      "client_proposals.latest_serp_displacement_snapshot_id",
      "ALTER TABLE `client_proposals` ADD `latest_serp_displacement_snapshot_id` integer REFERENCES `serp_displacement_snapshots`(`id`) ON DELETE SET NULL",
    );
    await run(
      "client_proposals_latest_serp_displacement_snapshot_idx",
      "CREATE INDEX IF NOT EXISTS `client_proposals_latest_serp_displacement_snapshot_idx` ON `client_proposals` (`latest_serp_displacement_snapshot_id`)",
    );
    await run(
      "client_proposals.latest_ai_visibility_snapshot_id",
      "ALTER TABLE `client_proposals` ADD `latest_ai_visibility_snapshot_id` integer REFERENCES `ai_visibility_snapshots`(`id`) ON DELETE SET NULL",
    );
    await run(
      "client_proposals_latest_ai_visibility_snapshot_idx",
      "CREATE INDEX IF NOT EXISTS `client_proposals_latest_ai_visibility_snapshot_idx` ON `client_proposals` (`latest_ai_visibility_snapshot_id`)",
    );

    // Per-client Meta ad account ID (Tools tab — task 1.1). Optional; the
    // shared agency Meta Business Manager uses this to scope status checks
    // and future Meta Ads dashboard data to the right account.
    await run(
      "clients.meta_ad_account_id",
      "ALTER TABLE `clients` ADD `meta_ad_account_id` text",
    );

    // ── Drop orphan top-level clients.gsc_site_url (2026-05-24).
    // gsc_property_url is the OAuth-derived source of truth used by every
    // real GSC consumer. The orphan column had no readers (only fallbacks).
    // Backfill any operator-typed URL into gsc_property_url first so nothing
    // is lost, then drop the column. SQLite 3.35+ / recent libSQL support
    // ALTER TABLE ... DROP COLUMN.
    await run(
      "clients.gsc_site_url_backfill",
      "UPDATE `clients` SET `gsc_property_url` = `gsc_site_url` WHERE (`gsc_property_url` IS NULL OR `gsc_property_url` = '') AND `gsc_site_url` IS NOT NULL AND `gsc_site_url` != ''",
    );
    await run(
      "clients.gsc_site_url_drop",
      "ALTER TABLE `clients` DROP COLUMN `gsc_site_url`",
    );

    // ── Additional client-side contacts array (Business tab, 2026-05-24).
    // Mirrors the clients_account_managers sub-table pattern: text PK,
    // _order/_parent_id, FK to clients(id) cascade. No locked-docs FK needed
    // (sub-tables don't get their own locked-docs entry).
    await run(
      "clients_additional_contacts",
      `CREATE TABLE IF NOT EXISTS \`clients_additional_contacts\` (
        \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`name\` text NOT NULL, \`email\` text NOT NULL,
        \`job_title\` text, \`responsibilities\` text,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
      )`,
    );
    await run(
      "clients_additional_contacts_order_idx",
      "CREATE INDEX IF NOT EXISTS `clients_additional_contacts_order_idx` ON `clients_additional_contacts` (`_order`)",
    );
    await run(
      "clients_additional_contacts_parent_id_idx",
      "CREATE INDEX IF NOT EXISTS `clients_additional_contacts_parent_id_idx` ON `clients_additional_contacts` (`_parent_id`)",
    );
    // Contact phone fields (2026-06-21). Added to the collection config after
    // both tables already existed in prod, but only shipped in the registry
    // migration — never as ALTERs here — so prod lacked these columns and saving
    // ANY client 500'd on the clients insert. (The CREATE TABLE above only
    // includes contact_phone for fresh DBs; existing prod tables need the
    // ALTER.) See src/migrations/20260621_120000_add_contact_phone_fields.ts.
    await run("clients.contact_phone", "ALTER TABLE `clients` ADD `contact_phone` text");
    await run("clients_additional_contacts.phone", "ALTER TABLE `clients_additional_contacts` ADD `phone` text");

    // ── Optional engagement end date on contracts (2026-05-25). When set, the
    // cover page renders an "End Date:" line below the effective date on the
    // PDF / signing page / DOCX. When null the line is omitted entirely.
    await run(
      "contracts.contract_end_date",
      "ALTER TABLE `contracts` ADD `contract_end_date` text",
    );

    // ── Optional client ACN/ABN and business address on contracts (2026-05-25).
    // Both render on the cover page only when set, and can be filled in by
    // the client on the e-contract signing form.
    await run(
      "contracts.client_acn",
      "ALTER TABLE `contracts` ADD `client_acn` text",
    );
    await run(
      "contracts.client_business_address",
      "ALTER TABLE `contracts` ADD `client_business_address` text",
    );

    // ── Optional trading / operating name on contracts + clients (2026-05-26).
    // `contracts.client_trading_name` renders on the cover page and signing
    // page when set. `clients.trading_name` receives the value via the
    // contract→client sync on signature so it persists in the client record.
    await run(
      "contracts.client_trading_name",
      "ALTER TABLE `contracts` ADD `client_trading_name` text",
    );
    await run(
      "clients.trading_name",
      "ALTER TABLE `clients` ADD `trading_name` text",
    );

    // ── Relax `deck_slug NOT NULL` on the two presentations sub-tables
    // (2026-05-25). The admin field is read-only and derived from `deck_url`
    // via the `derivePresentationDeckSlugs` beforeChange hook — if any code
    // path bypasses the hook (or the hook returns an empty derived slug for a
    // non-/partners/ URL with an empty path), the insert fails the NOT NULL
    // check and the save returns 500. SQLite has no ALTER COLUMN, so we have
    // to rebuild each table. Gate the rebuild on a PRAGMA check so a cold
    // start that hits an already-nullable column is a fast no-op.
    async function relaxDeckSlugNotNull(
      table: string,
      parentTable: string,
      extraColumns: string,
      extraColumnNames: string,
    ): Promise<void> {
      const label = `${table}.deck_slug_nullable`;
      try {
        const info = (await client!.execute(
          `PRAGMA table_info(\`${table}\`)`,
        )) as { rows: Array<{ name?: string; notnull?: number } | unknown[]> };
        const deckSlugRow = info.rows.find((r: any) => {
          const name = r?.name ?? r?.[1];
          return name === "deck_slug";
        }) as { notnull?: number } | undefined;
        if (!deckSlugRow) {
          // Table or column missing — the CREATE TABLE step above will have
          // built the latest shape on a fresh DB, so nothing to do.
          const r: MigrationResult = { label, status: "skip", message: "column absent" };
          opts?.onProgress?.(r);
          results.push(r);
          return;
        }
        if (Number(deckSlugRow.notnull) === 0) {
          const r: MigrationResult = { label, status: "skip", message: "already nullable" };
          opts?.onProgress?.(r);
          results.push(r);
          return;
        }

        // Rebuild the table with deck_slug nullable. Foreign keys off during
        // the swap so the rename doesn't trip child-table constraints.
        await client!.execute(`PRAGMA foreign_keys = OFF`);
        try {
          await client!.execute(
            `ALTER TABLE \`${table}\` RENAME TO \`_${table}_old\``,
          );
          await client!.execute(
            `CREATE TABLE \`${table}\` (
              \`_order\` integer NOT NULL,
              \`_parent_id\` integer NOT NULL,
              \`id\` text PRIMARY KEY NOT NULL,
              \`title\` text NOT NULL,
              \`deck_slug\` text,
              \`deck_url\` text,
              \`presented_on\` text,
              \`kind\` text DEFAULT 'deck',
              \`is_public\` integer DEFAULT true,
              \`notes\` text${extraColumns ? ",\n              " + extraColumns : ""},
              FOREIGN KEY (\`_parent_id\`) REFERENCES \`${parentTable}\`(\`id\`) ON UPDATE no action ON DELETE cascade
            )`,
          );
          const cols = `\`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`deck_slug\`, \`deck_url\`, \`presented_on\`, \`kind\`, \`is_public\`, \`notes\`${extraColumnNames ? ", " + extraColumnNames : ""}`;
          await client!.execute(
            `INSERT INTO \`${table}\` (${cols}) SELECT ${cols} FROM \`_${table}_old\``,
          );
          await client!.execute(`DROP TABLE \`_${table}_old\``);
          await client!.execute(
            `CREATE INDEX IF NOT EXISTS \`${table}_order_idx\` ON \`${table}\` (\`_order\`)`,
          );
          await client!.execute(
            `CREATE INDEX IF NOT EXISTS \`${table}_parent_id_idx\` ON \`${table}\` (\`_parent_id\`)`,
          );
          if (table === "clients_presentations") {
            await client!.execute(
              "CREATE INDEX IF NOT EXISTS `clients_presentations_template_slug_idx` ON `clients_presentations` (`template_slug_id`)",
            );
          }
        } finally {
          await client!.execute(`PRAGMA foreign_keys = ON`);
        }

        const r: MigrationResult = { label, status: "ok" };
        opts?.onProgress?.(r);
        results.push(r);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const r: MigrationResult = { label, status: "error", message: msg };
        opts?.onProgress?.(r);
        results.push(r);
      }
    }
    // clients_presentations carries deck-template fields too — the rebuild
    // must preserve them or the post-copy schema would lose data.
    await relaxDeckSlugNotNull(
      "clients_presentations",
      "clients",
      "`template_slug_id` integer REFERENCES `deck_templates`(`id`) ON DELETE set null,\n              `deck_payload` text",
      "`template_slug_id`, `deck_payload`",
    );
    await relaxDeckSlugNotNull(
      "client_proposals_presentations",
      "client_proposals",
      "",
      "",
    );

    // ── Drop legacy client_proposals.discovery_notes (2026-05-29).
    // Superseded by the structured client-discovery-briefings collection,
    // which now re-points onto the new client on conversion. No data worth
    // preserving per product decision. SQLite 3.35+ / libSQL supports DROP
    // COLUMN; the `run()` helper swallows the failure if the column is
    // already gone (idempotent).
    await run(
      "client_proposals.discovery_notes_drop",
      "ALTER TABLE `client_proposals` DROP COLUMN `discovery_notes`",
    );

    // ── Add require_pin to client_discovery_briefings (2026-05-30).
    // Surfaced as a per-briefing toggle on the Discovery Briefing admin tab
    // — when ON, the public route gates entry on the parent's PIN (proposal
    // PIN with linked-client PIN fallback, or client PIN).
    await run(
      "client_discovery_briefings.require_pin",
      "ALTER TABLE `client_discovery_briefings` ADD `require_pin` integer DEFAULT 0",
    );

    // ── google_ads_snapshots (2026-06-01) ─────────────────────────────────────────
    // Daily-cron snapshot of Google Ads metrics per (client, level). One row
    // per (client, level) — the cron upserts on the UNIQUE index. Powers
    // OptiMate read tools and Goal Agents so they don't hammer Growth Tools
    // on every page load. `rows` is JSON text; shape varies per level (see
    // src/collections/GoogleAdsSnapshots.ts for the per-level row schema).
    await run("google_ads_snapshots", `CREATE TABLE IF NOT EXISTS \`google_ads_snapshots\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`client_id\` integer NOT NULL,
      \`level\` text NOT NULL,
      \`captured_at\` text NOT NULL,
      \`date_range_label\` text,
      \`date_range_start\` text,
      \`date_range_end\` text,
      \`customer_id\` text NOT NULL,
      \`row_count\` numeric,
      \`rows\` text,
      \`source_endpoint\` text,
      \`fetch_duration_ms\` numeric,
      \`error\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("google_ads_snapshots_client_idx", "CREATE INDEX IF NOT EXISTS `google_ads_snapshots_client_idx` ON `google_ads_snapshots` (`client_id`)");
    await run("google_ads_snapshots_level_idx", "CREATE INDEX IF NOT EXISTS `google_ads_snapshots_level_idx` ON `google_ads_snapshots` (`level`)");
    await run("google_ads_snapshots_captured_at_idx", "CREATE INDEX IF NOT EXISTS `google_ads_snapshots_captured_at_idx` ON `google_ads_snapshots` (`captured_at`)");
    await run("google_ads_snapshots_created_at_idx", "CREATE INDEX IF NOT EXISTS `google_ads_snapshots_created_at_idx` ON `google_ads_snapshots` (`created_at`)");
    await run("google_ads_snapshots_updated_at_idx", "CREATE INDEX IF NOT EXISTS `google_ads_snapshots_updated_at_idx` ON `google_ads_snapshots` (`updated_at`)");
    // One row per (client, level) — the daily cron upserts on this unique key.
    // Superseded immediately below by the 3-column window index (dropped on the
    // next line). On databases that already hold multi-window rows this 2-column
    // create fails with "UNIQUE constraint failed"; that's the expected
    // already-superseded signal, and the index is dropped right after anyway.
    await run("google_ads_snapshots_client_level_unq", "CREATE UNIQUE INDEX IF NOT EXISTS `google_ads_snapshots_client_level_unq` ON `google_ads_snapshots` (`client_id`, `level`)", ["UNIQUE constraint failed"]);
    // Multi-window snapshots (2026-06-09): the account-efficiency goal agent
    // now persists additive long-lookback windows (60d ad-group, 90d keyword)
    // alongside the primary 30d/structural row. Widen the uniqueness key to
    // (client, level, date_range_label) so those windowed rows coexist instead
    // of clobbering the primary. Drop the old 2-column unique index first.
    await run("drop_google_ads_snapshots_client_level_unq", "DROP INDEX IF EXISTS `google_ads_snapshots_client_level_unq`");
    await run("google_ads_snapshots_client_level_window_unq", "CREATE UNIQUE INDEX IF NOT EXISTS `google_ads_snapshots_client_level_window_unq` ON `google_ads_snapshots` (`client_id`, `level`, `date_range_label`)");
    await run("locked_docs_rels.google_ads_snapshots_id", "ALTER TABLE `payload_locked_documents_rels` ADD `google_ads_snapshots_id` integer REFERENCES `google_ads_snapshots`(`id`) ON DELETE cascade");
    await run("payload_locked_documents_rels_google_ads_snapshots_id_idx", "CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_google_ads_snapshots_id_idx` ON `payload_locked_documents_rels` (`google_ads_snapshots_id`)");

    // ── Account Health Contract on clients (2026-06-02) ─────────────────
    // Per-client invariants goal agents respect. Reference:
    // docs/goal-agents-architecture-and-build-plan.md §Layer 2.
    // All columns optional — clients without a contract simply have no
    // active goals. Pacing window enum left open for future modes.
    const spendPolicyAdds: Array<[string, string]> = [
      ["spend_policy_pacing_mode", "text"],
      ["spend_policy_pacing_window", "text"],
      ["spend_policy_monthly_budget_target", "numeric"],
      ["spend_policy_acceptable_variance_percent_low", "numeric"],
      ["spend_policy_acceptable_variance_percent_high", "numeric"],
      ["spend_policy_hard_floor", "numeric"],
      ["spend_policy_hard_ceiling", "numeric"],
      ["spend_policy_conversion_tracking_enabled_from", "text"],
    ];
    for (const [col, type] of spendPolicyAdds) {
      await run(
        `clients.${col}`,
        `ALTER TABLE \`clients\` ADD \`${col}\` ${type}`,
      );
    }

    // Array sub-tables — match the existing clients_* pattern
    // (e.g. clients_one_off_projects at line ~666).
    await run("clients_protected_campaign_ids", `CREATE TABLE IF NOT EXISTS \`clients_protected_campaign_ids\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL, \`campaign_id\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_protected_campaign_ids_order_idx", "CREATE INDEX IF NOT EXISTS `clients_protected_campaign_ids_order_idx` ON `clients_protected_campaign_ids` (`_order`)");
    await run("clients_protected_campaign_ids_parent_idx", "CREATE INDEX IF NOT EXISTS `clients_protected_campaign_ids_parent_idx` ON `clients_protected_campaign_ids` (`_parent_id`)");

    await run("clients_brand_campaign_ids", `CREATE TABLE IF NOT EXISTS \`clients_brand_campaign_ids\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL, \`campaign_id\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_brand_campaign_ids_order_idx", "CREATE INDEX IF NOT EXISTS `clients_brand_campaign_ids_order_idx` ON `clients_brand_campaign_ids` (`_order`)");
    await run("clients_brand_campaign_ids_parent_idx", "CREATE INDEX IF NOT EXISTS `clients_brand_campaign_ids_parent_idx` ON `clients_brand_campaign_ids` (`_parent_id`)");

    // ── goal_runs (2026-06-05) ─────────────────────────────────────────────
    // Parent record for one execution of a goal agent against one client.
    // Individual decisions stored as goal_run_snapshots rows linked here.
    // Required for Phase 3 goal runtime + approval UI.
    await run("goal_runs", `CREATE TABLE IF NOT EXISTS \`goal_runs\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`client_id\` integer NOT NULL,
      \`goal\` text NOT NULL,
      \`status\` text NOT NULL,
      \`tier\` text,
      \`completed_at\` text,
      \`error\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("goal_runs_client_idx", "CREATE INDEX IF NOT EXISTS `goal_runs_client_idx` ON `goal_runs` (`client_id`)");
    await run("goal_runs_status_idx", "CREATE INDEX IF NOT EXISTS `goal_runs_status_idx` ON `goal_runs` (`status`)");
    await run("goal_runs_tier_idx", "CREATE INDEX IF NOT EXISTS `goal_runs_tier_idx` ON `goal_runs` (`tier`)");
    await run("goal_runs_created_at_idx", "CREATE INDEX IF NOT EXISTS `goal_runs_created_at_idx` ON `goal_runs` (`created_at`)");
    await run("goal_runs_updated_at_idx", "CREATE INDEX IF NOT EXISTS `goal_runs_updated_at_idx` ON `goal_runs` (`updated_at`)");

    // ── goal_run_snapshots (2026-06-05) ────────────────────────────────────
    // One decision step within a goal run. Written before calling any handler.
    // Stores proposed payload, modified payload (post-guardrail), block reason,
    // approval linkage, and post-action measurement results.
    await run("goal_run_snapshots", `CREATE TABLE IF NOT EXISTS \`goal_run_snapshots\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`goal_run_id\` integer NOT NULL,
      \`step\` numeric NOT NULL,
      \`action\` text NOT NULL,
      \`risk_tier\` text NOT NULL,
      \`status\` text NOT NULL,
      \`proposed_payload\` text,
      \`modified_payload\` text,
      \`block_reason\` text,
      \`approval_id\` integer,
      \`measured_at\` text,
      \`measured_result\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`goal_run_id\`) REFERENCES \`goal_runs\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("goal_run_snapshots_goal_run_idx", "CREATE INDEX IF NOT EXISTS `goal_run_snapshots_goal_run_idx` ON `goal_run_snapshots` (`goal_run_id`)");
    await run("goal_run_snapshots_status_idx", "CREATE INDEX IF NOT EXISTS `goal_run_snapshots_status_idx` ON `goal_run_snapshots` (`status`)");
    await run("goal_run_snapshots_created_at_idx", "CREATE INDEX IF NOT EXISTS `goal_run_snapshots_created_at_idx` ON `goal_run_snapshots` (`created_at`)");
    await run("goal_run_snapshots_updated_at_idx", "CREATE INDEX IF NOT EXISTS `goal_run_snapshots_updated_at_idx` ON `goal_run_snapshots` (`updated_at`)");

    // Sub-table for campaignIds array — follows Payload's _order / _parent_id convention.
    await run("goal_run_snapshots_campaign_ids", `CREATE TABLE IF NOT EXISTS \`goal_run_snapshots_campaign_ids\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL, \`campaign_id\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`goal_run_snapshots\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("goal_run_snapshots_campaign_ids_order_idx", "CREATE INDEX IF NOT EXISTS `goal_run_snapshots_campaign_ids_order_idx` ON `goal_run_snapshots_campaign_ids` (`_order`)");
    await run("goal_run_snapshots_campaign_ids_parent_idx", "CREATE INDEX IF NOT EXISTS `goal_run_snapshots_campaign_ids_parent_idx` ON `goal_run_snapshots_campaign_ids` (`_parent_id`)");

    // locked_docs_rels FK columns — required or admin record views crash on Vercel.
    await run("locked_docs_rels.goal_runs_id", "ALTER TABLE `payload_locked_documents_rels` ADD `goal_runs_id` integer REFERENCES `goal_runs`(`id`) ON DELETE cascade");
    await run("payload_locked_documents_rels_goal_runs_id_idx", "CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_goal_runs_id_idx` ON `payload_locked_documents_rels` (`goal_runs_id`)");
    await run("locked_docs_rels.goal_run_snapshots_id", "ALTER TABLE `payload_locked_documents_rels` ADD `goal_run_snapshots_id` integer REFERENCES `goal_run_snapshots`(`id`) ON DELETE cascade");
    await run("payload_locked_documents_rels_goal_run_snapshots_id_idx", "CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_goal_run_snapshots_id_idx` ON `payload_locked_documents_rels` (`goal_run_snapshots_id`)");

    // ── optimate_settings global (2026-06-07) ──────────────────────────────
    // Single-row global storing the OptiMate agent's default chat / autonomous
    // models. Globals don't get a payload_locked_documents_rels FK column.
    // Mirrors src/migrations/20260607_120000_add_optimate_settings_global.ts —
    // this inline sweep is what production /api/migrate actually executes.
    await run("optimate_settings", `CREATE TABLE IF NOT EXISTS \`optimate_settings\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`default_chat_model\` text DEFAULT 'claude-sonnet-4.6',
      \`default_autonomous_model\` text DEFAULT 'kimi-k2.6',
      \`blog_prompter_model\` text,
      \`invoice_assistant_model\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    // Optional task-specific models. Nullable by design: blank means use the
    // autonomous default.
    await run(
      "optimate_settings.blog_prompter_model",
      "ALTER TABLE `optimate_settings` ADD `blog_prompter_model` text",
    );
    await run(
      "optimate_settings.invoice_assistant_model",
      "ALTER TABLE `optimate_settings` ADD `invoice_assistant_model` text",
    );
    // Chat history token budget (2026-06-29). Added to the global config after
    // the table was first created, so existing prod tables lack the column and
    // saving OptiMate Settings 500s without this. Mirrors
    // src/migrations/20260629_120000_add_optimate_chat_history_token_limit.ts.
    await run(
      "optimate_settings.chat_history_token_limit",
      "ALTER TABLE `optimate_settings` ADD `chat_history_token_limit` numeric DEFAULT 6000",
    );

    // ── google_ads_campaign_budgets monthly recommendation fields (2026-06-08) ──
    // Advisory recommended daily budgets set by the monthly recommendation cron.
    // Mirrors src/migrations/20260608_120000_add_budget_recommendation_fields.ts —
    // this inline sweep is what production /api/migrate actually executes.
    await run("gacb.recommended_daily_budget", "ALTER TABLE `google_ads_campaign_budgets` ADD `recommended_daily_budget` numeric");
    await run("gacb.recommendation_generated_at", "ALTER TABLE `google_ads_campaign_budgets` ADD `recommendation_generated_at` text");
    await run("gacb.recommendation_basis", "ALTER TABLE `google_ads_campaign_budgets` ADD `recommendation_basis` text");

    // ── Client Growth Hub collections and client portal links (2026-06-14) ──
    // The public /api/migrate endpoint runs this legacy inline sweep, not Payload's
    // generated migration index. Keep this block in sync with
    // src/migrations/20260614_120000_add_client_growth_hub.ts so production gets
    // the new tables and the Clients admin screen does not query missing columns.
    await run("forecast_scenarios", `CREATE TABLE IF NOT EXISTS \`forecast_scenarios\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`proposal_id\` integer,
      \`title\` text NOT NULL,
      \`status\` text DEFAULT 'draft' NOT NULL,
      \`scenario_type\` text DEFAULT 'custom' NOT NULL,
      \`baseline_period_start\` text,
      \`baseline_period_end\` text,
      \`assumptions_monthly_ad_spend\` numeric,
      \`assumptions_target_monthly_ad_spend\` numeric,
      \`assumptions_current_cpa\` numeric,
      \`assumptions_target_cpa\` numeric,
      \`assumptions_conversion_rate\` numeric,
      \`assumptions_average_order_value\` numeric,
      \`assumptions_lead_close_rate\` numeric,
      \`assumptions_average_client_value\` numeric,
      \`assumptions_organic_click_growth_pct\` numeric,
      \`assumptions_confidence_level\` numeric,
      \`outputs\` text,
      \`published_at\` text,
      \`notes\` text,
      \`client_summary\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("client_value_ledger_items", `CREATE TABLE IF NOT EXISTS \`client_value_ledger_items\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`proposal_id\` integer,
      \`google_ads_audit_id\` integer,
      \`seo_audit_proposal_id\` integer,
      \`client_process_id\` integer,
      \`blog_post_id\` integer,
      \`agent_approval_id\` integer,
      \`activity_log_id\` integer,
      \`occurred_at\` text NOT NULL,
      \`category\` text NOT NULL,
      \`title\` text NOT NULL,
      \`summary\` text NOT NULL,
      \`impact_type\` text,
      \`impact_value\` numeric,
      \`impact_unit\` text,
      \`confidence\` text DEFAULT 'directional' NOT NULL,
      \`visibility\` text DEFAULT 'internal' NOT NULL,
      \`source\` text,
      \`dedupe_key\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`google_ads_audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`seo_audit_proposal_id\`) REFERENCES \`seo_audit_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`client_process_id\`) REFERENCES \`client_processes\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`blog_post_id\`) REFERENCES \`blog_posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`agent_approval_id\`) REFERENCES \`agent_approval_queue\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`activity_log_id\`) REFERENCES \`activity_log\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("client_value_ledger_items_evidence_links", `CREATE TABLE IF NOT EXISTS \`client_value_ledger_items_evidence_links\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`label\` text NOT NULL,
      \`url\` text NOT NULL,
      \`kind\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_value_ledger_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_portal_requests", `CREATE TABLE IF NOT EXISTS \`client_portal_requests\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`proposal_id\` integer,
      \`request_type\` text DEFAULT 'general' NOT NULL,
      \`title\` text NOT NULL,
      \`description\` text NOT NULL,
      \`status\` text DEFAULT 'new' NOT NULL,
      \`priority\` text DEFAULT 'normal' NOT NULL,
      \`submitted_by_name\` text,
      \`submitted_by_email\` text,
      \`internal_notes\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("client_portal_requests_client_visible_updates", `CREATE TABLE IF NOT EXISTS \`client_portal_requests_client_visible_updates\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`date\` text NOT NULL,
      \`author_label\` text NOT NULL,
      \`message\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_portal_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("client_portal_requests_related_links", `CREATE TABLE IF NOT EXISTS \`client_portal_requests_related_links\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`label\` text NOT NULL,
      \`url\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_portal_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("quarterly_organic_growth_snapshots", `CREATE TABLE IF NOT EXISTS \`quarterly_organic_growth_snapshots\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`proposal_id\` integer,
      \`seo_audit_proposal_id\` integer,
      \`snapshot_date\` text NOT NULL,
      \`period_start\` text NOT NULL,
      \`period_end\` text NOT NULL,
      \`snapshot_type\` text DEFAULT 'manual' NOT NULL,
      \`organic_total_clicks\` numeric DEFAULT 0,
      \`organic_total_impressions\` numeric DEFAULT 0,
      \`organic_avg_ctr\` numeric DEFAULT 0,
      \`organic_avg_position\` numeric DEFAULT 0,
      \`organic_brand_clicks\` numeric DEFAULT 0,
      \`organic_brand_impressions\` numeric DEFAULT 0,
      \`organic_brand_ctr\` numeric DEFAULT 0,
      \`organic_brand_position\` numeric DEFAULT 0,
      \`organic_non_brand_clicks\` numeric DEFAULT 0,
      \`organic_non_brand_impressions\` numeric DEFAULT 0,
      \`organic_non_brand_ctr\` numeric DEFAULT 0,
      \`organic_non_brand_position\` numeric DEFAULT 0,
      \`summary\` text,
      \`wins\` text,
      \`risks\` text,
      \`next_focus\` text,
      \`source_gsc_snapshot_id\` integer,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`seo_audit_proposal_id\`) REFERENCES \`seo_audit_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`source_gsc_snapshot_id\`) REFERENCES \`gsc_snapshots\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("qogs_categories", `CREATE TABLE IF NOT EXISTS \`qogs_categories\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`name\` text NOT NULL,
      \`score\` numeric,
      \`rank_position\` numeric,
      \`clicks\` numeric,
      \`impressions\` numeric,
      \`top_queries\` text,
      \`related_pages\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`quarterly_organic_growth_snapshots\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("qogs_topic_associations", `CREATE TABLE IF NOT EXISTS \`qogs_topic_associations\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`topic\` text NOT NULL,
      \`cluster\` text,
      \`content_urls\` text,
      \`published_count\` numeric DEFAULT 0,
      \`first_published_at\` text,
      \`latest_published_at\` text,
      \`associated_queries\` text,
      \`notes\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`quarterly_organic_growth_snapshots\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("quarterly_organic_growth_snapshots_rels", `CREATE TABLE IF NOT EXISTS \`quarterly_organic_growth_snapshots_rels\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`order\` integer,
      \`parent_id\` integer NOT NULL,
      \`path\` text NOT NULL,
      \`blog_posts_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`quarterly_organic_growth_snapshots\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`blog_posts_id\`) REFERENCES \`blog_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("qogs_work_delivered", `CREATE TABLE IF NOT EXISTS \`qogs_work_delivered\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`date\` text NOT NULL,
      \`type\` text NOT NULL,
      \`title\` text NOT NULL,
      \`url\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`quarterly_organic_growth_snapshots\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("clients_client_portal_links", `CREATE TABLE IF NOT EXISTS \`clients_client_portal_links\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`label\` text NOT NULL,
      \`url\` text NOT NULL,
      \`kind\` text DEFAULT 'other' NOT NULL,
      \`visibility\` text DEFAULT 'client_visible' NOT NULL,
      \`sort_order\` numeric DEFAULT 0,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("forecast_scenarios_client_idx", "CREATE INDEX IF NOT EXISTS `forecast_scenarios_client_idx` ON `forecast_scenarios` (`client_id`)");
    await run("forecast_scenarios_proposal_idx", "CREATE INDEX IF NOT EXISTS `forecast_scenarios_proposal_idx` ON `forecast_scenarios` (`proposal_id`)");
    await run("forecast_scenarios_status_idx", "CREATE INDEX IF NOT EXISTS `forecast_scenarios_status_idx` ON `forecast_scenarios` (`status`)");
    await run("client_value_ledger_items_client_idx", "CREATE INDEX IF NOT EXISTS `client_value_ledger_items_client_idx` ON `client_value_ledger_items` (`client_id`)");
    await run("client_value_ledger_items_occurred_at_idx", "CREATE INDEX IF NOT EXISTS `client_value_ledger_items_occurred_at_idx` ON `client_value_ledger_items` (`occurred_at`)");
    await run("client_value_ledger_items_dedupe_key_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `client_value_ledger_items_dedupe_key_idx` ON `client_value_ledger_items` (`dedupe_key`)");
    await run("client_portal_requests_client_idx", "CREATE INDEX IF NOT EXISTS `client_portal_requests_client_idx` ON `client_portal_requests` (`client_id`)");
    await run("client_portal_requests_status_idx", "CREATE INDEX IF NOT EXISTS `client_portal_requests_status_idx` ON `client_portal_requests` (`status`)");
    await run("quarterly_organic_growth_snapshots_client_idx", "CREATE INDEX IF NOT EXISTS `quarterly_organic_growth_snapshots_client_idx` ON `quarterly_organic_growth_snapshots` (`client_id`)");
    await run("quarterly_organic_growth_snapshots_snapshot_date_idx", "CREATE INDEX IF NOT EXISTS `quarterly_organic_growth_snapshots_snapshot_date_idx` ON `quarterly_organic_growth_snapshots` (`snapshot_date`)");
    await run("qogs_categories_order_idx", "CREATE INDEX IF NOT EXISTS `qogs_categories_order_idx` ON `qogs_categories` (`_order`)");
    await run("qogs_categories_parent_id_idx", "CREATE INDEX IF NOT EXISTS `qogs_categories_parent_id_idx` ON `qogs_categories` (`_parent_id`)");
    await run("qogs_topic_associations_order_idx", "CREATE INDEX IF NOT EXISTS `qogs_topic_associations_order_idx` ON `qogs_topic_associations` (`_order`)");
    await run("qogs_topic_associations_parent_id_idx", "CREATE INDEX IF NOT EXISTS `qogs_topic_associations_parent_id_idx` ON `qogs_topic_associations` (`_parent_id`)");
    await run("quarterly_organic_growth_snapshots_rels_order_idx", "CREATE INDEX IF NOT EXISTS `quarterly_organic_growth_snapshots_rels_order_idx` ON `quarterly_organic_growth_snapshots_rels` (`order`)");
    await run("quarterly_organic_growth_snapshots_rels_parent_idx", "CREATE INDEX IF NOT EXISTS `quarterly_organic_growth_snapshots_rels_parent_idx` ON `quarterly_organic_growth_snapshots_rels` (`parent_id`)");
    await run("quarterly_organic_growth_snapshots_rels_path_idx", "CREATE INDEX IF NOT EXISTS `quarterly_organic_growth_snapshots_rels_path_idx` ON `quarterly_organic_growth_snapshots_rels` (`path`)");
    await run("quarterly_organic_growth_snapshots_rels_blog_posts_idx", "CREATE INDEX IF NOT EXISTS `quarterly_organic_growth_snapshots_rels_blog_posts_idx` ON `quarterly_organic_growth_snapshots_rels` (`blog_posts_id`)");
    await run("qogs_work_delivered_order_idx", "CREATE INDEX IF NOT EXISTS `qogs_work_delivered_order_idx` ON `qogs_work_delivered` (`_order`)");
    await run("qogs_work_delivered_parent_id_idx", "CREATE INDEX IF NOT EXISTS `qogs_work_delivered_parent_id_idx` ON `qogs_work_delivered` (`_parent_id`)");
    await run("clients_client_portal_links_order_idx", "CREATE INDEX IF NOT EXISTS `clients_client_portal_links_order_idx` ON `clients_client_portal_links` (`_order`)");
    await run("clients_client_portal_links_parent_id_idx", "CREATE INDEX IF NOT EXISTS `clients_client_portal_links_parent_id_idx` ON `clients_client_portal_links` (`_parent_id`)");
    await run("locked_docs_rels.forecast_scenarios_id", "ALTER TABLE `payload_locked_documents_rels` ADD `forecast_scenarios_id` integer REFERENCES `forecast_scenarios`(`id`) ON DELETE cascade");
    await run("locked_docs_rels.client_value_ledger_items_id", "ALTER TABLE `payload_locked_documents_rels` ADD `client_value_ledger_items_id` integer REFERENCES `client_value_ledger_items`(`id`) ON DELETE cascade");
    await run("locked_docs_rels.client_portal_requests_id", "ALTER TABLE `payload_locked_documents_rels` ADD `client_portal_requests_id` integer REFERENCES `client_portal_requests`(`id`) ON DELETE cascade");
    await run("locked_docs_rels.quarterly_organic_growth_snapshots_id", "ALTER TABLE `payload_locked_documents_rels` ADD `quarterly_organic_growth_snapshots_id` integer REFERENCES `quarterly_organic_growth_snapshots`(`id`) ON DELETE cascade");

    // ── SEO Migration Checks (Post-Migration SEO Review tool, 2026-06-15) ──
    // The collection ships in the Payload config but was only added to the
    // generated migration file, never to this inline sweep that /api/migrate
    // runs in production. Result: payload_locked_documents_rels has no
    // `seo_migration_checks_id` column, so Payload's document-lock query
    // (run when opening ANY client/edit view) throws `no such column` and the
    // whole detail page blanks. Keep in sync with
    // src/migrations/20260615_120000_add_seo_migration_checks.ts.
    await run("seo_migration_checks", `CREATE TABLE IF NOT EXISTS \`seo_migration_checks\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`title\` text,
      \`client_id\` integer,
      \`site_url\` text,
      \`cutover_date\` text,
      \`is_domain_move\` integer DEFAULT false,
      \`status\` text DEFAULT 'pending',
      \`overall_score\` numeric,
      \`run_at\` text,
      \`error\` text,
      \`scores_by_phase\` text,
      \`checklist\` text,
      \`redirects\` text,
      \`performance\` text,
      \`actions\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("seo_migration_checks_client_idx", "CREATE INDEX IF NOT EXISTS `seo_migration_checks_client_idx` ON `seo_migration_checks` (`client_id`)");
    await run("seo_migration_checks_status_idx", "CREATE INDEX IF NOT EXISTS `seo_migration_checks_status_idx` ON `seo_migration_checks` (`status`)");
    await run("seo_migration_checks_created_at_idx", "CREATE INDEX IF NOT EXISTS `seo_migration_checks_created_at_idx` ON `seo_migration_checks` (`created_at`)");
    await run("seo_migration_checks_updated_at_idx", "CREATE INDEX IF NOT EXISTS `seo_migration_checks_updated_at_idx` ON `seo_migration_checks` (`updated_at`)");
    await run("locked_docs_rels.seo_migration_checks_id", "ALTER TABLE `payload_locked_documents_rels` ADD `seo_migration_checks_id` integer REFERENCES `seo_migration_checks`(`id`) ON DELETE cascade");

    // ── Agency KPI Snapshots (monthly agency KPI cache, 2026-06-28) ──
    // The collection ships in the Payload config but was only added to the
    // generated migration file, never to this inline sweep that /api/migrate
    // runs in production. Result: the `agency_kpi_snapshots` table and its
    // `agency_kpi_snapshots_id` column on payload_locked_documents_rels are
    // missing in prod, so Payload's document-lock query (run on ANY document
    // write, including the Gmail token refresh) throws `no such column` and
    // surfaces as "Gmail token refresh failed". Keep in sync with
    // src/migrations/20260628_120000_add_agency_kpi_snapshots.ts.
    await run("agency_kpi_snapshots", `CREATE TABLE IF NOT EXISTS \`agency_kpi_snapshots\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`month\` text NOT NULL,
      \`active_clients\` numeric DEFAULT 0 NOT NULL,
      \`active_leads\` numeric DEFAULT 0 NOT NULL,
      \`arr\` numeric DEFAULT 0 NOT NULL,
      \`monthly_retainer\` numeric DEFAULT 0 NOT NULL,
      \`retainer_ytd\` numeric DEFAULT 0 NOT NULL,
      \`one_off_ytd\` numeric DEFAULT 0 NOT NULL,
      \`lead_conversion\` numeric DEFAULT 0 NOT NULL,
      \`mtd_costs\` numeric DEFAULT 0 NOT NULL,
      \`updated_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      \`created_at\` text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`);
    await run("agency_kpi_snapshots_month_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `agency_kpi_snapshots_month_idx` ON `agency_kpi_snapshots` (`month`)");
    await run("agency_kpi_snapshots_updated_at_idx", "CREATE INDEX IF NOT EXISTS `agency_kpi_snapshots_updated_at_idx` ON `agency_kpi_snapshots` (`updated_at`)");
    await run("agency_kpi_snapshots_created_at_idx", "CREATE INDEX IF NOT EXISTS `agency_kpi_snapshots_created_at_idx` ON `agency_kpi_snapshots` (`created_at`)");
    await run("locked_docs_rels.agency_kpi_snapshots_id", "ALTER TABLE `payload_locked_documents_rels` ADD `agency_kpi_snapshots_id` integer REFERENCES `agency_kpi_snapshots`(`id`) ON DELETE cascade");

    // ── Monthly negative keyword selections + terms cache (2026-07-01 / 2026-07-04) ──
    // These collections ship in the Payload config + Drizzle migration index, but
    // prod only applies THIS inline sweep (via /api/migrate, run by CI). Without
    // this block the monthly-keyword tables are missing in prod and the
    // /api/monthly-keyword-selection route 500s with an empty body, surfacing in
    // the admin as "Unexpected end of JSON input". The selections array table
    // includes the 2026-07-04 watch fields for fresh installs; the idempotent
    // ALTERs add them to pre-existing tables. Keep in sync with
    // src/migrations/20260701_120000_add_monthly_keyword_selection.ts and
    // src/migrations/20260704_120000_add_monthly_keyword_watch_fields.ts.
    await run("monthly_keyword_selections", `CREATE TABLE IF NOT EXISTS \`monthly_keyword_selections\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`status\` text DEFAULT 'active',
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("monthly_keyword_selections_selections", `CREATE TABLE IF NOT EXISTS \`monthly_keyword_selections_selections\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`year_month\` text NOT NULL,
      \`search_term\` text NOT NULL,
      \`negative_keyword\` text NOT NULL,
      \`match_type\` text DEFAULT 'exact' NOT NULL,
      \`decision\` text DEFAULT 'pending' NOT NULL,
      \`watch_horizon_months\` numeric,
      \`watch_until\` text,
      \`applied_to_n_k_l_id\` integer,
      \`applied_at\` text,
      \`review_comment\` text,
      \`review_comment_by\` text,
      \`review_comment_at\` text,
      \`review_comment_tagged_user_ids\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`monthly_keyword_selections\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`applied_to_n_k_l_id\`) REFERENCES \`negative_keyword_lists\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("monthly_keyword_selections_selections.watch_horizon_months", "ALTER TABLE `monthly_keyword_selections_selections` ADD `watch_horizon_months` numeric");
    await run("monthly_keyword_selections_selections.watch_until", "ALTER TABLE `monthly_keyword_selections_selections` ADD `watch_until` text");
    await run("monthly_keyword_selections_selections.review_comment", "ALTER TABLE `monthly_keyword_selections_selections` ADD `review_comment` text");
    await run("monthly_keyword_selections_selections.review_comment_by", "ALTER TABLE `monthly_keyword_selections_selections` ADD `review_comment_by` text");
    await run("monthly_keyword_selections_selections.review_comment_at", "ALTER TABLE `monthly_keyword_selections_selections` ADD `review_comment_at` text");
    await run("monthly_keyword_selections_selections.review_comment_tagged_user_ids", "ALTER TABLE `monthly_keyword_selections_selections` ADD `review_comment_tagged_user_ids` text");
    await run("monthly_keyword_selections_selections.applied_by", "ALTER TABLE `monthly_keyword_selections_selections` ADD `applied_by` text");
    await run("monthly_keyword_selections_selections.applied_by_user_id", "ALTER TABLE `monthly_keyword_selections_selections` ADD `applied_by_user_id` text");
    await run("monthly_keyword_selections_selections.row_index", "ALTER TABLE `monthly_keyword_selections_selections` ADD `row_index` numeric DEFAULT 0 NOT NULL");
    await run("monthly_keyword_selections_selections.removed_comment", "ALTER TABLE `monthly_keyword_selections_selections` ADD `removed_comment` text");
    await run("monthly_keyword_selections_selections.removed_by", "ALTER TABLE `monthly_keyword_selections_selections` ADD `removed_by` text");
    await run("monthly_keyword_selections_selections.removed_by_user_id", "ALTER TABLE `monthly_keyword_selections_selections` ADD `removed_by_user_id` text");
    await run("monthly_keyword_selections_selections.removed_at", "ALTER TABLE `monthly_keyword_selections_selections` ADD `removed_at` text");
    await run("monthly_keyword_selections_selections.decided_by_user_id", "ALTER TABLE `monthly_keyword_selections_selections` ADD `decided_by_user_id` text");
    await run("monthly_keyword_selections_selections.decided_by", "ALTER TABLE `monthly_keyword_selections_selections` ADD `decided_by` text");
    await run("monthly_keyword_selections_selections.review_dismissed_at", "ALTER TABLE `monthly_keyword_selections_selections` ADD `review_dismissed_at` text");
    await run("monthly_keyword_selections_selections.review_dismissed_by", "ALTER TABLE `monthly_keyword_selections_selections` ADD `review_dismissed_by` text");
    await run("monthly_keyword_selections_selections.outcome_type", "ALTER TABLE `monthly_keyword_selections_selections` ADD `outcome_type` text");
    await run("monthly_keyword_selections_selections.outcome_detail", "ALTER TABLE `monthly_keyword_selections_selections` ADD `outcome_detail` text");
    await run("monthly_keyword_selections_selections.outcome_comment", "ALTER TABLE `monthly_keyword_selections_selections` ADD `outcome_comment` text");
    await run("monthly_keyword_selections_selections.outcome_by", "ALTER TABLE `monthly_keyword_selections_selections` ADD `outcome_by` text");
    await run("monthly_keyword_selections_selections.outcome_by_user_id", "ALTER TABLE `monthly_keyword_selections_selections` ADD `outcome_by_user_id` text");
    await run("monthly_keyword_selections_selections.outcome_at", "ALTER TABLE `monthly_keyword_selections_selections` ADD `outcome_at` text");
    await run("monthly_keyword_terms_cache", `CREATE TABLE IF NOT EXISTS \`monthly_keyword_terms_cache\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`year_month\` text NOT NULL,
      \`terms\` text NOT NULL,
      \`review_complete\` integer DEFAULT false,
      \`review_completed_at\` text,
      \`review_completed_by_id\` integer,
      \`fetched_at\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`review_completed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
    )`);
    await run("monthly_keyword_selections_client_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `monthly_keyword_selections_client_idx` ON `monthly_keyword_selections` (`client_id`)");
    await run("monthly_keyword_selections_status_idx", "CREATE INDEX IF NOT EXISTS `monthly_keyword_selections_status_idx` ON `monthly_keyword_selections` (`status`)");
    await run("monthly_keyword_selections_selections_parent_idx", "CREATE INDEX IF NOT EXISTS `monthly_keyword_selections_selections_parent_idx` ON `monthly_keyword_selections_selections` (`_parent_id`)");
    await run("monthly_keyword_selections_selections_order_idx", "CREATE INDEX IF NOT EXISTS `monthly_keyword_selections_selections_order_idx` ON `monthly_keyword_selections_selections` (`_order`)");
    await run("monthly_keyword_terms_cache_client_idx", "CREATE INDEX IF NOT EXISTS `monthly_keyword_terms_cache_client_idx` ON `monthly_keyword_terms_cache` (`client_id`)");
    await run("monthly_keyword_terms_cache_year_month_idx", "CREATE INDEX IF NOT EXISTS `monthly_keyword_terms_cache_year_month_idx` ON `monthly_keyword_terms_cache` (`year_month`)");
    await run("monthly_keyword_terms_cache_client_month_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `monthly_keyword_terms_cache_client_month_idx` ON `monthly_keyword_terms_cache` (`client_id`, `year_month`)");
    await run("locked_docs_rels.monthly_keyword_selections_id", "ALTER TABLE `payload_locked_documents_rels` ADD `monthly_keyword_selections_id` integer REFERENCES `monthly_keyword_selections`(`id`) ON DELETE cascade");
    await run("locked_docs_rels.monthly_keyword_terms_cache_id", "ALTER TABLE `payload_locked_documents_rels` ADD `monthly_keyword_terms_cache_id` integer REFERENCES `monthly_keyword_terms_cache`(`id`) ON DELETE cascade");

    // ── Match-type violation recommendation fields (2026-06-09) ──
    await run("mtvc.recommended_keyword", "ALTER TABLE `match_type_violation_candidates` ADD `recommended_keyword` text");
    await run("mtvc.recommended_match_type", "ALTER TABLE `match_type_violation_candidates` ADD `recommended_match_type` text");
    await run("mtvc.offending_words", "ALTER TABLE `match_type_violation_candidates` ADD `offending_words` text");
    await run("mtvc.nearest_keyword", "ALTER TABLE `match_type_violation_candidates` ADD `nearest_keyword` text");

    // ── FIX (2026-06-11): assigned-list relationship column name mismatch ──
    // The original table-creation sweep named the `assignedListId` relationship
    // column `assigned_list_id`, but Payload's SQLite adapter expects
    // `assigned_list_id_id` (field name + `_id` FK suffix). With the wrong name
    // EVERY Payload ORM read/write on this table throws `no such column:
    // assigned_list_id_id`, so the Match Type Violations review couldn't load,
    // and Approve/Dismiss silently failed (the row reappeared on refresh).
    // Add the correctly-named column and backfill from the legacy one. The old
    // `assigned_list_id` column is left in place (SQLite can't drop it cleanly
    // and Payload ignores unknown columns).
    await run(
      "mtvc.assigned_list_id_id",
      "ALTER TABLE `match_type_violation_candidates` ADD `assigned_list_id_id` integer REFERENCES `negative_keyword_lists`(`id`) ON UPDATE no action ON DELETE set null",
    );
    await run(
      "mtvc.assigned_list_id_id.backfill",
      "UPDATE `match_type_violation_candidates` SET `assigned_list_id_id` = `assigned_list_id` WHERE `assigned_list_id_id` IS NULL AND `assigned_list_id` IS NOT NULL",
    );
    await run(
      "mtvc_assigned_list_idx",
      "CREATE INDEX IF NOT EXISTS `match_type_violation_candidates_assigned_list_idx` ON `match_type_violation_candidates` (`assigned_list_id_id`)",
    );

    // ── FIX (2026-06-11): '' in recommended_match_type breaks every update ──
    // The cron's raw-SQL upsert wrote '' when the detector had no
    // recommendation. It's a Payload select field ('exact' | 'phrase'), so ''
    // fails whole-document validation on EVERY payload.update() — which made
    // Approve/Dismiss silently fail and the row reappear as pending. Empty
    // must be NULL. Idempotent backfill; the cron no longer writes ''.
    await run(
      "mtvc.recommended_match_type.null_empty",
      "UPDATE `match_type_violation_candidates` SET `recommended_match_type` = NULL WHERE `recommended_match_type` = ''",
    );

    // ── Match-type monitor per-client scope controls (2026-06-09) ──
    await run("clients.gadsAuto_matchTypeMonitorExact", "ALTER TABLE `clients` ADD `gads_auto_match_type_monitor_exact` integer DEFAULT true");
    await run("clients.gadsAuto_matchTypeMonitorPhrase", "ALTER TABLE `clients` ADD `gads_auto_match_type_monitor_phrase` integer DEFAULT true");
    await run("gads_mtm_allowlist", `CREATE TABLE IF NOT EXISTS \`gads_mtm_allowlist\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL, \`scope\` text, \`pattern\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    )`);
    await run("gads_mtm_allowlist_order_idx", "CREATE INDEX IF NOT EXISTS `gads_mtm_allowlist_order_idx` ON `gads_mtm_allowlist` (`_order`)");
    await run("gads_mtm_allowlist_parent_idx", "CREATE INDEX IF NOT EXISTS `gads_mtm_allowlist_parent_idx` ON `gads_mtm_allowlist` (`_parent_id`)");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const r: MigrationResult = { label: "fatal", status: "error", message: msg };
    opts?.onProgress?.(r);
    results.push(r);
  }

  return results;
}
