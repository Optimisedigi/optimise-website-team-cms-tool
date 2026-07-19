import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function errorChainMessage(error: unknown): string {
  const messages: string[] = []
  let current: unknown = error
  while (current) {
    messages.push(current instanceof Error ? current.message : String(current))
    current =
      typeof current === 'object' && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : undefined
  }
  return messages.join('\n')
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw('ALTER TABLE `google_ads_audit_snapshots` ADD `account_name` text'))
  } catch (error) {
    if (!/duplicate column|already exists/i.test(errorChainMessage(error))) throw error
  }

  await db.run(
    sql.raw(
      "CREATE UNIQUE INDEX IF NOT EXISTS `google_ads_audit_snapshots_one_active_idx` ON `google_ads_audit_snapshots` (`audit_id`) WHERE `status` IN ('pending', 'running')",
    ),
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('DROP INDEX IF EXISTS `google_ads_audit_snapshots_one_active_idx`'))
  try {
    await db.run(sql.raw('ALTER TABLE `google_ads_audit_snapshots` DROP COLUMN `account_name`'))
  } catch (error) {
    if (!/no such column|no such table/i.test(errorChainMessage(error))) throw error
  }
}
