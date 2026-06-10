import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function addClientColumn(db: MigrateUpArgs["db"], definition: string): Promise<void> {
  try {
    await db.run(sql.raw(`ALTER TABLE \`clients\` ADD ${definition};`));
  } catch {
    // Column may already exist on pushed/dev databases.
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addClientColumn(db, "`client_pulse_enabled` integer DEFAULT false");
  await addClientColumn(db, "`client_pulse_priority` text DEFAULT 'normal'");
  await addClientColumn(db, "`client_pulse_primary_target` text DEFAULT 'traffic'");
  await addClientColumn(db, "`client_pulse_target_label` text");
  await addClientColumn(db, "`client_pulse_target_value` numeric");
  await addClientColumn(db, "`client_pulse_target_unit` text DEFAULT 'custom'");
  await addClientColumn(db, "`client_pulse_target_direction` text DEFAULT 'increase'");
  await addClientColumn(db, "`client_pulse_comparison_window` text DEFAULT 'last_90_days'");
  await addClientColumn(db, "`client_pulse_neglect_warning_days` numeric DEFAULT 14");
  await addClientColumn(db, "`client_pulse_neglect_critical_days` numeric DEFAULT 30");
  await addClientColumn(db, "`client_pulse_notes` text");

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_client_pulse_services_tracked\` (
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`value\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_client_pulse_services_tracked_order_idx\` ON \`clients_client_pulse_services_tracked\` (\`order\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_client_pulse_services_tracked_parent_id_idx\` ON \`clients_client_pulse_services_tracked\` (\`parent_id\`);`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_client_pulse_analytics_metrics\` (
    \`order\` integer NOT NULL,
    \`parent_id\` integer NOT NULL,
    \`value\` text,
    \`id\` integer PRIMARY KEY NOT NULL,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_client_pulse_analytics_metrics_order_idx\` ON \`clients_client_pulse_analytics_metrics\` (\`order\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_client_pulse_analytics_metrics_parent_id_idx\` ON \`clients_client_pulse_analytics_metrics\` (\`parent_id\`);`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`clients_client_pulse_analytics_metrics\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`clients_client_pulse_services_tracked\`;`);
}
