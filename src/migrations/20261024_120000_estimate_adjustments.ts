import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { ESTIMATE_ADJUSTMENTS_SCHEMA } from '../lib/finance/estimate-adjustments-schema'

// Manual estimated invoices/costs for the Costs page year-end estimate.
// Additive only. Keep in sync with addEstimateAdjustments() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of ESTIMATE_ADJUSTMENTS_SCHEMA) {
    await db.run(sql.raw(statement))
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so entered estimates are not lost.
}
