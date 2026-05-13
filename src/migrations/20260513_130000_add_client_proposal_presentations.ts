import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_proposals_presentations\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`deck_slug\` text NOT NULL,
    \`presented_on\` text,
    \`kind\` text DEFAULT 'deck',
    \`is_public\` integer DEFAULT true,
    \`notes\` text,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_proposals_presentations_order_idx\` ON \`client_proposals_presentations\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_proposals_presentations_parent_id_idx\` ON \`client_proposals_presentations\` (\`_parent_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`client_proposals_presentations\`;`)
}
