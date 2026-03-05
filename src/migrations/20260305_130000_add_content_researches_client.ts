import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Add client relationship to content_researches
  try {
    await db.run(sql`ALTER TABLE \`content_researches\` ADD \`client_id\` integer REFERENCES \`clients\`(\`id\`) ON DELETE set null;`)
  } catch { /* column may already exist */ }

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`content_researches_client_idx\` ON \`content_researches\` (\`client_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite doesn't support DROP COLUMN in older versions; no-op
}
