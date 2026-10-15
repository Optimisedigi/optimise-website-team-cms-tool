import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

// The Payload 3.90 migration added `media._object_key`, but Payload names the
// `_objectKey` field's column `_objectkey`, so every media insert failed with
// "table media has no column named _objectkey". Rename (keeping any values) or
// add the column. Keep in sync with addPayload390Columns() in src/lib/run-migrations.ts.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columns = await db.all<{ name: string }>(sql.raw('PRAGMA table_info(`media`)'))
  const names = new Set(columns.map((column) => column.name))
  if (names.has('_objectkey')) return
  if (names.has('_object_key')) {
    await db.run(sql.raw('ALTER TABLE `media` RENAME COLUMN `_object_key` TO `_objectkey`'))
    return
  }
  await db.run(sql.raw('ALTER TABLE `media` ADD `_objectkey` text'))
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only: the old name breaks every media insert on Payload 3.90.
}
