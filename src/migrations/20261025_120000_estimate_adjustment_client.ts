import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { ESTIMATE_ADJUSTMENTS_CLIENT_SCHEMA } from '../lib/finance/estimate-adjustments-schema'

// Client column for estimate-only retainer overrides. Additive only.
// Keep in sync with addEstimateAdjustments() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of ESTIMATE_ADJUSTMENTS_CLIENT_SCHEMA) {
    try {
      await db.run(sql.raw(statement))
    } catch (error) {
      // Local databases may already have it via schema push.
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
      if (error instanceof Error && /duplicate column name|already exists/i.test(`${error.message} ${cause}`)) continue
      throw error
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so overrides are not lost.
}
