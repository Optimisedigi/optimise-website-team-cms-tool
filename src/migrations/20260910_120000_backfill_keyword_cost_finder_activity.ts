import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

const NOTIFICATION_KIND = 'google-ads-keyword-cost-finder-usage'
const ACTIVITY_TYPE = 'google_ads_keyword_cost_finder_used'
const ACTIVITY_LIST_URL =
  '/admin/collections/activity-log?where[type][equals]=google_ads_keyword_cost_finder_used'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(`
    INSERT INTO \`activity_log\` (
      \`type\`, \`title\`, \`description\`, \`target_url\`, \`updated_at\`, \`created_at\`
    )
    SELECT
      '${ACTIVITY_TYPE}',
      \`notifications\`.\`title\`,
      \`notifications\`.\`body\`,
      '${ACTIVITY_LIST_URL}&backfillNotificationId=' || \`notifications\`.\`id\`,
      \`notifications\`.\`created_at\`,
      \`notifications\`.\`created_at\`
    FROM \`notifications\`
    WHERE \`notifications\`.\`kind\` = '${NOTIFICATION_KIND}'
      AND (
        \`notifications\`.\`url\` IS NULL
        OR \`notifications\`.\`url\` NOT LIKE '/admin/collections/activity-log/%'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM \`activity_log\`
        WHERE \`activity_log\`.\`type\` = '${ACTIVITY_TYPE}'
          AND \`activity_log\`.\`target_url\` = '${ACTIVITY_LIST_URL}&backfillNotificationId=' || \`notifications\`.\`id\`
      );
  `),
  )

  await db.run(
    sql.raw(`
    UPDATE \`notifications\`
    SET \`url\` = '/admin/collections/activity-log/' || (
      SELECT \`activity_log\`.\`id\`
      FROM \`activity_log\`
      WHERE \`activity_log\`.\`type\` = '${ACTIVITY_TYPE}'
        AND \`activity_log\`.\`target_url\` = '${ACTIVITY_LIST_URL}&backfillNotificationId=' || \`notifications\`.\`id\`
      LIMIT 1
    )
    WHERE \`notifications\`.\`kind\` = '${NOTIFICATION_KIND}'
      AND EXISTS (
        SELECT 1
        FROM \`activity_log\`
        WHERE \`activity_log\`.\`type\` = '${ACTIVITY_TYPE}'
          AND \`activity_log\`.\`target_url\` = '${ACTIVITY_LIST_URL}&backfillNotificationId=' || \`notifications\`.\`id\`
      );
  `),
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Data backfills are intentionally forward-only: deleting activity history is unsafe.
}
