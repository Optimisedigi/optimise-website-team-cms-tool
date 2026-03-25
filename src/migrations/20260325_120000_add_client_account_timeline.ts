import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_account_timeline\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`date\` text NOT NULL,
    \`service_area\` text DEFAULT 'google_ads',
    \`action_type\` text NOT NULL,
    \`description\` text NOT NULL,
    \`added_by\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_account_timeline_order_idx\` ON \`client_account_timeline\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_account_timeline_parent_id_idx\` ON \`client_account_timeline\` (\`_parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`client_account_timeline\`;`)
}
