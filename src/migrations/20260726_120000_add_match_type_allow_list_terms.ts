import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Editable allow-list terms for Match Type Violations dictionary scoring.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`match_type_allow_list_terms\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`term\` text NOT NULL,
    \`category\` text DEFAULT 'acronym' NOT NULL,
    \`active\` integer DEFAULT true,
    \`notes\` text,
    \`source_search_term\` text,
    \`source_triggering_keyword\` text,
    \`created_by_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`match_type_allow_list_terms_term_idx\` ON \`match_type_allow_list_terms\` (\`term\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`match_type_allow_list_terms_created_by_idx\` ON \`match_type_allow_list_terms\` (\`created_by_id\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`match_type_allow_list_terms_updated_at_idx\` ON \`match_type_allow_list_terms\` (\`updated_at\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`match_type_allow_list_terms_created_at_idx\` ON \`match_type_allow_list_terms\` (\`created_at\`);`);

  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`match_type_allow_list_terms_id\` integer REFERENCES \`match_type_allow_list_terms\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`match_type_allow_list_terms\`;`);
}
