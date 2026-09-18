import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Client Pulse tracked services had two values that render as the same "SEO"
 * pill: `organic` and `seo`. Clients with both ticked showed a duplicate pill.
 * `organic` is now the only SEO option, so fold legacy `seo` rows into it:
 * promote exactly one `seo` row per client that has no `organic` row, then drop
 * every remaining `seo` row. Promoting a single row matters because a client
 * could hold more than one `seo` row, and promoting them all would just swap a
 * duplicate "seo" for a duplicate "organic".
 *
 * Idempotent: after the sweep no `seo` rows remain, so re-running is a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql.raw(`
    UPDATE \`clients_client_pulse_services_tracked\`
    SET \`value\` = 'organic'
    WHERE \`id\` IN (
      SELECT MIN(\`seo\`.\`id\`)
      FROM \`clients_client_pulse_services_tracked\` AS \`seo\`
      WHERE \`seo\`.\`value\` = 'seo'
        AND \`seo\`.\`parent_id\` NOT IN (
          SELECT \`parent_id\`
          FROM \`clients_client_pulse_services_tracked\`
          WHERE \`value\` = 'organic'
        )
      GROUP BY \`seo\`.\`parent_id\`
    );
  `),
  )

  await db.run(
    sql.raw(`
    DELETE FROM \`clients_client_pulse_services_tracked\` WHERE \`value\` = 'seo';
  `),
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Forward-only: the original organic/seo split is not recoverable and the
  // duplicate option no longer exists in the collection config.
}
