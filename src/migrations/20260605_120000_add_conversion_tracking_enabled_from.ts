import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the account-health conversion tracking maturity date used by
 * zero-conversion pause detectors. Payload flattens group fields in SQLite as
 * `<group>_<field>` columns on the parent table.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`spend_policy_conversion_tracking_enabled_from\` text;`);
  } catch {
    // Column may already exist on freshly-pushed dev databases.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Intentional no-op: retaining this nullable metadata is harmless and matches
  // recent SQLite migration conventions in this repo.
}
