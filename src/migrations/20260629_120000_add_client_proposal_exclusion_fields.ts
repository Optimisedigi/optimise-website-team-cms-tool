import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds the remaining Client Proposal JSON fields used by the proposal editor UI.
 * Some environments had `hidden_keyword_categories` but not these sibling
 * columns, which caused the Payload admin list query to fail before rendering.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columns: Array<{ name: string; ddl: string }> = [
    { name: 'excluded_keywords', ddl: 'ALTER TABLE `client_proposals` ADD `excluded_keywords` text' },
    { name: 'excluded_content_questions', ddl: 'ALTER TABLE `client_proposals` ADD `excluded_content_questions` text' },
    { name: 'slide_notes', ddl: 'ALTER TABLE `client_proposals` ADD `slide_notes` text' },
  ]

  for (const column of columns) {
    try {
      await db.run(sql.raw(column.ddl))
    } catch {
      // Column already exists — safe to ignore on re-runs.
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const columns = ['slide_notes', 'excluded_content_questions', 'excluded_keywords']
  for (const column of columns) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`client_proposals\` DROP COLUMN \`${column}\``))
    } catch {
      // SQLite/libSQL versions without DROP COLUMN or already-dropped columns.
    }
  }
}
