import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the `agent_memory` and `agent_soul` tables that back the lazy-loaded
 * memory + soul system inspired by Pocket Agent. Also registers FK columns
 * on payload_locked_documents_rels so admin record views don't crash.
 *
 * Idempotent: every column / index add is wrapped so re-running on a DB
 * that already has the schema (e.g. dev push:true) is a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── agent_memory ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`agent_memory\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`scope\` text NOT NULL DEFAULT 'client',
    \`client_id\` integer,
    \`category\` text NOT NULL,
    \`subject\` text NOT NULL,
    \`content\` text NOT NULL,
    \`importance\` integer DEFAULT 50,
    \`last_accessed_at\` text,
    \`created_by_id\` integer,
    \`agent_run_id\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_memory_scope_idx\` ON \`agent_memory\` (\`scope\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_memory_client_idx\` ON \`agent_memory\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_memory_subject_idx\` ON \`agent_memory\` (\`subject\`);`,
  );
  // Composite for the upsert path: (scope, client_id, subject) is the
  // de-dupe key the remember tool uses.
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_memory_dedupe_idx\` ON \`agent_memory\` (\`scope\`, \`client_id\`, \`subject\`);`,
  );
  // memory_search ranks by importance DESC, then last_accessed_at DESC.
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`agent_memory_importance_idx\` ON \`agent_memory\` (\`importance\`);`,
  );

  // ── agent_soul ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`agent_soul\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`aspect\` text NOT NULL,
    \`content\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`);
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS \`agent_soul_aspect_idx\` ON \`agent_soul\` (\`aspect\`);`,
  );

  // ── payload_locked_documents_rels FK columns ──
  for (const col of ["agent_memory_id", "agent_soul_id"]) {
    try {
      const fkTable = col.replace(/_id$/, "");
      await db.run(
        sql.raw(
          `ALTER TABLE \`payload_locked_documents_rels\` ADD \`${col}\` integer REFERENCES \`${fkTable}\`(\`id\`) ON DELETE CASCADE;`,
        ),
      );
    } catch {
      /* column already present */
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite drop column needs a table rebuild; not worth the complexity for a
  // down path nobody runs in production. We drop the two new tables only.
  await db.run(sql`DROP TABLE IF EXISTS \`agent_soul\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`agent_memory\`;`);
}
