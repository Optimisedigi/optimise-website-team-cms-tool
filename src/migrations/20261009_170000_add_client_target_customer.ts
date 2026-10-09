import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

// Business tab "Target customer" on clients, read by GET /api/optimate/clients.
// Keep in sync with addClientTargetCustomer() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD COLUMN \`target_customer\` text`)
  } catch (error) {
    // Local development may already have this column because schema push is enabled there.
    if (error instanceof Error && /duplicate column name/i.test(error.message)) return
    throw error
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep the nullable column on rollback so reverting code cannot destroy user-entered data.
}
