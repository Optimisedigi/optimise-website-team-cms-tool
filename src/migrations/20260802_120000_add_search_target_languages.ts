import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function tryRun(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch {
    // Safe for databases where Payload push already added the column.
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await tryRun(db, 'ALTER TABLE `client_proposals` ADD `search_language` text')
  await tryRun(db, 'ALTER TABLE `seo_audit_proposals` ADD `search_language` text')
  await tryRun(db, 'ALTER TABLE `google_ads_audits` ADD `proposal_target_location` text')
  await tryRun(db, 'ALTER TABLE `google_ads_audits` ADD `proposal_search_language` text')

  await db.run(sql.raw("UPDATE `client_proposals` SET `target_location` = 'vn' WHERE lower(trim(`target_location`)) IN ('vietnam', 'viet nam')"))
  await db.run(sql.raw("UPDATE `seo_audit_proposals` SET `location` = 'vn' WHERE lower(trim(`location`)) IN ('vietnam', 'viet nam')"))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await tryRun(db, 'ALTER TABLE `client_proposals` DROP COLUMN `search_language`')
  await tryRun(db, 'ALTER TABLE `seo_audit_proposals` DROP COLUMN `search_language`')
  await tryRun(db, 'ALTER TABLE `google_ads_audits` DROP COLUMN `proposal_target_location`')
  await tryRun(db, 'ALTER TABLE `google_ads_audits` DROP COLUMN `proposal_search_language`')
}
