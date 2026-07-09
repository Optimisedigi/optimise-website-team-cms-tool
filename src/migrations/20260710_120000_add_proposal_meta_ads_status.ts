import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function tryRun(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch {
    // Column already exists in this environment.
  }
}

// Meta Ad Library section status on client_proposals.
// The audit pipeline no longer blocks on the (slow, flaky) Meta Ad Library
// scrape — it records the outcome here instead so the section can be re-run in
// isolation via POST /api/proposals/[id]/refresh-meta-ads. The collection config
// selects these columns on every read; without them Payload's find query fails
// with "no such column: meta_ads_status" and 500s the proposal read.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await tryRun(db, "ALTER TABLE `client_proposals` ADD `meta_ads_status` text DEFAULT 'idle'")
  await tryRun(db, 'ALTER TABLE `client_proposals` ADD `meta_ads_error` text')
  await tryRun(db, 'ALTER TABLE `client_proposals` ADD `meta_ads_updated_at` text')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('ALTER TABLE `client_proposals` DROP COLUMN `meta_ads_status`;'))
  await db.run(sql.raw('ALTER TABLE `client_proposals` DROP COLUMN `meta_ads_error`;'))
  await db.run(sql.raw('ALTER TABLE `client_proposals` DROP COLUMN `meta_ads_updated_at`;'))
}
