import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_client_pulse_dashboard_metrics\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`metric\` text NOT NULL,
    \`label\` text,
    \`enabled\` integer DEFAULT true,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_client_pulse_dashboard_metrics_order_idx\` ON \`clients_client_pulse_dashboard_metrics\` (\`_order\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_client_pulse_dashboard_metrics_parent_id_idx\` ON \`clients_client_pulse_dashboard_metrics\` (\`_parent_id\`);`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_analytics_snapshots\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`source\` text DEFAULT 'ga4' NOT NULL,
    \`date_range_label\` text NOT NULL,
    \`period_start\` text NOT NULL,
    \`period_end\` text NOT NULL,
    \`sessions\` numeric,
    \`key_events\` numeric,
    \`conversions\` numeric,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_analytics_snapshots_client_idx\` ON \`client_analytics_snapshots\` (\`client_id\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_analytics_snapshots_label_idx\` ON \`client_analytics_snapshots\` (\`date_range_label\`);`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`client_analytics_snapshots\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`clients_client_pulse_dashboard_metrics\`;`);
}
