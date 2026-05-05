import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Payload `array` field on Clients → child table holding rows per category.
 * Lets the agency define their own conversion-action buckets per client
 * (Phone Calls, Form Submits, Email Clicks, Get Directions, etc.) instead
 * of the previous fixed phone/form pair.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`clients_conversion_action_categories\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text NOT NULL,
    \`color\` text DEFAULT 'sky',
    \`actions\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_conversion_action_categories_order_idx\` ON \`clients_conversion_action_categories\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_conversion_action_categories_parent_idx\` ON \`clients_conversion_action_categories\` (\`_parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`clients_conversion_action_categories\`;`)
}
