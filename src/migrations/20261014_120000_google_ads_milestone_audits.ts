import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { GOOGLE_ADS_MILESTONE_AUDITS_SCHEMA } from '../lib/google-ads-milestone-audits/schema'

// Google Ads milestone audits (1/3/6/9/12 months after Campaign start) plus the
// per-client on/off switch. Keep in sync with addGoogleAdsMilestoneAudits() in
// src/lib/run-migrations.ts (same statements via the shared schema list).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of GOOGLE_ADS_MILESTONE_AUDITS_SCHEMA) {
    try {
      await db.run(sql.raw(statement))
    } catch (error) {
      // Local databases may already have these via schema push.
      if (error instanceof Error && /duplicate column name|already exists/i.test(error.message)) continue
      throw error
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so milestone history is not lost.
}
