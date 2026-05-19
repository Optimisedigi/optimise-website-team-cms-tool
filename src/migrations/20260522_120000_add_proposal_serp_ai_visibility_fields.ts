import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds the SERP Displacement / AI Visibility / GA4 / GSC fields to the
 * `client_proposals` table so the Audit Results tab can render and the
 * convertToClient hook can carry them onto the new client record.
 *
 * Columns added (all nullable, sensible defaults for existing rows):
 *   - ga4_property_id                          text                (flat)
 *   - gsc_site_url                             text                (flat)
 *   - serp_monitor_enabled                     integer DEFAULT 0   (group.enabled)
 *   - ai_visibility_enabled                    integer DEFAULT 0   (group.enabled)
 *   - latest_serp_displacement_snapshot_id     integer (FK -> serp_displacement_snapshots, ON DELETE set null)
 *   - latest_ai_visibility_snapshot_id         integer (FK -> ai_visibility_snapshots,      ON DELETE set null)
 *
 * Each ALTER is wrapped in try/catch so re-running on a partially-migrated
 * DB is safe (mirrors the convention used by neighbouring migrations).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── Flat top-level fields ──
  try {
    await db.run(sql`ALTER TABLE \`client_proposals\` ADD \`ga4_property_id\` text;`)
  } catch { /* already exists */ }

  try {
    await db.run(sql`ALTER TABLE \`client_proposals\` ADD \`gsc_site_url\` text;`)
  } catch { /* already exists */ }

  // ── Group: serpMonitor (only `enabled` is exposed on the proposal) ──
  try {
    await db.run(sql`ALTER TABLE \`client_proposals\` ADD \`serp_monitor_enabled\` integer DEFAULT false;`)
  } catch { /* already exists */ }
  await db.run(sql`UPDATE \`client_proposals\` SET \`serp_monitor_enabled\` = 0 WHERE \`serp_monitor_enabled\` IS NULL;`)

  // ── Group: aiVisibility (only `enabled` is exposed on the proposal) ──
  try {
    await db.run(sql`ALTER TABLE \`client_proposals\` ADD \`ai_visibility_enabled\` integer DEFAULT false;`)
  } catch { /* already exists */ }
  await db.run(sql`UPDATE \`client_proposals\` SET \`ai_visibility_enabled\` = 0 WHERE \`ai_visibility_enabled\` IS NULL;`)

  // ── Single-relationship FK columns ──
  try {
    await db.run(sql`ALTER TABLE \`client_proposals\` ADD \`latest_serp_displacement_snapshot_id\` integer REFERENCES \`serp_displacement_snapshots\`(\`id\`) ON DELETE set null;`)
  } catch { /* already exists */ }
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_proposals_latest_serp_displacement_snapshot_idx\` ON \`client_proposals\` (\`latest_serp_displacement_snapshot_id\`);`)

  try {
    await db.run(sql`ALTER TABLE \`client_proposals\` ADD \`latest_ai_visibility_snapshot_id\` integer REFERENCES \`ai_visibility_snapshots\`(\`id\`) ON DELETE set null;`)
  } catch { /* already exists */ }
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_proposals_latest_ai_visibility_snapshot_idx\` ON \`client_proposals\` (\`latest_ai_visibility_snapshot_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite doesn't support DROP COLUMN cleanly on older versions, and the
  // adjacent migrations leave columns in place on `down`. Mirror that.
  await db.run(sql`DROP INDEX IF EXISTS \`client_proposals_latest_serp_displacement_snapshot_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`client_proposals_latest_ai_visibility_snapshot_idx\`;`)
}
