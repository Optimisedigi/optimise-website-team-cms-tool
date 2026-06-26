import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

async function tryRun(db: MigrateUpArgs['db'], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement))
  } catch {
    // Column/index already exists or the optional Payload table is not present in this environment.
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "client_wishlist_items" (
      "id" integer PRIMARY KEY NOT NULL,
      "ideal_client" text NOT NULL,
      "added_by_id" integer,
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY ("added_by_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null
    );
  `))

  await tryRun(db, 'ALTER TABLE `client_wishlist_items` ADD `ideal_client` text')
  await tryRun(db, 'ALTER TABLE `client_wishlist_items` ADD `added_by_id` integer REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null')
  await tryRun(db, 'ALTER TABLE `client_wishlist_items` ADD `updated_at` text')
  await tryRun(db, 'ALTER TABLE `client_wishlist_items` ADD `created_at` text')

  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_wishlist_items_added_by_idx` ON `client_wishlist_items` (`added_by_id`)'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_wishlist_items_updated_at_idx` ON `client_wishlist_items` (`updated_at`)'))
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS `client_wishlist_items_created_at_idx` ON `client_wishlist_items` (`created_at`)'))

  await tryRun(
    db,
    'ALTER TABLE `payload_locked_documents_rels` ADD `client_wishlist_items_id` integer REFERENCES `client_wishlist_items`(`id`) ON UPDATE no action ON DELETE cascade;',
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('DROP TABLE IF EXISTS `client_wishlist_items`;'))
}
