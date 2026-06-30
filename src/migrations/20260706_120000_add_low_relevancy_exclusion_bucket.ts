import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds a separate low-relevancy bucket for NKLs whose traffic can still
 * convert, but at a weaker rate. The dashboard keeps this spend out of the
 * default Keyword Relevancy % and can fold it back in with its own toggle.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db
    .run(
      sql`ALTER TABLE \`negative_keyword_monthly_waste_relevancy_cache\` ADD \`low_relevancy_excluded_spend\` numeric DEFAULT 0;`,
    )
    .catch(() => undefined);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`negative_keyword_monthly_waste_relevancy_cache\` DROP COLUMN \`low_relevancy_excluded_spend\`;`)
    .catch(() => undefined);
}
