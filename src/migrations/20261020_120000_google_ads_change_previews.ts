import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'
import { GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA } from '../lib/agents/optimate-google-ads/change-previews-schema'

// OptiMate preview-then-apply ledger for live Google Ads changes. Additive only
// (one new table). Keep in sync with addGoogleAdsChangePreviews() in
// src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [, statement] of GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA) {
    await db.run(sql.raw(statement))
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Additive; left in place on rollback so the record of applied changes is kept.
}
