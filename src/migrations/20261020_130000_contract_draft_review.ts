import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { CONTRACT_REVIEW_SCHEMA } from '../lib/contract-review-schema'

// Contract draft review: account manager contact, review link, and the
// reviewer's inline comments. Additive only (five nullable columns, one new
// table). Keep in sync with addContractDraftReview() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of CONTRACT_REVIEW_SCHEMA) {
    try {
      await db.run(sql.raw(statement))
    } catch (e) {
      // ALTER TABLE ADD has no IF NOT EXISTS in SQLite; a re-run is a no-op.
      if (!(e instanceof Error && e.message.includes('duplicate column'))) throw e
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so reviewer comments are kept.
}
