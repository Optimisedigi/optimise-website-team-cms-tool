import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Client Email Copy tab on the OptiMate Settings global.
 *
 * Adds one nullable text column per editable copy slot (see
 * `src/lib/agents/optimate-google-ads/tools/_email-copy-slots.ts`). Payload
 * flattens a group into `<group>_<field>` columns, so the `clientEmailCopy`
 * group becomes `client_email_copy_*`.
 *
 * Production runs with `push` disabled, so without this migration every read of
 * the global - the Settings screen, model lookups, OptiMate auth - would fail
 * with "no such column". A NULL column simply means "no override", which the
 * loader treats as "use the shipped default", so existing rows stay valid.
 */
const COLUMNS = [
  "client_email_copy_greeting",
  "client_email_copy_weekly_performance_up_efficient",
  "client_email_copy_weekly_performance_up",
  "client_email_copy_weekly_performance_down_efficient",
  "client_email_copy_weekly_performance_down",
  "client_email_copy_weekly_performance_flat_cpa_move",
  "client_email_copy_weekly_intro_converting",
  "client_email_copy_weekly_intro_spend",
  "client_email_copy_weekly_intro_flat",
  "client_email_copy_weekly_budget_under",
  "client_email_copy_weekly_budget_over",
  "client_email_copy_monthly_performance_up_efficient",
  "client_email_copy_monthly_performance_up",
  "client_email_copy_monthly_performance_down_efficient",
  "client_email_copy_monthly_performance_down",
  "client_email_copy_monthly_performance_flat_cpa_move",
  "client_email_copy_monthly_performance_converting",
  "client_email_copy_monthly_performance_spend",
  "client_email_copy_monthly_performance_flat",
] as const;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const column of COLUMNS) {
    // Tolerate a column that already exists: local dev pushes the schema
    // automatically, so this migration may run against an up-to-date table.
    await db
      .run(sql.raw(`ALTER TABLE \`optimate_settings\` ADD \`${column}\` text;`))
      .catch(() => undefined);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const column of COLUMNS) {
    await db
      .run(sql.raw(`ALTER TABLE \`optimate_settings\` DROP COLUMN \`${column}\`;`))
      .catch(() => undefined);
  }
}
