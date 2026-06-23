import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`
      ALTER TABLE \`monthly_keyword_selections\`
      ADD COLUMN \`suppression_nkl_ids_configured\` numeric DEFAULT false;
    `)
  } catch { /* column already exists */ }

  try {
    await db.run(sql`
      ALTER TABLE \`monthly_keyword_selections\`
      ADD COLUMN \`suppression_nkl_ids\` text;
    `)
  } catch { /* column already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections\` DROP COLUMN \`suppression_nkl_ids_configured\`;`)
  } catch { /* ignore */ }
  try {
    await db.run(sql`ALTER TABLE \`monthly_keyword_selections\` DROP COLUMN \`suppression_nkl_ids\`;`)
  } catch { /* ignore */ }
}
