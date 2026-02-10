import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`clients_competitors\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`website_url\` text,
  	\`google_maps_url\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`clients_competitors_order_idx\` ON \`clients_competitors\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`clients_competitors_parent_id_idx\` ON \`clients_competitors\` (\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`clients\` ADD \`business_type\` text;`)
  await db.run(sql`ALTER TABLE \`clients\` ADD \`target_location\` text;`)
  await db.run(sql`ALTER TABLE \`clients\` ADD \`client_goals\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`clients_competitors\`;`)
  await db.run(sql`ALTER TABLE \`clients\` DROP COLUMN \`business_type\`;`)
  await db.run(sql`ALTER TABLE \`clients\` DROP COLUMN \`target_location\`;`)
  await db.run(sql`ALTER TABLE \`clients\` DROP COLUMN \`client_goals\`;`)
}
