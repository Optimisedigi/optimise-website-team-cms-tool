import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Landing property controls: per-property IP exclusions and a reporting
 * baseline date.
 *
 * `landing_properties_excluded_ips` mirrors the shape Payload generates for the
 * existing `landing_properties_allowed_origins` array, so the collection field
 * maps onto it without a schema push. Nothing here touches `landing_events`:
 * `event_type` is plain TEXT in SQLite, so the new `page_dwell` type needs no
 * column change — the enum lives in the Payload field options and in
 * LANDING_EVENT_TYPES, both of which are code.
 *
 * Reversible: `down` drops only what `up` added, and no event data is read or
 * written by either direction.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(`CREATE TABLE IF NOT EXISTS \`landing_properties_excluded_ips\` (
      \`_order\` integer NOT NULL, \`_parent_id\` integer NOT NULL, \`id\` text PRIMARY KEY NOT NULL,
      \`ip\` text NOT NULL, \`label\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`landing_properties\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );`),
  );
  await db.run(
    sql.raw(
      "CREATE INDEX IF NOT EXISTS `landing_properties_excluded_ips_order_idx` ON `landing_properties_excluded_ips` (`_order`);",
    ),
  );
  await db.run(
    sql.raw(
      "CREATE INDEX IF NOT EXISTS `landing_properties_excluded_ips_parent_id_idx` ON `landing_properties_excluded_ips` (`_parent_id`);",
    ),
  );

  try {
    await db.run(sql.raw("ALTER TABLE `landing_properties` ADD `data_start_date` text;"));
  } catch {
    // The column already exists in this environment.
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw("DROP TABLE IF EXISTS `landing_properties_excluded_ips`;"));
  try {
    await db.run(sql.raw("ALTER TABLE `landing_properties` DROP COLUMN `data_start_date`;"));
  } catch {
    // SQLite versions without DROP COLUMN, or databases without the column.
  }
}
