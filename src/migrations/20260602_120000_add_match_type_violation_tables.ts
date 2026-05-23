import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Match-type violation monitoring tables — backs the `Match Type Violation
 * Candidates` review list and the `Match Type Sync State` per-client cursor.
 *
 * See `src/collections/MatchTypeViolationCandidates.ts` and
 * `src/collections/MatchTypeSyncState.ts`.
 *
 * Adds:
 *  - `match_type_violation_candidates` table + indexes on `client_id`, `status`,
 *    `assigned_list_id`, `approved_by_id`, `created_at`, `updated_at`.
 *  - `match_type_sync_state` table + unique index on `client_id`.
 *  - `payload_locked_documents_rels.match_type_violation_candidates_id` and
 *    `payload_locked_documents_rels.match_type_sync_state_id` FK columns
 *    (mandatory per CLAUDE.md — missing them crashes record views, and a
 *    missing referenced table makes the admin go completely blank).
 *
 * This migration is the *table-creation* counterpart to
 * `20260531_120000_sync_locked_docs_rels.ts`, which only adds the FK columns
 * (and silently no-ops if the referenced tables don't exist yet).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // -------- match_type_violation_candidates --------------------------------
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`match_type_violation_candidates\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`search_term\` text NOT NULL,
    \`triggering_keyword\` text NOT NULL,
    \`campaign_name\` text,
    \`ad_group_name\` text,
    \`match_type\` text NOT NULL,
    \`violation_type\` text NOT NULL,
    \`impressions\` numeric DEFAULT 0,
    \`clicks\` numeric DEFAULT 0,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`assigned_list_id\` integer,
    \`approved_at\` text,
    \`rejected_at\` text,
    \`approved_by_id\` integer,
    \`last_seen_at\` text NOT NULL,
    \`first_seen_at\` text NOT NULL,
    \`run_date\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`assigned_list_id\`) REFERENCES \`negative_keyword_lists\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`approved_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`);

  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`match_type_violation_candidates_client_idx\` ON \`match_type_violation_candidates\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`match_type_violation_candidates_status_idx\` ON \`match_type_violation_candidates\` (\`status\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`match_type_violation_candidates_assigned_list_idx\` ON \`match_type_violation_candidates\` (\`assigned_list_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`match_type_violation_candidates_approved_by_idx\` ON \`match_type_violation_candidates\` (\`approved_by_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`match_type_violation_candidates_created_at_idx\` ON \`match_type_violation_candidates\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`match_type_violation_candidates_updated_at_idx\` ON \`match_type_violation_candidates\` (\`updated_at\`);`,
  );

  // -------- match_type_sync_state -----------------------------------------
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`match_type_sync_state\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`last_run_at\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`);

  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS \`match_type_sync_state_client_idx\` ON \`match_type_sync_state\` (\`client_id\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`match_type_sync_state_created_at_idx\` ON \`match_type_sync_state\` (\`created_at\`);`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`match_type_sync_state_updated_at_idx\` ON \`match_type_sync_state\` (\`updated_at\`);`,
  );

  // -------- payload_locked_documents_rels FK columns -----------------------
  // Idempotent: the parallel 20260531 sync migration may already have added
  // these (it try/catches silently). We repeat them here so this single
  // migration is self-sufficient when applied to a fresh database.
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`match_type_violation_candidates_id\` integer REFERENCES \`match_type_violation_candidates\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`match_type_sync_state_id\` integer REFERENCES \`match_type_sync_state\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`match_type_violation_candidates\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`match_type_sync_state\`;`);
  // SQLite DROP COLUMN support varies — safe to leave the locked_docs_rels columns.
}
