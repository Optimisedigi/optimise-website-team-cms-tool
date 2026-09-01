import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Client-level AI triage context + the suggested ad group on each candidate.
 *
 * Without the client context the classifier only knew a client's name and URL,
 * so it could not tell that e.g. temp/contract staffing terms are off-brand.
 * `ai_suggested_ad_group` records a better-fitting group than the one that
 * triggered the violation. Production runs with push disabled, so the columns
 * must be added here.
 */
const CLIENT_COLUMNS = [
  ["gads_auto_triage_ideal_customer", "text"],
  ["gads_auto_triage_exclusions", "text"],
] as const;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [column, type] of CLIENT_COLUMNS) {
    // Tolerate an existing column: local dev pushes the schema automatically.
    await db.run(sql.raw(`ALTER TABLE \`clients\` ADD \`${column}\` ${type};`)).catch(() => undefined);
  }
  await db
    .run(sql.raw("ALTER TABLE `match_type_violation_candidates` ADD `ai_suggested_ad_group` text;"))
    .catch(() => undefined);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db
    .run(sql.raw("ALTER TABLE `match_type_violation_candidates` DROP COLUMN `ai_suggested_ad_group`;"))
    .catch(() => undefined);
  for (const [column] of CLIENT_COLUMNS) {
    await db.run(sql.raw(`ALTER TABLE \`clients\` DROP COLUMN \`${column}\`;`)).catch(() => undefined);
  }
}
