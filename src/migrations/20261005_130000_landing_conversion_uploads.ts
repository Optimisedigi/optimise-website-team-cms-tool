import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function addColumn(db: MigrateUpArgs["db"], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement));
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    if (error instanceof Error && /duplicate column name/i.test(`${error.message} ${cause}`)) return;
    throw error;
  }
}

/**
 * Server-side Google Ads conversions for landing-page leads.
 *
 * `landing_conversion_uploads` is the ledger (one row per ad click per
 * property) the daily sync dedupes against. `landing_properties.
 * google_ads_offline_conversion_action_id` names the UPLOAD_CLICKS conversion
 * action that receives them; blank means the property is not synced.
 *
 * Additive only. `down` drops the ledger table; the column stays so a
 * rollback cannot lose a configured action ID.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS \`landing_conversion_uploads\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`property_id\` integer NOT NULL,
    \`client_id\` integer NOT NULL,
    \`customer_id\` text NOT NULL,
    \`conversion_action_id\` text NOT NULL,
    \`transaction_id\` text NOT NULL,
    \`click_id_type\` text NOT NULL,
    \`lead_occurred_at\` text NOT NULL,
    \`event_ids\` text,
    \`status\` text NOT NULL,
    \`detail\` text,
    \`request_id\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`property_id\`) REFERENCES \`landing_properties\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `landing_conversion_uploads_property_idx` ON `landing_conversion_uploads` (`property_id`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `landing_conversion_uploads_client_idx` ON `landing_conversion_uploads` (`client_id`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `landing_conversion_uploads_transaction_id_idx` ON `landing_conversion_uploads` (`transaction_id`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `landing_conversion_uploads_lead_occurred_at_idx` ON `landing_conversion_uploads` (`lead_occurred_at`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `landing_conversion_uploads_status_idx` ON `landing_conversion_uploads` (`status`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `landing_conversion_uploads_updated_at_idx` ON `landing_conversion_uploads` (`updated_at`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `landing_conversion_uploads_created_at_idx` ON `landing_conversion_uploads` (`created_at`);"));
  await addColumn(db, "ALTER TABLE `landing_properties` ADD COLUMN `google_ads_offline_conversion_action_id` text");
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw("DROP TABLE IF EXISTS `landing_conversion_uploads`;"));
}
