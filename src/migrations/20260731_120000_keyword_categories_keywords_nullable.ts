import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Drop the legacy NOT NULL constraint on
 * client_proposals_keyword_categories.keywords via a SQLite table rebuild.
 *
 * The keywords textarea is now optional (a category can be saved with just a
 * name and have keywords filled later via the "Search keywords for my
 * categories" flow). The old column was NOT NULL, so saving a category without
 * keywords failed with "NOT NULL constraint failed".
 */
async function keywordsColumnIsNotNull(db: MigrateUpArgs['db']): Promise<boolean> {
  const result: any = await db.run(sql.raw('PRAGMA table_info(`client_proposals_keyword_categories`)'))
  const rows: Array<Record<string, unknown>> = result?.rows ?? result ?? []
  const col = rows.find((r) => r.name === 'keywords')
  return !!col && Number(col.notnull) === 1
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  if (!(await keywordsColumnIsNotNull(db))) return

  await db.run(sql.raw('PRAGMA foreign_keys=OFF'))
  await db.run(
    sql.raw(
      'CREATE TABLE `client_proposals_keyword_categories__newkw` (' +
        '`_order` integer NOT NULL, `_parent_id` integer NOT NULL, ' +
        '`id` text PRIMARY KEY NOT NULL, `category_name` text NOT NULL, `keywords` text, ' +
        'FOREIGN KEY (`_parent_id`) REFERENCES `client_proposals`(`id`) ON UPDATE no action ON DELETE cascade)',
    ),
  )
  await db.run(
    sql.raw(
      'INSERT INTO `client_proposals_keyword_categories__newkw` (`_order`,`_parent_id`,`id`,`category_name`,`keywords`) ' +
        'SELECT `_order`,`_parent_id`,`id`,`category_name`,`keywords` FROM `client_proposals_keyword_categories`',
    ),
  )
  await db.run(sql.raw('DROP TABLE `client_proposals_keyword_categories`'))
  await db.run(
    sql.raw('ALTER TABLE `client_proposals_keyword_categories__newkw` RENAME TO `client_proposals_keyword_categories`'),
  )
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `client_proposals_keyword_categories_order_idx` ON `client_proposals_keyword_categories` (`_order`)',
    ),
  )
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `client_proposals_keyword_categories_parent_id_idx` ON `client_proposals_keyword_categories` (`_parent_id`)',
    ),
  )
  await db.run(sql.raw('PRAGMA foreign_keys=ON'))
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Re-add NOT NULL (backfill any NULLs to an empty string first so the rebuild succeeds).
  await db.run(
    sql.raw("UPDATE `client_proposals_keyword_categories` SET `keywords` = '' WHERE `keywords` IS NULL"),
  )
  await db.run(sql.raw('PRAGMA foreign_keys=OFF'))
  await db.run(
    sql.raw(
      'CREATE TABLE `client_proposals_keyword_categories__oldkw` (' +
        '`_order` integer NOT NULL, `_parent_id` integer NOT NULL, ' +
        '`id` text PRIMARY KEY NOT NULL, `category_name` text NOT NULL, `keywords` text NOT NULL, ' +
        'FOREIGN KEY (`_parent_id`) REFERENCES `client_proposals`(`id`) ON UPDATE no action ON DELETE cascade)',
    ),
  )
  await db.run(
    sql.raw(
      'INSERT INTO `client_proposals_keyword_categories__oldkw` (`_order`,`_parent_id`,`id`,`category_name`,`keywords`) ' +
        'SELECT `_order`,`_parent_id`,`id`,`category_name`,`keywords` FROM `client_proposals_keyword_categories`',
    ),
  )
  await db.run(sql.raw('DROP TABLE `client_proposals_keyword_categories`'))
  await db.run(
    sql.raw('ALTER TABLE `client_proposals_keyword_categories__oldkw` RENAME TO `client_proposals_keyword_categories`'),
  )
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `client_proposals_keyword_categories_order_idx` ON `client_proposals_keyword_categories` (`_order`)',
    ),
  )
  await db.run(
    sql.raw(
      'CREATE INDEX IF NOT EXISTS `client_proposals_keyword_categories_parent_id_idx` ON `client_proposals_keyword_categories` (`_parent_id`)',
    ),
  )
  await db.run(sql.raw('PRAGMA foreign_keys=ON'))
}
