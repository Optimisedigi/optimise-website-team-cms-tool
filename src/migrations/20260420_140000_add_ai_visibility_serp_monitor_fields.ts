import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds the `analytics`, `aiVisibility`, and `serpMonitor` groups to the `clients` collection.
 *
 * Group fields in Payload's SQLite adapter are flattened into columns on the parent table
 * using snake_case (e.g. `serpMonitor.alertThresholds.pixelOffsetDrop` ->
 * `serp_monitor_alert_thresholds_pixel_offset_drop`).
 *
 * Array fields become child tables (`clients_<array_path>`) with `_order`, `_parent_id`,
 * and text UUID `id` primary keys — matching the existing `clients_seo_auto_notification_emails`
 * pattern used elsewhere in this DB.
 *
 * For existing client docs, sensible defaults are applied:
 *   - analytics.ga4PropertyId -> NULL
 *   - aiVisibility.enabled -> false (0)
 *   - aiVisibility.recipientEmails -> [] (no child rows)
 *   - aiVisibility.probePrompts -> [] (no child rows)
 *   - serpMonitor.enabled -> false (0)
 *   - serpMonitor.domain -> NULL
 *   - serpMonitor.keywords -> [] (no child rows)
 *   - serpMonitor.alertRecipientEmails -> [] (no child rows)
 *   - serpMonitor.alertThresholds.organicDropPositions -> 3
 *   - serpMonitor.alertThresholds.pixelOffsetDrop -> 400
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── clients.analytics group ──
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`analytics_ga4_property_id\` text;`)
  } catch { /* column may already exist */ }

  // ── clients.aiVisibility group ──
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`ai_visibility_enabled\` integer DEFAULT false;`)
  } catch { /* column may already exist */ }

  // Backfill false for any existing rows that slipped in as NULL.
  await db.run(sql`UPDATE \`clients\` SET \`ai_visibility_enabled\` = 0 WHERE \`ai_visibility_enabled\` IS NULL;`)

  // ── clients.serpMonitor group (flat columns) ──
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`serp_monitor_enabled\` integer DEFAULT false;`)
  } catch { /* column may already exist */ }
  await db.run(sql`UPDATE \`clients\` SET \`serp_monitor_enabled\` = 0 WHERE \`serp_monitor_enabled\` IS NULL;`)

  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`serp_monitor_domain\` text;`)
  } catch { /* column may already exist */ }

  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`serp_monitor_alert_thresholds_organic_drop_positions\` numeric DEFAULT 3;`)
  } catch { /* column may already exist */ }
  await db.run(sql`UPDATE \`clients\` SET \`serp_monitor_alert_thresholds_organic_drop_positions\` = 3 WHERE \`serp_monitor_alert_thresholds_organic_drop_positions\` IS NULL;`)

  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`serp_monitor_alert_thresholds_pixel_offset_drop\` numeric DEFAULT 400;`)
  } catch { /* column may already exist */ }
  await db.run(sql`UPDATE \`clients\` SET \`serp_monitor_alert_thresholds_pixel_offset_drop\` = 400 WHERE \`serp_monitor_alert_thresholds_pixel_offset_drop\` IS NULL;`)

  // ── Array tables (empty for all existing clients) ──
  // aiVisibility.recipientEmails — [{ email }]
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_ai_visibility_recipient_emails\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`email\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_ai_visibility_recipient_emails_order_idx\` ON \`clients_ai_visibility_recipient_emails\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_ai_visibility_recipient_emails_parent_id_idx\` ON \`clients_ai_visibility_recipient_emails\` (\`_parent_id\`);`)

  // aiVisibility.probePrompts — [{ prompt }]
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_ai_visibility_probe_prompts\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`prompt\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_ai_visibility_probe_prompts_order_idx\` ON \`clients_ai_visibility_probe_prompts\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_ai_visibility_probe_prompts_parent_id_idx\` ON \`clients_ai_visibility_probe_prompts\` (\`_parent_id\`);`)

  // serpMonitor.keywords — [{ keyword, location, device }]
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_serp_monitor_keywords\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`keyword\` text NOT NULL,
    \`location\` text DEFAULT 'au:sydney' NOT NULL,
    \`device\` text DEFAULT 'desktop',
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_serp_monitor_keywords_order_idx\` ON \`clients_serp_monitor_keywords\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_serp_monitor_keywords_parent_id_idx\` ON \`clients_serp_monitor_keywords\` (\`_parent_id\`);`)

  // serpMonitor.alertRecipientEmails — [{ email }]
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_serp_monitor_alert_recipient_emails\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`email\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_serp_monitor_alert_recipient_emails_order_idx\` ON \`clients_serp_monitor_alert_recipient_emails\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_serp_monitor_alert_recipient_emails_parent_id_idx\` ON \`clients_serp_monitor_alert_recipient_emails\` (\`_parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`clients_serp_monitor_alert_recipient_emails\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`clients_serp_monitor_keywords\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`clients_ai_visibility_probe_prompts\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`clients_ai_visibility_recipient_emails\`;`)
  // SQLite doesn't support DROP COLUMN cleanly on older versions — leave the flat columns.
}
