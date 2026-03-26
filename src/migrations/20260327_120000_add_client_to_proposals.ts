import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`client_proposals\` ADD COLUMN \`client_id\` integer REFERENCES \`clients\`(\`id\`) ON DELETE set null;`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_proposals_client_idx\` ON \`client_proposals\` (\`client_id\`);`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite doesn't support DROP COLUMN in older versions; this is best-effort
  await db.run(sql`DROP INDEX IF EXISTS \`client_proposals_client_idx\`;`)
}
