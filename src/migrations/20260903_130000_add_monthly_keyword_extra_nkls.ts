import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Extra NKL ids so one monthly-review term can target up to 3 lists on Apply.
 */
const COLUMNS = [
  ['monthly_keyword_selection_rows', 'extra_applied_nkl_ids'],
  ['monthly_keyword_selections_selections', 'extra_applied_nkl_ids'],
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [table, column] of COLUMNS) {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` ADD \`${column}\` text;`)).catch(() => undefined)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const [table, column] of COLUMNS) {
    await db.run(sql.raw(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\`;`)).catch(() => undefined)
  }
}
