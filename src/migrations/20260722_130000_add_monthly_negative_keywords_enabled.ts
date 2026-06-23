import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`
      ALTER TABLE \`clients\`
      ADD COLUMN \`gads_auto_monthly_negative_keywords_enabled\` integer DEFAULT false;
    `)
  } catch { /* column already exists */ }

  try {
    await db.run(sql`
      UPDATE \`clients\`
      SET \`gads_auto_monthly_negative_keywords_enabled\` = true
      WHERE \`id\` IN (
        SELECT DISTINCT \`client_id\` FROM \`monthly_keyword_terms_cache\`
        UNION
        SELECT DISTINCT \`client_id\` FROM \`monthly_keyword_selections\`
      );
    `)
  } catch { /* monthly tables may not exist yet on fresh installs */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` DROP COLUMN \`gads_auto_monthly_negative_keywords_enabled\`;`)
  } catch { /* ignore */ }
}
