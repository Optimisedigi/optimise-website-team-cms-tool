import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Drops the legacy `discovery_notes` column from `client_proposals`.
 *
 * Background
 * ----------
 * `discoveryNotes` was a single textarea on the proposal that auto-migrated
 * into the new entity's notes on two conversion paths:
 *   - proposal → client (rolled into clientNotes at the top)
 *   - proposal → sales lead (rolled into `notes`)
 *
 * It has been superseded by the structured Discovery Briefing collection
 * (`client-discovery-briefings`), which carries the full 11-section
 * questionnaire AND is now re-pointed to the new client on conversion (see
 * `convertToClientHook` in ClientProposals.ts). The briefing covers target
 * audience, USP, services, tech stack, SEO/Ads strategy — all the things the
 * old free-text field tried to capture and more.
 *
 * Per product decision: no data in the old column is worth preserving.
 * Straight drop. SQLite 3.35+ / recent libSQL support ALTER TABLE … DROP COLUMN.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`client_proposals\` DROP COLUMN \`discovery_notes\`;`,
    )
  } catch {
    // Column may not exist (fresh dev DB where the original ADD never ran).
    // Idempotent: safe to ignore.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // The replacement (client_discovery_briefings) is structurally different
  // and the dropped column had no preserved data. No rollback.
}
