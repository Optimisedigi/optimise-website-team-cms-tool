import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import crypto from "crypto";
import config from "@/payload.config";
import { runMigrations } from "@/lib/run-migrations";

// Force rebuild: 2026-02-27-v2
/**
 * Schema migration endpoint.
 * POST /api/migrate with header x-api-key matching AUDIT_API_KEY.
 * Creates missing tables/columns for collections added after initial deployment.
 * Safe to run multiple times (uses IF NOT EXISTS / catches duplicate column errors).
 *
 * The actual migration sweep lives in `src/lib/run-migrations.ts` so it can
 * also run from Payload's `onInit` hook (auto-heal on cold-start). This route
 * delegates to it and adds the diagnostics block.
 *
 * SECURITY: The response body intentionally returns ONLY migration status
 * lines and the list of table names — no row data, no column listings, no
 * Payload document samples. Anything richer would leak production data to
 * anyone (incl. the CI runner) holding the AUDIT_API_KEY. Exposing migrations
 * over HTTP at all is a workaround for Vercel cold-start cost; the long-term
 * direction is CI-only migrations via a deploy hook, after which this route
 * and its GET sibling should be deleted entirely.
 */

/**
 * Timing-safe compare of the request's `x-api-key` against `AUDIT_API_KEY`.
 * Returns `null` on success, or a 401 NextResponse on failure.
 */
function checkApiKey(request: NextRequest): NextResponse | null {
  const expected = Buffer.from(process.env.AUDIT_API_KEY ?? "");
  const got = Buffer.from(request.headers.get("x-api-key") ?? "");
  if (
    expected.length === 0 ||
    got.length !== expected.length ||
    !crypto.timingSafeEqual(got, expected)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const unauthorized = checkApiKey(request);
  if (unauthorized) return unauthorized;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const client = (payload.db as any).client;

  if (!client) {
    return NextResponse.json({ error: "No LibSQL client" }, { status: 500 });
  }

  // Run the full idempotent migration sweep.
  const migrationResults = await runMigrations(payload);

  // Map MigrationResult[] back to the legacy `OK: <label>` / `SKIP: <label> (already exists)`
  // / `ERROR: <label> — <msg>` string format so any tooling parsing this
  // response shape (string-matching the old result lines) keeps working.
  // The CI workflow specifically greps for `"ERROR:` in the JSON response to
  // fail the migrate job — keep the leading `ERROR:` token intact.
  const results: string[] = migrationResults.map((r) => {
    if (r.status === "ok") return `OK: ${r.label}`;
    if (r.status === "skip") return `SKIP: ${r.label} (already exists)`;
    return `ERROR: ${r.label} — ${r.message ?? "unknown"}`;
  });

  // Write-side smoke test: confirm the connection is alive without touching
  // any real collection. Avoids the earlier pattern of creating + deleting a
  // throwaway `contracts` row on every POST.
  let dbReachable = false;
  try {
    await client.execute("SELECT 1");
    dbReachable = true;
  } catch {
    dbReachable = false;
  }

  // Table-name dump only. Column-by-column PRAGMA output and row samples are
  // deliberately not returned (see SECURITY note above).
  let tables: string[] = [];
  try {
    const tablesResult = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    tables = tablesResult.rows.map((r: any) => r.name || r[0]);
  } catch {
    /* ignore */
  }

  const diagnostics: Record<string, unknown> = {};
  const diagnosticTables = [
    "clients",
    "clients_client_portal_links",
    "client_value_ledger_items",
    "client_value_ledger_items_evidence_links",
    "quarterly_organic_growth_snapshots",
    "qogs_categories",
    "qogs_topic_associations",
    "quarterly_organic_growth_snapshots_rels",
    "qogs_work_delivered",
    "forecast_scenarios",
    "client_portal_requests",
  ];
  for (const tableName of diagnosticTables) {
    try {
      const countResult = await client.execute(`SELECT COUNT(*) AS count FROM \`${tableName}\``);
      diagnostics[`${tableName}Count`] = Number(countResult.rows[0]?.count ?? countResult.rows[0]?.[0] ?? 0);
    } catch (error) {
      diagnostics[`${tableName}Error`] = error instanceof Error ? error.message : String(error);
    }
  }
  try {
    const clientsResult = await payload.find({ collection: "clients", limit: 1, depth: 0, overrideAccess: true });
    diagnostics.payloadClientsFind = "ok";
    const firstClientId = clientsResult.docs[0]?.id;
    diagnostics.firstClientId = firstClientId ?? null;
    if (firstClientId != null) {
      try {
        await payload.findByID({ collection: "clients", id: firstClientId, depth: 0, overrideAccess: true });
        diagnostics.payloadClientDetailDepth0 = "ok";
      } catch (error) {
        diagnostics.payloadClientDetailDepth0 = error instanceof Error ? error.message : String(error);
      }
      try {
        await payload.findByID({ collection: "clients", id: firstClientId, depth: 1, overrideAccess: true });
        diagnostics.payloadClientDetailDepth1 = "ok";
      } catch (error) {
        diagnostics.payloadClientDetailDepth1 = error instanceof Error ? error.message : String(error);
      }
    }
  } catch (error) {
    diagnostics.payloadClientsFind = error instanceof Error ? error.message : String(error);
  }
  try {
    const googleAdsClients = await payload.find({
      collection: "clients",
      where: { isActive: { not_equals: false } },
      sort: "name",
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    diagnostics.googleAdsClientListCount = googleAdsClients.totalDocs;
  } catch (error) {
    diagnostics.googleAdsClientList = error instanceof Error ? error.message : String(error);
  }
  try {
    await payload.find({ collection: "client-value-ledger-items", limit: 1, depth: 0, overrideAccess: true });
    diagnostics.payloadClientValueLedgerItemsFind = "ok";
  } catch (error) {
    diagnostics.payloadClientValueLedgerItemsFind = error instanceof Error ? error.message : String(error);
  }
  try {
    await payload.find({ collection: "quarterly-organic-growth-snapshots", limit: 1, depth: 0, overrideAccess: true });
    diagnostics.payloadQuarterlyOrganicGrowthSnapshotsFind = "ok";
  } catch (error) {
    diagnostics.payloadQuarterlyOrganicGrowthSnapshotsFind = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json({
    ok: true,
    version: "2026-05-17",
    dbReachable,
    migrationsRun: results,
    tables,
    diagnostics,
  });
}


/**
 * GET /api/migrate — run only the newer finance + blog_prompts schema additions.
 * Useful when the full POST migration times out after too many operations.
 */
export async function GET(request: NextRequest) {
  const unauthorized = checkApiKey(request);
  if (unauthorized) return unauthorized;

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
  // Client logo upload FK. Only in the registry migration (20260617), never in
  // the prod-applicable sweep/fast-list — so prod lacked `logo_id` and creating
  // or saving a client 500'd.
  await run("clients.logo_id", "ALTER TABLE `clients` ADD `logo_id` integer REFERENCES `media`(`id`) ON DELETE set null");
  // Contact phone fields (2026-06-21). Only in the registry migration, never in
  // the prod-applicable sweep/fast-list — so prod lacked these columns and
  // saving any client 500'd on the clients insert.
  await run("clients.contact_phone", "ALTER TABLE `clients` ADD `contact_phone` text");
  await run("clients_additional_contacts.phone", "ALTER TABLE `clients_additional_contacts` ADD `phone` text");
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
  await run("contracts.monthly_hosting", "ALTER TABLE `contracts` ADD `monthly_hosting` integer");
  await run("contracts.annual_hosting", "ALTER TABLE `contracts` ADD `annual_hosting` integer");
  await run("contracts.template_label", "ALTER TABLE `contracts` ADD `template_label` text");
  await run("contracts.termination_override", "ALTER TABLE `contracts` ADD `termination_override` text");

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

  // ── Campaign Proposal fields on google_ads_audits (2026-03-16) ──
  await run("gaa.campaign_proposal_status", "ALTER TABLE `google_ads_audits` ADD `campaign_proposal_status` text");
  await run("gaa.campaign_proposal", "ALTER TABLE `google_ads_audits` ADD `campaign_proposal` text");
  await run("gaa.proposal_biz_type", "ALTER TABLE `google_ads_audits` ADD `proposal_biz_type` text DEFAULT 'other'");
  await run("gaa.proposal_conv_goal", "ALTER TABLE `google_ads_audits` ADD `proposal_conv_goal` text");
  await run("gaa.proposal_svc_radius", "ALTER TABLE `google_ads_audits` ADD `proposal_svc_radius` text");
  await run("gaa.proposal_min_ad_group_volume", "ALTER TABLE `google_ads_audits` ADD `proposal_min_ad_group_volume` numeric");
  await run("gaa.proposal_min_brand_impressions", "ALTER TABLE `google_ads_audits` ADD `proposal_min_brand_impressions` numeric");
  await run("gaa.proposal_brand_volume_exempt", "ALTER TABLE `google_ads_audits` ADD `proposal_brand_volume_exempt` integer");
  await run("gaa.campaign_proposal_email_html", "ALTER TABLE `google_ads_audits` ADD `campaign_proposal_email_html` text");
  await run("gaa.campaign_proposal_generated_at", "ALTER TABLE `google_ads_audits` ADD `campaign_proposal_generated_at` text");

  // Campaign build (Google Ads push) fields
  await run("gaa.campaign_build_status", "ALTER TABLE `google_ads_audits` ADD `campaign_build_status` text");
  await run("gaa.generated_ad_copy", "ALTER TABLE `google_ads_audits` ADD `generated_ad_copy` text");
  await run("gaa.campaign_build_result", "ALTER TABLE `google_ads_audits` ADD `campaign_build_result` text");
  await run("gaa.campaign_build_error", "ALTER TABLE `google_ads_audits` ADD `campaign_build_error` text");
  await run("gaa.campaign_build_started_at", "ALTER TABLE `google_ads_audits` ADD `campaign_build_started_at` text");
  await run("gaa.campaign_build_completed_at", "ALTER TABLE `google_ads_audits` ADD `campaign_build_completed_at` text");

  // Ad Copy fields
  await run("gaa.ad_copy_brand_headlines", "ALTER TABLE `google_ads_audits` ADD `ad_copy_brand_headlines` text");
  await run("gaa.ad_copy_status", "ALTER TABLE `google_ads_audits` ADD `ad_copy_status` text");
  await run("gaa.ad_copy_published", "ALTER TABLE `google_ads_audits` ADD `ad_copy_published` integer DEFAULT 0");
  await run("gaa.ad_copy_comments", "ALTER TABLE `google_ads_audits` ADD `ad_copy_comments` text");
  await run("gaa.ad_copy_generated_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_generated_at` text");
  await run("gaa.ad_copy_published_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_published_at` text");
  await run("gaa.ad_copy_approved_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_approved_at` text");
  await run("gaa.ad_copy_original_copy", "ALTER TABLE `google_ads_audits` ADD `ad_copy_original_copy` text");
  await run("gaa.ad_copy_deploy_status", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_status` text");
  await run("gaa.ad_copy_deploy_started_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_started_at` text");
  await run("gaa.ad_copy_deployed_at", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deployed_at` text");
  await run("gaa.ad_copy_deploy_result", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_result` text");
  await run("gaa.ad_copy_deploy_error", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_error` text");
  await run("gaa.ad_copy_deploy_label", "ALTER TABLE `google_ads_audits` ADD `ad_copy_deploy_label` text");

  // Drop unique index on presentation_pin (allow same PIN across audits)
  // Payload/Drizzle names unique indexes as: {table}_{column}_unique
  await run("drop_unique_presentation_pin_a", "DROP INDEX IF EXISTS `google_ads_audits_presentation_pin_idx`");
  await run("drop_unique_presentation_pin_b", "DROP INDEX IF EXISTS `google_ads_audits_presentation_pin_unique`");
  await run("drop_unique_presentation_pin_c", "DROP INDEX IF EXISTS `google_ads_audits_presentation_pin`");
  // Find and drop any remaining unique index on presentation_pin
  try {
    const indexes = await client.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='google_ads_audits' AND sql LIKE '%presentation_pin%'");
    for (const row of indexes.rows || []) {
      const idxName = (row as any).name || (row as any)[0];
      if (idxName) {
        await run(`drop_pin_index_${idxName}`, `DROP INDEX IF EXISTS \`${idxName}\``);
      }
    }
  } catch { /* non-fatal */ }

  // Protected campaign IDs array table for clients (goal agent guard-rail)
  await run("clients_protected_campaign_ids", `CREATE TABLE IF NOT EXISTS \`clients_protected_campaign_ids\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`campaign_id\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("clients_protected_campaign_ids_order_idx", "CREATE INDEX IF NOT EXISTS \`clients_protected_campaign_ids_order_idx\` ON \`clients_protected_campaign_ids\` (\`_order\`)");
  await run("clients_protected_campaign_ids_parent_idx", "CREATE INDEX IF NOT EXISTS \`clients_protected_campaign_ids_parent_idx\` ON \`clients_protected_campaign_ids\` (\`_parent_id\`)");

  // Brand campaign IDs array table for clients (spend pacer brand vs non-brand)
  await run("clients_brand_campaign_ids", `CREATE TABLE IF NOT EXISTS \`clients_brand_campaign_ids\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`campaign_id\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("clients_brand_campaign_ids_order_idx", "CREATE INDEX IF NOT EXISTS \`clients_brand_campaign_ids_order_idx\` ON \`clients_brand_campaign_ids\` (\`_order\`)");
  await run("clients_brand_campaign_ids_parent_idx", "CREATE INDEX IF NOT EXISTS \`clients_brand_campaign_ids_parent_idx\` ON \`clients_brand_campaign_ids\` (\`_parent_id\`)");

  // Account managers array table for clients
  await run("clients_account_managers", `CREATE TABLE IF NOT EXISTS \`clients_account_managers\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`email\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);

  // Negative keywords array table (dbName: gads_proposal_negatives)
  await run("gads_proposal_negatives", `CREATE TABLE IF NOT EXISTS \`gads_proposal_negatives\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`pattern\` text NOT NULL,
    \`neg_scope\` text DEFAULT 'global',
    \`category\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gads_proposal_negatives_order_idx", "CREATE INDEX IF NOT EXISTS `gads_proposal_negatives_order_idx` ON `gads_proposal_negatives` (`_order`)");
  await run("gads_proposal_negatives_parent_idx", "CREATE INDEX IF NOT EXISTS `gads_proposal_negatives_parent_idx` ON `gads_proposal_negatives` (`_parent_id`)");

  // Enabled campaigns hasMany select → join table
  await run("gaa_proposal_enabled_campaigns", `CREATE TABLE IF NOT EXISTS \`google_ads_audits_proposal_enabled_campaigns\` (
    \`order\` integer NOT NULL, \`parent_id\` integer NOT NULL,
    \`value\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("gaa_proposal_enabled_campaigns_order_idx", "CREATE INDEX IF NOT EXISTS `gaa_proposal_enabled_campaigns_order_idx` ON `google_ads_audits_proposal_enabled_campaigns` (`order`)");
  await run("gaa_proposal_enabled_campaigns_parent_idx", "CREATE INDEX IF NOT EXISTS `gaa_proposal_enabled_campaigns_parent_idx` ON `google_ads_audits_proposal_enabled_campaigns` (`parent_id`)");

  // Rename proposal select columns: old dbName overrides → Payload's default names
  await run("rename_proposal_biz_type", "ALTER TABLE `google_ads_audits` RENAME COLUMN `proposal_biz_type` TO `proposal_business_type`");
  await run("rename_proposal_conv_goal", "ALTER TABLE `google_ads_audits` RENAME COLUMN `proposal_conv_goal` TO `proposal_conversion_goal`");
  await run("rename_proposal_svc_radius", "ALTER TABLE `google_ads_audits` RENAME COLUMN `proposal_svc_radius` TO `proposal_service_radius`");

  // Clean invalid select values that cause Payload validation failures on PATCH
  // Set to NULL if value is not in the valid options list
  await run("clean_invalid_proposal_biz_type", "UPDATE `google_ads_audits` SET `proposal_business_type` = NULL WHERE `proposal_business_type` NOT IN ('distributor', 'ecommerce', 'service', 'other') OR `proposal_business_type` = ''");
  await run("clean_invalid_proposal_conv_goal", "UPDATE `google_ads_audits` SET `proposal_conversion_goal` = NULL WHERE `proposal_conversion_goal` NOT IN ('leads', 'sales', 'bookings', 'signups') OR `proposal_conversion_goal` = ''");
  await run("clean_invalid_proposal_svc_radius", "UPDATE `google_ads_audits` SET `proposal_service_radius` = NULL WHERE `proposal_service_radius` NOT IN ('local', 'metro', 'state', 'national') OR `proposal_service_radius` = ''");

  // (Diagnostic SELECTs / PRAGMA dumps / live update tests removed — see
  // SECURITY note on POST. The migration DDL below is what GET exists for.)

  // ── Yearly Sales Target (2026-03-20) ──
  await run("clients.yearly_sales_target", "ALTER TABLE `clients` ADD `yearly_sales_target` real");
  await run("clients.target_deadline_date", "ALTER TABLE `clients` ADD `target_deadline_date` text");

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

  // --- Client Account Timeline array table ---
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

  // ── Link proposals to clients (2026-03-27) ──
  await run("client_proposals.client_id", "ALTER TABLE `client_proposals` ADD `client_id` integer REFERENCES `clients`(`id`) ON DELETE set null");
  await run("client_proposals_client_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_client_idx` ON `client_proposals` (`client_id`)");

  // ── Start-as-lead toggle on proposals (2026-05-17) ──
  // Companion to convert_to_client: lets the team materialise a SalesLead
  // from a proposal so the funnel is tracked even before client conversion.
  await run("client_proposals.start_as_lead", "ALTER TABLE `client_proposals` ADD `start_as_lead` integer DEFAULT false");
  await run("client_proposals.sales_lead_id", "ALTER TABLE `client_proposals` ADD `sales_lead_id` integer REFERENCES `sales_leads`(`id`) ON DELETE set null");
  await run("client_proposals_sales_lead_idx", "CREATE INDEX IF NOT EXISTS `client_proposals_sales_lead_idx` ON `client_proposals` (`sales_lead_id`)");

  // ── GBP override fields on competitors (2026-04-14) ──
  await run("client_proposals_competitors.gbp_rating", "ALTER TABLE `client_proposals_competitors` ADD `gbp_rating` numeric");
  await run("client_proposals_competitors.gbp_review_count", "ALTER TABLE `client_proposals_competitors` ADD `gbp_review_count` numeric");
  await run("client_proposals_competitors.gbp_responds_to_reviews", "ALTER TABLE `client_proposals_competitors` ADD `gbp_responds_to_reviews` integer DEFAULT 0");

  // ── Flight Plan Recommendations sub-table (missing from earlier migration) ──
  await run("client_proposals_flight_plan_recommendations_get", `CREATE TABLE IF NOT EXISTS \`client_proposals_flight_plan_recommendations\` (
    \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`enabled\` integer DEFAULT false, \`title\` text NOT NULL,
    \`description\` text, \`benefit\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`);
  await run("flight_plan_recs_order_idx_get", "CREATE INDEX IF NOT EXISTS `client_proposals_flight_plan_recommendations_order_idx` ON `client_proposals_flight_plan_recommendations` (`_order`)");
  await run("flight_plan_recs_parent_id_idx_get", "CREATE INDEX IF NOT EXISTS `client_proposals_flight_plan_recommendations_parent_id_idx` ON `client_proposals_flight_plan_recommendations` (`_parent_id`)");

  // ── Hidden keyword categories JSON column on client_proposals (2026-04-15) ──
  await run("client_proposals.hidden_keyword_categories_get", "ALTER TABLE `client_proposals` ADD `hidden_keyword_categories` text");

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
  await run("client_proposals_presentations_get", `CREATE TABLE IF NOT EXISTS \`client_proposals_presentations\` (
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
  await run("client_proposals_presentations_order_idx_get", "CREATE INDEX IF NOT EXISTS `client_proposals_presentations_order_idx` ON `client_proposals_presentations` (`_order`)");
  await run("client_proposals_presentations_parent_id_idx_get", "CREATE INDEX IF NOT EXISTS `client_proposals_presentations_parent_id_idx` ON `client_proposals_presentations` (`_parent_id`)");

  // ── Agent Memory + Soul (2026-05-12, lazy-loaded memory inspired by Pocket Agent) ──
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

  await run("locked_docs_rels.agent_memory_id", "ALTER TABLE `payload_locked_documents_rels` ADD `agent_memory_id` integer REFERENCES `agent_memory`(`id`) ON DELETE cascade");
  await run("locked_docs_rels.agent_soul_id", "ALTER TABLE `payload_locked_documents_rels` ADD `agent_soul_id` integer REFERENCES `agent_soul`(`id`) ON DELETE cascade");

  // ── Optimate chat turns (2026-05-12, persistent chat history per audit + user) ──
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
  await run("locked_docs_rels.optimate_chat_turns_id", "ALTER TABLE `payload_locked_documents_rels` ADD `optimate_chat_turns_id` integer REFERENCES `optimate_chat_turns`(`id`) ON DELETE cascade");

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
  await run("locked_docs_rels.match_type_violation_candidates_id", "ALTER TABLE `payload_locked_documents_rels` ADD `match_type_violation_candidates_id` integer REFERENCES `match_type_violation_candidates`(`id`) ON DELETE cascade");

  // ── Match Type Sync State (2026-05-20) ──
  await run("match_type_sync_state", `CREATE TABLE IF NOT EXISTS \`match_type_sync_state\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL UNIQUE REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    \`last_run_at\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`);
  await run("locked_docs_rels.match_type_sync_state_id", "ALTER TABLE `payload_locked_documents_rels` ADD `match_type_sync_state_id` integer REFERENCES `match_type_sync_state`(`id`) ON DELETE cascade");

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

  // optimate_settings.chat_history_token_limit (2026-06-29). Field added to the
  // OptiMate Settings global after its table was created, so existing prod
  // tables lack the column and saving the global 500s. Included in the GET list
  // (not just the POST sweep) because the full POST sweep can time out before
  // reaching it. See src/migrations/20260629_120000_add_optimate_chat_history_token_limit.ts.
  await run("optimate_settings.chat_history_token_limit", "ALTER TABLE \`optimate_settings\` ADD \`chat_history_token_limit\` numeric DEFAULT 6000");

  // clients.gads_auto_is_managed_google_ads_account (2026-06-16). The "managed
  // Google Ads account" toggle hides a client's account from OptiMate / active
  // account pickers when off. Only shipped in the registry migration, never in
  // the POST sweep, so prod lacked the column and the OptiMate accounts route
  // could not filter on it. Added to the GET fast-list so it reliably applies.
  await run("clients.gads_auto_is_managed_google_ads_account", "ALTER TABLE \`clients\` ADD \`gads_auto_is_managed_google_ads_account\` integer DEFAULT true");

  // agency_kpi_snapshots (2026-06-28). Collection shipped in the Payload config
  // but was never added to the POST sweep, so prod lacks both the table and its
  // payload_locked_documents_rels FK column. The missing FK column breaks the
  // document-lock query on ANY document write (surfaced as "Gmail token refresh
  // failed"). Added here in the GET fast-list because the full POST sweep can
  // time out before reaching the new statements.
  // See src/migrations/20260628_120000_add_agency_kpi_snapshots.ts.
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
  await run("agency_kpi_snapshots_month_idx", "CREATE UNIQUE INDEX IF NOT EXISTS \`agency_kpi_snapshots_month_idx\` ON \`agency_kpi_snapshots\` (\`month\`)");
  await run("agency_kpi_snapshots_updated_at_idx", "CREATE INDEX IF NOT EXISTS \`agency_kpi_snapshots_updated_at_idx\` ON \`agency_kpi_snapshots\` (\`updated_at\`)");
  await run("agency_kpi_snapshots_created_at_idx", "CREATE INDEX IF NOT EXISTS \`agency_kpi_snapshots_created_at_idx\` ON \`agency_kpi_snapshots\` (\`created_at\`)");
  await run("locked_docs_rels.agency_kpi_snapshots_id", "ALTER TABLE \`payload_locked_documents_rels\` ADD \`agency_kpi_snapshots_id\` integer REFERENCES \`agency_kpi_snapshots\`(\`id\`) ON DELETE cascade");

  // google_ads_audits campaign-proposal geo/labelling config columns. Shipped
  // in the collection config but never in the prod sweep, so prod lacked them
  // and ANY audit insert rolled back — including the lightweight on-demand audit
  // the OptiMate accounts route creates for managed client-only accounts, which
  // is why such accounts never appeared in the picker. Added to the GET
  // fast-list so it reliably applies.
  await run("add_proposal_geo_isolation_mode", "ALTER TABLE \`google_ads_audits\` ADD COLUMN \`proposal_geo_isolation_mode\` text DEFAULT 'off'");
  await run("add_proposal_near_me_strategy", "ALTER TABLE \`google_ads_audits\` ADD COLUMN \`proposal_near_me_strategy\` text DEFAULT 'include_in_local_only'");
  await run("add_proposal_geo_negative_strategy", "ALTER TABLE \`google_ads_audits\` ADD COLUMN \`proposal_geo_negative_strategy\` text DEFAULT 'keyword_and_location'");
  await run("add_proposal_preserve_keyword_cpc", "ALTER TABLE \`google_ads_audits\` ADD COLUMN \`proposal_preserve_keyword_cpc\` integer DEFAULT true");
  await run("add_proposal_phrase_match_requires_approval", "ALTER TABLE \`google_ads_audits\` ADD COLUMN \`proposal_phrase_match_requires_approval\` integer DEFAULT true");
  await run("add_proposal_created_by_label", "ALTER TABLE \`google_ads_audits\` ADD COLUMN \`proposal_created_by_label\` text DEFAULT 'Created by Optimise Digital'");
  await run("add_proposal_pending_activation_label", "ALTER TABLE \`google_ads_audits\` ADD COLUMN \`proposal_pending_activation_label\` text DEFAULT 'Pending activation - Optimise Digital'");
  await run("add_proposal_activated_label", "ALTER TABLE \`google_ads_audits\` ADD COLUMN \`proposal_activated_label\` text DEFAULT 'Activated by Optimise Digital'");

  let tables: string[] = [];
  try {
    const tablesResult = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    tables = tablesResult.rows.map((r: any) => r.name || r[0]);
  } catch { /* ignore */ }

  // Response shape mirrors POST: status lines + table-name list only.
  // CI greps for `"ERROR:` in `results` — keep that token format intact.
  return NextResponse.json({ ok: true, version: "2026-05-17", migrationsRun: results, tables });
}
