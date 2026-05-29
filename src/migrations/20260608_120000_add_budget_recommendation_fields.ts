import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the monthly budget recommendation columns to
 * `google_ads_campaign_budgets`. Populated by the monthly recommendation cron
 * (/api/google-ads-budgets/monthly-recommendations) from last month's
 * performance. Advisory only — never auto-pushed.
 *
 *  - recommended_daily_budget    (real)  recommended daily budget
 *  - recommendation_generated_at (text)  ISO timestamp the rec was computed
 *  - recommendation_basis        (text)  JSON of last-month inputs (conv/spend/cpa/score)
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columns: Array<{ name: string; type: "text" | "real" }> = [
    { name: "recommended_daily_budget", type: "real" },
    { name: "recommendation_generated_at", type: "text" },
    { name: "recommendation_basis", type: "text" },
  ];

  for (const column of columns) {
    try {
      await db.run(
        sql.raw(
          `ALTER TABLE \`google_ads_campaign_budgets\` ADD \`${column.name}\` ${column.type};`,
        ),
      );
    } catch {
      // Column may already exist on freshly-pushed dev databases.
    }
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Intentional no-op: retaining nullable recommendation metadata is harmless
  // and avoids destructive SQLite table rebuilds in production rollbacks.
}
