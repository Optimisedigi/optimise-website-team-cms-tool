import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds `trading_name` to the `clients` table.
 *
 * Purpose:
 *   - `clients.trading_name` — Written by the contract→client sync on
 *     signature. Stores the client's trading / operating name so it
 *     persists alongside the legal entity name in the client record.
 *
 * Column is nullable so existing clients continue unchanged.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`trading_name\` text;`);
  } catch {
    // Column may already exist.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Optional column; SQLite DROP COLUMN support varies. Leave in place on rollback.
}
