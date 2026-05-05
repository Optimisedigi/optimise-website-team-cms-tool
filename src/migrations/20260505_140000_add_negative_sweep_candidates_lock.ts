import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * The NegativeSweepCandidates collection was registered in payload.config.ts
 * but no migration added the `negative_sweep_candidates_id` column to
 * `payload_locked_documents_rels`. Payload generates a join query against
 * that table on every collection update; without this column the query fails
 * with "no such column: negative_sweep_candidates_id" and breaks unrelated
 * writes (e.g. pushing campaign budgets via /api/google-ads-budgets/[id]/push).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`negative_sweep_candidates_id\` integer;`,
    )
  } catch {
    /* column already exists */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // No-op. SQLite doesn't easily support dropping columns and removing this
  // would only re-introduce the bug.
}
