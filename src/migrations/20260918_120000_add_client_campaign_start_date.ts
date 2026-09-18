import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD COLUMN \`campaign_start_date\` text`)
  } catch (error) {
    // Local development may already have this column because schema push is enabled there.
    if (error instanceof Error && /duplicate column name/i.test(error.message)) return
    throw error
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep the nullable date on rollback so reverting code cannot destroy user-entered data.
}
