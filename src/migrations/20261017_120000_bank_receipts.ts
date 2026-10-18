import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { BANK_RECEIPTS_SCHEMA } from '../lib/finance/bank-receipts-schema'

// Bank receipts (money in from bank statement CSVs) for the Sales vs Costs view.
// Additive only. Keep in sync with addBankReceipts() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of BANK_RECEIPTS_SCHEMA) {
    await db.run(sql.raw(statement))
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so imported receipts are not lost.
}
