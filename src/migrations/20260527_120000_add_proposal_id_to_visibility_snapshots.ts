import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the missing `proposal_id` FK column + index to both
 * `ai_visibility_snapshots` and `serp_displacement_snapshots`.
 *
 * Background: both collection configs declare a `proposal` relationship to
 * client-proposals, but the original create-table migrations
 * (20260420_120000 and 20260420_130000) shipped without the matching column.
 * The mismatch is harmless until something tries to filter by `proposal` —
 * the convert-to-client hook in ClientProposals.ts does exactly that when
 * re-linking pre-conversion snapshots to the new client, which 500s with
 * `no such column: ai_visibility_snapshots.proposal_id`.
 *
 * Idempotent — the ALTER is wrapped in try/catch so re-runs on already-
 * migrated DBs are a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`ai_visibility_snapshots\` ADD \`proposal_id\` integer REFERENCES \`client_proposals\`(\`id\`) ON DELETE set null;`,
    );
  } catch {
    // Column may already exist.
  }
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`ai_visibility_snapshots_proposal_idx\` ON \`ai_visibility_snapshots\` (\`proposal_id\`);`,
    );
  } catch {
    // Index may already exist.
  }

  try {
    await db.run(
      sql`ALTER TABLE \`serp_displacement_snapshots\` ADD \`proposal_id\` integer REFERENCES \`client_proposals\`(\`id\`) ON DELETE set null;`,
    );
  } catch {
    // Column may already exist.
  }
  try {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_snapshots_proposal_idx\` ON \`serp_displacement_snapshots\` (\`proposal_id\`);`,
    );
  } catch {
    // Index may already exist.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Optional column; SQLite DROP COLUMN support varies. Leave in place on rollback.
}
