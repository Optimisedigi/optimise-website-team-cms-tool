import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Drop old base64 text column for agency signature
  await db.run(sql`ALTER TABLE \`contracts\` DROP COLUMN \`agency_signature\`;`)

  // Add new upload FK column for agency signature (references media)
  await db.run(sql`ALTER TABLE \`contracts\` ADD \`agency_signature_id\` integer REFERENCES \`media\`(\`id\`) ON DELETE set null;`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contracts_agency_signature_idx\` ON \`contracts\` (\`agency_signature_id\`);`)

  // Add isTemplate checkbox
  await db.run(sql`ALTER TABLE \`contracts\` ADD \`is_template\` integer DEFAULT 0;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`contracts\` DROP COLUMN \`agency_signature_id\`;`)
  await db.run(sql`ALTER TABLE \`contracts\` DROP COLUMN \`is_template\`;`)
  await db.run(sql`ALTER TABLE \`contracts\` ADD \`agency_signature\` text;`)
}
