import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Meeting schedulers can now be linked to a client OR a prospect (Client
 * Proposal). Payload stores that two-collection `client` relationship in
 * `meeting_schedulers_rels` instead of `meeting_schedulers.client_id`, so this
 * creates the rels table and copies each existing client link into it.
 *
 * Additive only: `client_id` stays in place (unused) so a rollback keeps the
 * original links. Keep in sync with addMeetingSchedulerProspects() in
 * src/lib/run-migrations.ts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS \`meeting_schedulers_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`clients_id\` integer,
    \`client_proposals_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`meeting_schedulers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`clients_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`client_proposals_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `meeting_schedulers_rels_order_idx` ON `meeting_schedulers_rels` (`order`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `meeting_schedulers_rels_parent_idx` ON `meeting_schedulers_rels` (`parent_id`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `meeting_schedulers_rels_path_idx` ON `meeting_schedulers_rels` (`path`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `meeting_schedulers_rels_clients_id_idx` ON `meeting_schedulers_rels` (`clients_id`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `meeting_schedulers_rels_client_proposals_id_idx` ON `meeting_schedulers_rels` (`client_proposals_id`);"));
  await db.run(sql.raw(`INSERT INTO \`meeting_schedulers_rels\` (\`parent_id\`, \`path\`, \`clients_id\`)
    SELECT ms.\`id\`, 'client', ms.\`client_id\`
    FROM \`meeting_schedulers\` ms
    WHERE ms.\`client_id\` IS NOT NULL
      AND EXISTS (SELECT 1 FROM \`clients\` c WHERE c.\`id\` = ms.\`client_id\`)
      AND NOT EXISTS (
        SELECT 1 FROM \`meeting_schedulers_rels\` rel
        WHERE rel.\`parent_id\` = ms.\`id\` AND rel.\`path\` = 'client'
      );`));
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // client_id was never removed, so the original single-client links survive a rollback.
}
