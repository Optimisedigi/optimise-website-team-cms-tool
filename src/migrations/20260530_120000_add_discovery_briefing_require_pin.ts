import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the `require_pin` boolean column to `client_discovery_briefings`.
 *
 * When set, the public discovery briefing routes
 * (`/client/<slug>/discovery/<id>`, `/client-proposal/<slug>/discovery/<id>`)
 * require the parent's PIN before rendering the form. Off by default so
 * existing briefings remain freely accessible to anyone with the link.
 *
 * The column is `integer` (0/1) to match SQLite booleans used elsewhere
 * (see `enabled` on `campaign_budgets`, etc.).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`client_discovery_briefings\` ADD \`require_pin\` integer DEFAULT 0;`,
    );
  } catch {
    // Idempotent — column may already exist on a freshly-pushed dev DB.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite DROP COLUMN is supported on 3.35+, but leaving the column is
  // harmless and avoids breaking already-deployed environments that may have
  // backfilled values. Intentional no-op.
}
