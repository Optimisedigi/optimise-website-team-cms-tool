import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`outcome_type\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`outcome_detail\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`outcome_comment\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`outcome_by\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`outcome_by_user_id\` text;`)
  } catch { /* column already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` ADD COLUMN \`outcome_at\` text;`)
  } catch { /* column already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`outcome_type\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`outcome_detail\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`outcome_comment\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`outcome_by\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`outcome_by_user_id\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`outcome_at\`;`)
  } catch { /* ignore */ }
}
