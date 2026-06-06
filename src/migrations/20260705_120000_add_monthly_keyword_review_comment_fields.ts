import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`review_comment\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`review_comment_by\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`review_comment_at\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`review_comment_tagged_user_ids\` text;`)
  } catch { /* column already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`review_comment\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`review_comment_by\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`review_comment_at\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`review_comment_tagged_user_ids\`;`)
  } catch { /* ignore */ }
}
