import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Editable synonym rules for Match Type Violations confidence scoring.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`match_type_synonym_rules\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`term_a\` text NOT NULL,
    \`term_b\` text NOT NULL,
    \`context_terms\` text,
    \`active\` integer DEFAULT true,
    \`source_search_term\` text,
    \`source_triggering_keyword\` text,
    \`notes\` text,
    \`created_by_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`match_type_synonym_rules_created_by_idx\` ON \`match_type_synonym_rules\` (\`created_by_id\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`match_type_synonym_rules_updated_at_idx\` ON \`match_type_synonym_rules\` (\`updated_at\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`match_type_synonym_rules_created_at_idx\` ON \`match_type_synonym_rules\` (\`created_at\`);`);

  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`match_type_synonym_rules_id\` integer REFERENCES \`match_type_synonym_rules\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`match_type_synonym_rules\`;`);
}
