import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`outcome_followups\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`comment\` text NOT NULL,
      \`by\` text,
      \`by_user_id\` text,
      \`at\` text,
      \`tagged_user_ids\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`monthly_keyword_selections_selections\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`outcome_followups_parent_idx\` ON \`outcome_followups\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`outcome_followups_order_idx\` ON \`outcome_followups\` (\`_order\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`outcome_followups\`;`)
}
