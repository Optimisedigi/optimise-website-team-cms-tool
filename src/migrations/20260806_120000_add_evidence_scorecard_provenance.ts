import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function ignoreExisting(db: MigrateUpArgs["db"], statement: string) { try { await db.run(sql.raw(statement)); } catch (error) { if (!/duplicate column|already exists/i.test(error instanceof Error ? error.message : String(error))) throw error; } }
async function ignoreMissing(db: MigrateDownArgs["db"], statement: string) { try { await db.run(sql.raw(statement)); } catch (error) { if (!/no such column/i.test(error instanceof Error ? error.message : String(error))) throw error; } }
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await ignoreExisting(db, "ALTER TABLE `google_ads_audit_snapshots` ADD COLUMN `rubric_version` text;");
  await ignoreExisting(db, "ALTER TABLE `google_ads_audit_snapshots` ADD COLUMN `website_url` text;");
  await ignoreExisting(db, "ALTER TABLE `google_ads_audit_snapshots` ADD COLUMN `capture_context` text;");
  await ignoreExisting(db, "ALTER TABLE `google_ads_audits` ADD COLUMN `score_rubric_version` text;");
  await ignoreExisting(db, "ALTER TABLE `google_ads_audits` ADD COLUMN `score_status` text;");
  await ignoreExisting(db, "ALTER TABLE `google_ads_audits` ADD COLUMN `audit_detail_url` text;");
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const column of ["rubric_version", "website_url", "capture_context"]) await ignoreMissing(db, `ALTER TABLE \`google_ads_audit_snapshots\` DROP COLUMN \`${column}\`;`);
  for (const column of ["score_rubric_version", "score_status", "audit_detail_url"]) await ignoreMissing(db, `ALTER TABLE \`google_ads_audits\` DROP COLUMN \`${column}\`;`);
}
