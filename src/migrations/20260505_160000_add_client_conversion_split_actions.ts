import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Two free-text columns on `clients` for the dashboard Conversion Split
  // categorisation. Newline-separated lists of conversion-action names.
  for (const col of ["phone_call_conversion_actions", "form_submit_conversion_actions"]) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`clients\` ADD \`${col}\` text;`))
    } catch { /* column may already exist */ }
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite DROP COLUMN support varies — leave columns in place on rollback.
}
