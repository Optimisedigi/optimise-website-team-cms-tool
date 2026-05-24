import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

async function runIgnoringExisting(db: MigrateUpArgs["db"], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement));
  } catch {
    // SQLite throws when a column/table/index already exists. This migration is
    // intentionally idempotent because local dev DBs may already have schema-push
    // versions of these fields.
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await runIgnoringExisting(db, "ALTER TABLE `email_templates` ADD `google_ads_starter_subject_template` text;");
  await runIgnoringExisting(db, "ALTER TABLE `email_templates` ADD `google_ads_starter_opening` text;");
  await runIgnoringExisting(db, "ALTER TABLE `email_templates` ADD `google_ads_starter_questions_intro` text;");
  await runIgnoringExisting(db, "ALTER TABLE `email_templates` ADD `google_ads_starter_closing` text;");

  await runIgnoringExisting(
    db,
    `CREATE TABLE IF NOT EXISTS \`email_templates_google_ads_starter_readiness_fragments\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`slug\` text NOT NULL,
      \`copy\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    );`
  );
  await runIgnoringExisting(db, "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_readiness_fragments_order_idx` ON `email_templates_google_ads_starter_readiness_fragments` (`_order`);");
  await runIgnoringExisting(db, "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_readiness_fragments_parent_id_idx` ON `email_templates_google_ads_starter_readiness_fragments` (`_parent_id`);");

  await runIgnoringExisting(
    db,
    `CREATE TABLE IF NOT EXISTS \`email_templates_google_ads_starter_goal_fragments\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`slug\` text NOT NULL,
      \`copy\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    );`
  );
  await runIgnoringExisting(db, "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_goal_fragments_order_idx` ON `email_templates_google_ads_starter_goal_fragments` (`_order`);");
  await runIgnoringExisting(db, "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_goal_fragments_parent_id_idx` ON `email_templates_google_ads_starter_goal_fragments` (`_parent_id`);");

  await runIgnoringExisting(
    db,
    `CREATE TABLE IF NOT EXISTS \`email_templates_google_ads_starter_website_fragments\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`slug\` text NOT NULL,
      \`copy\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    );`
  );
  await runIgnoringExisting(db, "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_website_fragments_order_idx` ON `email_templates_google_ads_starter_website_fragments` (`_order`);");
  await runIgnoringExisting(db, "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_website_fragments_parent_id_idx` ON `email_templates_google_ads_starter_website_fragments` (`_parent_id`);");

  await runIgnoringExisting(
    db,
    `CREATE TABLE IF NOT EXISTS \`email_templates_google_ads_starter_budget_fragments\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`slug\` text NOT NULL,
      \`copy\` text NOT NULL,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`email_templates\`(\`id\`) ON DELETE CASCADE
    );`
  );
  await runIgnoringExisting(db, "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_budget_fragments_order_idx` ON `email_templates_google_ads_starter_budget_fragments` (`_order`);");
  await runIgnoringExisting(db, "CREATE INDEX IF NOT EXISTS `email_templates_google_ads_starter_budget_fragments_parent_id_idx` ON `email_templates_google_ads_starter_budget_fragments` (`_parent_id`);");
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: retaining nullable template fields is harmless and avoids destructive
  // content loss if this migration is rolled back after editors save copy.
}
