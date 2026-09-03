import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`google_ads_automation_events\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer,
      \`customer_id\` text,
      \`change_date_time\` text,
      \`resource_name\` text NOT NULL,
      \`change_resource_type\` text,
      \`resource_change_operation\` text,
      \`client_type\` text,
      \`user_email\` text,
      \`campaign_id\` text,
      \`campaign_name\` text,
      \`changed_fields\` text,
      \`old_values\` text,
      \`new_values\` text,
      \`is_google_automated\` integer DEFAULT false,
      \`summary\` text,
      \`impact_spend_before\` numeric,
      \`impact_spend_after\` numeric,
      \`impact_conv_before\` numeric,
      \`impact_conv_after\` numeric,
      \`impact_computed_at\` text,
      \`review_status\` text DEFAULT 'unreviewed',
      \`related_approval_id\` integer,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
    )
  `)

  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`google_ads_automation_events_resource_name_idx\` ON \`google_ads_automation_events\` (\`resource_name\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_client_idx\` ON \`google_ads_automation_events\` (\`client_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_customer_id_idx\` ON \`google_ads_automation_events\` (\`customer_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_change_date_time_idx\` ON \`google_ads_automation_events\` (\`change_date_time\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_change_resource_type_idx\` ON \`google_ads_automation_events\` (\`change_resource_type\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_client_type_idx\` ON \`google_ads_automation_events\` (\`client_type\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_campaign_id_idx\` ON \`google_ads_automation_events\` (\`campaign_id\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_is_google_automated_idx\` ON \`google_ads_automation_events\` (\`is_google_automated\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_review_status_idx\` ON \`google_ads_automation_events\` (\`review_status\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_updated_at_idx\` ON \`google_ads_automation_events\` (\`updated_at\`)`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`google_ads_automation_events_created_at_idx\` ON \`google_ads_automation_events\` (\`created_at\`)`)

  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`google_ads_automation_events_id\` integer`)
  } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`google_ads_automation_events\``)
  try {
    await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` DROP COLUMN \`google_ads_automation_events_id\``)
  } catch { /* doesn't exist */ }
}
