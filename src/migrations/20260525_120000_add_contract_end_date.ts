import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds the optional `contract_end_date` column to the `contracts` table.
 *
 * Surfaced on the Contracts collection as `contractEndDate` (date field).
 * When set, the cover page on the PDF / signing page / DOCX renders an
 * "End Date:" line below the effective-date line. When null/empty the
 * line is omitted entirely — existing contracts get no visual change.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`contracts\` ADD \`contract_end_date\` text;`)
  } catch {
    // Column may already exist (e.g. re-run after run-migrations.ts created it).
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Optional column; SQLite DROP COLUMN support varies. Leave in place on rollback.
}
