import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds `brand_spend` to the per-month waste/relevancy cache so the
 * Overview tab's Monthly Performance chart can derive its brand vs
 * generic split from per-month search-term data (instead of relying on
 * campaign-name pattern matching, which often miscategorises).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`negative_keyword_monthly_waste_relevancy_cache\` ADD \`brand_spend\` numeric DEFAULT 0;`,
    )
  } catch { /* column already exists */ }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite DROP COLUMN support varies — leave column in place on rollback.
}
