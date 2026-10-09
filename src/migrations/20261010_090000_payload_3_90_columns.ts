import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

// Payload 3.90 (security upgrade, 2026-10-10) adds two framework-owned columns:
//   users.reset_password_requested_at  (password-reset throttling)
//   media._object_key                  (cloud-storage object key)
// Production does not auto-push schema, and Payload selects every column on
// these tables, so without them the admin login and media list break.
// Keep in sync with addPayload390Columns() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const statement of [
    sql`ALTER TABLE \`users\` ADD COLUMN \`reset_password_requested_at\` text`,
    sql`ALTER TABLE \`media\` ADD COLUMN \`_object_key\` text`,
  ]) {
    try {
      await db.run(statement)
    } catch (error) {
      // Local development may already have the column because schema push is enabled there.
      if (error instanceof Error && /duplicate column name/i.test(error.message)) continue
      throw error
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Keep the nullable columns on rollback; dropping them would break a still-deployed 3.90 build.
}
