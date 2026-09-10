import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import { up } from '@/migrations/20260910_120000_backfill_keyword_cost_finder_activity'

describe('keyword cost finder activity backfill', () => {
  it('creates one activity per historical notification and updates each link idempotently', async () => {
    const client = createClient({ url: ':memory:' })
    await client.batch(
      [
        'CREATE TABLE `notifications` (`id` integer PRIMARY KEY, `kind` text NOT NULL, `title` text NOT NULL, `body` text, `url` text, `created_at` text NOT NULL)',
        'CREATE TABLE `activity_log` (`id` integer PRIMARY KEY, `type` text NOT NULL, `title` text NOT NULL, `description` text, `target_url` text, `updated_at` text NOT NULL, `created_at` text NOT NULL)',
        "INSERT INTO `notifications` VALUES (1, 'google-ads-keyword-cost-finder-usage', 'First', 'alpha', '/admin/collections/notifications', '2026-09-01T00:00:00.000Z')",
        "INSERT INTO `notifications` VALUES (2, 'google-ads-keyword-cost-finder-usage', 'Second', 'beta', '/admin/collections/notifications', '2026-09-01T00:00:00.000Z')",
        "INSERT INTO `notifications` VALUES (3, 'other', 'Other', 'ignored', '/admin/collections/notifications', '2026-09-01T00:00:00.000Z')",
      ],
      'write',
    )
    const db = drizzle(client)

    await up({ db } as never)
    await up({ db } as never)

    const activities = await client.execute(
      "SELECT `id`, `description` FROM `activity_log` WHERE `type` = 'google_ads_keyword_cost_finder_used' ORDER BY `id`",
    )
    const notifications = await client.execute(
      "SELECT `id`, `url` FROM `notifications` WHERE `kind` = 'google-ads-keyword-cost-finder-usage' ORDER BY `id`",
    )

    expect(activities.rows.map((row) => row.description)).toEqual(['alpha', 'beta'])
    expect(notifications.rows).toEqual([
      { id: 1, url: `/admin/collections/activity-log/${activities.rows[0].id}` },
      { id: 2, url: `/admin/collections/activity-log/${activities.rows[1].id}` },
    ])
  })
})
