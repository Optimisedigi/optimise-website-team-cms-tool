import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`decided_by_user_id\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`decided_by\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`review_dismissed_at\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`review_dismissed_by\` text;`)
  } catch { /* column already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`decided_by_user_id\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`decided_by\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`review_dismissed_at\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`review_dismissed_by\`;`)
  } catch { /* ignore */ }
}
