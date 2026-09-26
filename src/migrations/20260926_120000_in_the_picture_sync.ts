import { sql, type MigrateUpArgs, type MigrateDownArgs } from '@payloadcms/db-sqlite'
import { inThePictureSchema } from '../lib/in-the-picture/schema'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const [label, statement] of inThePictureSchema) {
    try { await db.run(sql.raw(statement)) }
    catch (error) {
      if (statement.startsWith('ALTER TABLE') && error instanceof Error && error.message.includes('duplicate column name')) continue
      throw new Error(`In The Picture schema ${label} failed`, { cause: error })
    }
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only: blog ideas and unsent tombstones are user content, never drop them.
}
