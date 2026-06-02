import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds a Google Ads management toggle to clients. When false, the account is
 * hidden from OptiMate and active Google Ads account pickers while still keeping
 * the customer ID for reference/MCC visibility.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `clients` ADD `gads_auto_is_managed_google_ads_account` integer DEFAULT true;",
      ),
    );
  } catch {
    // Column may already exist on pushed/dev databases.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: nullable/defaulted flag is safe to leave in place.
}
