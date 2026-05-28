import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the flattened Clients.spendPolicy group columns used by account-health
 * goal agents. Payload stores group fields as `spend_policy_<field>` columns on
 * the parent `clients` table in SQLite/libSQL.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columns: Array<{ name: string; type: "text" | "real" }> = [
    { name: "spend_policy_pacing_mode", type: "text" },
    { name: "spend_policy_pacing_window", type: "text" },
    { name: "spend_policy_monthly_budget_target", type: "real" },
    { name: "spend_policy_acceptable_variance_percent_low", type: "real" },
    { name: "spend_policy_acceptable_variance_percent_high", type: "real" },
    { name: "spend_policy_hard_floor", type: "real" },
    { name: "spend_policy_hard_ceiling", type: "real" },
    { name: "spend_policy_conversion_tracking_enabled_from", type: "text" },
  ];

  for (const column of columns) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`clients\` ADD \`${column.name}\` ${column.type};`));
    } catch {
      // Column may already exist on freshly-pushed dev databases.
    }
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Intentional no-op: retaining nullable client policy metadata is harmless and
  // avoids destructive SQLite table rebuilds in production rollbacks.
}
