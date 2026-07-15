import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function tryRun(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch {
    // Column already exists in this environment.
  }
}

// Durable resumable Meta Ad Library job state on client_proposals.
// The refresh worker processes at most two competitors per Vercel invocation and
// persists the cursor/counts/lease here so a killed invocation can resume instead
// of losing all work. The collection config selects this column on every read;
// without it Payload's find query fails with "no such column:
// meta_ads_job_state" and 500s the proposal read.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await tryRun(db, 'ALTER TABLE `client_proposals` ADD `meta_ads_job_state` text')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('ALTER TABLE `client_proposals` DROP COLUMN `meta_ads_job_state`;'))
}
