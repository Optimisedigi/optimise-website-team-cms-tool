import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`yearly_sales_target\` real;`)
  } catch {
    /* column may already exist */
  }
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`target_deadline_date\` text;`)
  } catch {
    /* column may already exist */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite doesn't support DROP COLUMN easily — no-op
}
