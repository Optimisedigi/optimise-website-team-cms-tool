import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the competitor / brand relevancy-exclusion support:
 *
 *  1. `negative_keyword_lists.relevancy_exclusion` (text, default 'none') —
 *     tags a whole NKL so its keywords are kept out of the dashboard Keyword
 *     Relevancy % by default (competitor / brand negatives that block
 *     non-converting-but-not-irrelevant traffic).
 *  2. `negative_keyword_monthly_waste_relevancy_cache.competitor_excluded_spend`
 *     and `.brand_excluded_spend` (numeric, default 0) — per-month spend
 *     blocked only by competitor / brand tagged lists, stored separately so
 *     the dashboard toggles can fold them back in without a recompute.
 *
 * Idempotent: every ALTER is wrapped in a catch so re-running on an
 * environment that already has the column is a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`negative_keyword_lists\` ADD \`relevancy_exclusion\` text DEFAULT 'none';`)
    .catch(() => undefined);
  await db
    .run(
      sql`ALTER TABLE \`negative_keyword_monthly_waste_relevancy_cache\` ADD \`competitor_excluded_spend\` numeric DEFAULT 0;`,
    )
    .catch(() => undefined);
  await db
    .run(
      sql`ALTER TABLE \`negative_keyword_monthly_waste_relevancy_cache\` ADD \`brand_excluded_spend\` numeric DEFAULT 0;`,
    )
    .catch(() => undefined);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db
    .run(sql`ALTER TABLE \`negative_keyword_lists\` DROP COLUMN \`relevancy_exclusion\`;`)
    .catch(() => undefined);
  await db
    .run(
      sql`ALTER TABLE \`negative_keyword_monthly_waste_relevancy_cache\` DROP COLUMN \`competitor_excluded_spend\`;`,
    )
    .catch(() => undefined);
  await db
    .run(
      sql`ALTER TABLE \`negative_keyword_monthly_waste_relevancy_cache\` DROP COLUMN \`brand_excluded_spend\`;`,
    )
    .catch(() => undefined);
}
