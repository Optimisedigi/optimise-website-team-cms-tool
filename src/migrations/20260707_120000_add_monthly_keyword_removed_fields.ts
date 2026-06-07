import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`removed_comment\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`removed_by\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`removed_by_user_id\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`removed_at\` text;`)
  } catch { /* column already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`removed_comment\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`removed_by\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`removed_by_user_id\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`removed_at\`;`)
  } catch { /* ignore */ }
}
