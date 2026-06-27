import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function tryRun(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch {
    // Column/index already exists in this environment.
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await tryRun(db, 'ALTER TABLE `client_wishlist_items` ADD `website` text')
  await tryRun(db, 'ALTER TABLE `client_wishlist_items` ADD `why` text')
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('ALTER TABLE `client_wishlist_items` DROP COLUMN `website`;'))
  await db.run(sql.raw('ALTER TABLE `client_wishlist_items` DROP COLUMN `why`;'))
}
