import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`
      ALTER TABLE \`monthly_keyword_selections_selections\`
      ADD COLUMN \`row_index\` numeric DEFAULT 0 NOT NULL;
    `)
  } catch { /* column already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections_selections\` DROP COLUMN \`row_index\`;`)
  } catch { /* ignore */ }
}
