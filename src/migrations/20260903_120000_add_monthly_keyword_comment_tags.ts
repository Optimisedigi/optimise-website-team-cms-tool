import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Persist @-tags on the canonical Review-outcomes comment (added/updated/moved)
 * and on removed-negative explanations. Follow-ups and Needs-review comments
 * already store tagged user ids.
 */
const COLUMNS = [
  ['monthly_keyword_selection_rows', 'outcome_comment_tagged_user_ids'],
  ['monthly_keyword_selection_rows', 'removed_comment_tagged_user_ids'],
  ['monthly_keyword_selections_selections', 'outcome_comment_tagged_user_ids'],
  ['monthly_keyword_selections_selections', 'removed_comment_tagged_user_ids'],
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
