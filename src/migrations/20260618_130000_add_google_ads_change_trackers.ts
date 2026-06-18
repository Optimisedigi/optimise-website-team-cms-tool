import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_change_trackers\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`name\` text DEFAULT 'Default Google Ads Change Tracker' NOT NULL,
      \`workspace_key\` text DEFAULT 'default' NOT NULL,
      \`view\` text DEFAULT 'daily' NOT NULL,
      \`graphs\` text NOT NULL,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )
  `)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_change_trackers_name_idx\` ON \`google_ads_change_trackers\` (\`name\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_change_trackers_workspace_key_idx\` ON \`google_ads_change_trackers\` (\`workspace_key\`)`)

  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_change_trackers_id\` integer`)
  } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_change_trackers\``)
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`google_ads_change_trackers_id\``)
  } catch { /* doesn't exist */ }
}
