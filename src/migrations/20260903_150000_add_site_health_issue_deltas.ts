import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`site_health_reports\` ADD \`comparison_new_issues_list\` text`)
  } catch { /* exists */ }
  try {
    await db.run(sql`ALTER TABLE \`site_health_reports\` ADD \`comparison_fixed_issues_list\` text`)
  } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`site_health_reports\` DROP COLUMN \`comparison_new_issues_list\``)
  } catch { /* doesn't exist */ }
  try {
    await db.run(sql`ALTER TABLE \`site_health_reports\` DROP COLUMN \`comparison_fixed_issues_list\``)
  } catch { /* doesn't exist */ }
}
