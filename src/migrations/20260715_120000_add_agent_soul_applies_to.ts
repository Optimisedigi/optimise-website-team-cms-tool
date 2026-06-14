import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds an explicit agent scope to Agent Soul rows so generic rules can apply to
 * all agents while agent-specific tone/style rules stay isolated.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw("ALTER TABLE `agent_soul` ADD `applies_to` text DEFAULT 'all';"));
  } catch {
    // Column may already exist on dev databases where Payload pushed schema.
  }

  await db.run(sql.raw("UPDATE `agent_soul` SET `applies_to` = 'all' WHERE `applies_to` IS NULL OR `applies_to` = '';"));
  await db.run(sql.raw("UPDATE `agent_soul` SET `applies_to` = 'google-ads' WHERE `aspect` LIKE 'google-ads-%';"));
  await db.run(sql.raw("UPDATE `agent_soul` SET `applies_to` = 'email' WHERE `aspect` LIKE 'email-%';"));
  await db.run(sql.raw("UPDATE `agent_soul` SET `applies_to` = 'invoice' WHERE `aspect` LIKE 'invoice-%' OR `aspect` LIKE 'invoicemate-%' OR `aspect` LIKE 'xero-%';"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `agent_soul_applies_to_idx` ON `agent_soul` (`applies_to`);"));
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite column drops require a table rebuild; the extra nullable scope column
  // is harmless to keep on rollback.
}
