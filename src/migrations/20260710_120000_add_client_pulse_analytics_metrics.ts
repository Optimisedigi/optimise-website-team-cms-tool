import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
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
}
