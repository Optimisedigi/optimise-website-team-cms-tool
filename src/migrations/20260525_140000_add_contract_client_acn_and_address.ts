import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds columns to the `contracts` and `clients` tables:
 *
 * `contracts`:
 *   - `client_acn`               — ACN/ABN (text). Rendered on the cover
 *                                  when set; the client can fill it in
 *                                  themselves on the signing page.
 *   - `client_business_address`  — Business address (text). Same UX as
 *                                  above; multiline textarea on the form.
 *   - `client_trading_name`      — Trading / operating name (text). Shown
 *                                  on the cover and signing page when set.
 *
 * `clients`:
 *   - `trading_name`            — Trading / operating name (text). Written
 *                                  by the contract→client sync on signature.
 *
 * All columns are nullable so existing records continue to render
 * unchanged (no extra blank lines appear on the cover until set).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`contracts\` ADD \`client_acn\` text;`)
  } catch {
    // Column may already exist.
  }
  try {
    await db.run(sql`ALTER TABLE \`contracts\` ADD \`client_business_address\` text;`)
  } catch {
    // Column may already exist.
  }
  try {
    await db.run(sql`ALTER TABLE \`contracts\` ADD \`client_trading_name\` text;`)
  } catch {
    // Column may already exist.
  }
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`trading_name\` text;`)
  } catch {
    // Column may already exist.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Optional columns; SQLite DROP COLUMN support varies. Leave in place on rollback.
}
