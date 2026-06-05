import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`
      ALTER TABLE \`monthly_keyword_selections_selections\`
      ADD COLUMN \`watch_horizon_months\` numeric;
    `)
  } catch { /* column already exists */ }

  try {
    await db.run(sql`
      ALTER TABLE \`monthly_keyword_selections_selections\`
      ADD COLUMN \`watch_until\` text;
    `)
  } catch { /* column already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`watch_horizon_months\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`watch_until\`;`)
  } catch { /* ignore */ }
}
