import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Client Discovery Briefings — stores the structured questionnaire state
 * (matches `DEFAULT_STATE` in `public/client-discovery-briefing.html`) plus
 * a canonical rendered markdown blob. See
 * `src/collections/ClientDiscoveryBriefings.ts`.
 *
 * Adds:
 *  - `client_discovery_briefings` table.
 *  - Indexes on `client_id`, `client_proposal_id`, `created_at`, `updated_at`.
 *  - `payload_locked_documents_rels.client_discovery_briefings_id` FK column
 *    (mandatory per CLAUDE.md — missing it crashes record views).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`client_discovery_briefings\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text,
    \`data\` text,
    \`markdown\` text,
    \`client_id\` integer,
    \`client_proposal_id\` integer,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_discovery_briefings_client_idx\` ON \`client_discovery_briefings\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_discovery_briefings_proposal_idx\` ON \`client_discovery_briefings\` (\`client_proposal_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_discovery_briefings_created_at_idx\` ON \`client_discovery_briefings\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`client_discovery_briefings_updated_at_idx\` ON \`client_discovery_briefings\` (\`updated_at\`);`,
  );

  // payload_locked_documents_rels FK column — required for every new
  // collection or admin record-view crashes (see CLAUDE.md "Deployment
  // Gotchas").
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`client_discovery_briefings_id\` integer REFERENCES \`client_discovery_briefings\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`client_discovery_briefings\`;`);
  // SQLite DROP COLUMN support varies — safe to leave the locked_docs_rels column.
}
