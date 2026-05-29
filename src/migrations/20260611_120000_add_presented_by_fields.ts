import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the `presented_by` text column (Payload field `presentedBy`) to the
 * three places it's edited: seo_audit_proposals, client_proposals and clients.
 * Shown on the closing slide of the SEO Audit Proposal deck.
 *
 * Drizzle snake-cases `presentedBy` → `presented_by`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const tables = ["seo_audit_proposals", "client_proposals", "clients"];
  for (const table of tables) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD \`presented_by\` text;`));
    } catch {
      // Column already exists (freshly-pushed dev DBs) — ignore.
    }
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Non-destructive: retaining a nullable text column is harmless.
}
