import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function ignoreExisting(db: MigrateUpArgs["db"], statement: string) {
  try { await db.run(sql.raw(statement)); }
  catch (error) { if (!/duplicate column|already exists/i.test(error instanceof Error ? error.message : String(error))) throw error; }
}
async function ignoreMissing(db: MigrateDownArgs["db"], statement: string) {
  try { await db.run(sql.raw(statement)); }
  catch (error) { if (!/no such column/i.test(error instanceof Error ? error.message : String(error))) throw error; }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [column, type] of [
    ["business_name", "text"], ["business_type", "text"], ["brand_terms", "text"],
    ["conversion_objectives", "text"], ["search_location", "text"], ["search_language", "text"],
    ["competitor_seed_queries", "text"],
  ]) await ignoreExisting(db, `ALTER TABLE \`google_ads_audit_snapshots\` ADD COLUMN \`${column}\` ${type};`);
  for (const [column, type] of [["search_location", "text"], ["search_language", "text"], ["competitor_seed_queries", "text"]]) {
    await ignoreExisting(db, `ALTER TABLE \`google_ads_audits\` ADD COLUMN \`${column}\` ${type};`);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const column of ["business_name", "business_type", "brand_terms", "conversion_objectives", "search_location", "search_language", "competitor_seed_queries"]) {
    await ignoreMissing(db, `ALTER TABLE \`google_ads_audit_snapshots\` DROP COLUMN \`${column}\`;`);
  }
  for (const column of ["search_location", "search_language", "competitor_seed_queries"]) {
    await ignoreMissing(db, `ALTER TABLE \`google_ads_audits\` DROP COLUMN \`${column}\`;`);
  }
}
