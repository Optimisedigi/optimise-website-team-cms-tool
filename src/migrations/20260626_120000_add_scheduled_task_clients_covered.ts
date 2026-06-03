import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the clientsCovered relationship for Scheduled Agent Tasks. Payload stores
 * hasMany relationship fields for this collection in scheduled_agent_tasks_rels,
 * keyed by path, so this adds a clients_id column alongside the existing
 * google_ads_audits_id column used by additional accounts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw("ALTER TABLE `scheduled_agent_tasks_rels` ADD `clients_id` integer REFERENCES `clients`(`id`) ON DELETE CASCADE;"));
  } catch {
    // Column may already exist.
  }

  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `scheduled_agent_tasks_rels_clients_idx` ON `scheduled_agent_tasks_rels` (`clients_id`);"));

  await db.run(sql.raw(`INSERT INTO \`scheduled_agent_tasks_rels\` (\`parent_id\`, \`path\`, \`clients_id\`)
    SELECT task.\`id\`, 'clientsCovered', audit.\`client_id\`
    FROM \`scheduled_agent_tasks\` task
    JOIN \`google_ads_audits\` audit ON audit.\`id\` = task.\`audit_id\`
    WHERE audit.\`client_id\` IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM \`scheduled_agent_tasks_rels\` rel
        WHERE rel.\`parent_id\` = task.\`id\`
          AND rel.\`path\` = 'clientsCovered'
          AND rel.\`clients_id\` = audit.\`client_id\`
      );`));

  await db.run(sql.raw(`INSERT INTO \`scheduled_agent_tasks_rels\` (\`parent_id\`, \`path\`, \`clients_id\`)
    SELECT DISTINCT rel.\`parent_id\`, 'clientsCovered', audit.\`client_id\`
    FROM \`scheduled_agent_tasks_rels\` rel
    JOIN \`google_ads_audits\` audit ON audit.\`id\` = rel.\`google_ads_audits_id\`
    WHERE rel.\`path\` = 'audits'
      AND audit.\`client_id\` IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM \`scheduled_agent_tasks_rels\` existing
        WHERE existing.\`parent_id\` = rel.\`parent_id\`
          AND existing.\`path\` = 'clientsCovered'
          AND existing.\`clients_id\` = audit.\`client_id\`
      );`));
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite column drops require a table rebuild; leave the relationship column in place on rollback.
}
