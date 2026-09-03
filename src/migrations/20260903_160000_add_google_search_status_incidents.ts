import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_search_status_incidents\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`incident_id\` text NOT NULL,
      \`title\` text NOT NULL,
      \`kind\` text DEFAULT 'other' NOT NULL,
      \`begin\` text,
      \`end\` text,
      \`modified\` text,
      \`status_impact\` text,
      \`severity\` text,
      \`service_name\` text,
      \`latest_update\` text,
      \`source_uri\` text,
      \`notified_at\` text,
      \`raw\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
    )
  `)

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`google_search_status_incidents_incident_id_idx\` ON \`google_search_status_incidents\` (\`incident_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_search_status_incidents_kind_idx\` ON \`google_search_status_incidents\` (\`kind\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_search_status_incidents_begin_idx\` ON \`google_search_status_incidents\` (\`begin\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_search_status_incidents_updated_at_idx\` ON \`google_search_status_incidents\` (\`updated_at\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_search_status_incidents_created_at_idx\` ON \`google_search_status_incidents\` (\`created_at\`)`)

  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_search_status_incidents_id\` integer`)
  } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`google_search_status_incidents\``)
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`google_search_status_incidents_id\``)
  } catch { /* doesn't exist */ }
}
