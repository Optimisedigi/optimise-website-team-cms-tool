import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function tryRun(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch {
    // Column/index already exists in this environment.
  }
}

// Manual competitor SERP metrics on client_proposals_competitors.
// The collection config selects these columns on every read; without them
// Payload's find query fails with "no such column: serp_average_position",
// 500-ing the proposal read so the admin edit view renders blank.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await tryRun(db, 'ALTER TABLE `client_proposals_competitors` ADD `serp_average_position` numeric')
  await tryRun(db, 'ALTER TABLE `client_proposals_competitors` ADD `serp_keywords_found` numeric')
  await tryRun(db, 'ALTER TABLE `client_proposals_competitors` ADD `serp_keyword_positions` text')
  await tryRun(db, "ALTER TABLE `client_proposals_competitors` ADD `serp_metrics_status` text DEFAULT 'idle'")
  await tryRun(db, 'ALTER TABLE `client_proposals_competitors` ADD `serp_metrics_error` text')
  await tryRun(db, 'ALTER TABLE `client_proposals_competitors` ADD `serp_metrics_updated_at` text')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('ALTER TABLE `client_proposals_competitors` DROP COLUMN `serp_average_position`;'))
  await db.run(sql.raw('ALTER TABLE `client_proposals_competitors` DROP COLUMN `serp_keywords_found`;'))
  await db.run(sql.raw('ALTER TABLE `client_proposals_competitors` DROP COLUMN `serp_keyword_positions`;'))
  await db.run(sql.raw('ALTER TABLE `client_proposals_competitors` DROP COLUMN `serp_metrics_status`;'))
  await db.run(sql.raw('ALTER TABLE `client_proposals_competitors` DROP COLUMN `serp_metrics_error`;'))
  await db.run(sql.raw('ALTER TABLE `client_proposals_competitors` DROP COLUMN `serp_metrics_updated_at`;'))
}
