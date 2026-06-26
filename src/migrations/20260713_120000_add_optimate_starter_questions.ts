import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

async function createStarterQuestionTable(db: MigrateUpArgs["db"], tableName: string): Promise<void> {
  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS \`${tableName}\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` integer NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`question\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`optimate_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`${tableName}_order_idx\` ON \`${tableName}\` (\`_order\`);`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`${tableName}_parent_id_idx\` ON \`${tableName}\` (\`_parent_id\`);`));
}

async function seedStarterQuestions(db: MigrateUpArgs["db"]): Promise<void> {
  await db.run(sql.raw(`INSERT INTO \`optimate_settings_google_mate_starter_questions\` (\`_order\`, \`_parent_id\`, \`id\`, \`question\`)
    SELECT seed._order, os.id, seed.idPrefix || os.id, seed.question
    FROM \`optimate_settings\` os
    JOIN (
      SELECT 1 AS _order, 'google-mate-starter-default-1-' AS idPrefix, 'Draft the budget pacing this month with a 1 sentence performance summary on top, then save it as a Gmail draft.' AS question
      UNION ALL SELECT 2, 'google-mate-starter-default-2-', 'How is my budget pacing this month? Include percent used, target spend to date, and days remaining.'
      UNION ALL SELECT 3, 'google-mate-starter-default-3-', 'Which campaigns are performing best this week?'
      UNION ALL SELECT 4, 'google-mate-starter-default-4-', 'Are there any keywords wasting spend?'
    ) seed
    WHERE NOT EXISTS (
      SELECT 1 FROM \`optimate_settings_google_mate_starter_questions\` existing
      WHERE existing.\`_parent_id\` = os.id
    );`));

  await db.run(sql.raw(`INSERT INTO \`optimate_settings_google_mate_portfolio_starter_questions\` (\`_order\`, \`_parent_id\`, \`id\`, \`question\`)
    SELECT seed._order, os.id, seed.idPrefix || os.id, seed.question
    FROM \`optimate_settings\` os
    JOIN (
      SELECT 1 AS _order, 'google-mate-portfolio-starter-default-1-' AS idPrefix, 'Create separate Gmail drafts for each selected account''s budget pacing this month, each with a 1 sentence performance summary on top.' AS question
      UNION ALL SELECT 2, 'google-mate-portfolio-starter-default-2-', 'Show me the account inventory'
      UNION ALL SELECT 3, 'google-mate-portfolio-starter-default-3-', 'Summarise portfolio performance'
      UNION ALL SELECT 4, 'google-mate-portfolio-starter-default-4-', 'Find cross-account search-term waste'
    ) seed
    WHERE NOT EXISTS (
      SELECT 1 FROM \`optimate_settings_google_mate_portfolio_starter_questions\` existing
      WHERE existing.\`_parent_id\` = os.id
    );`));

  await db.run(sql.raw(`INSERT INTO \`optimate_settings_invoice_mate_starter_questions\` (\`_order\`, \`_parent_id\`, \`id\`, \`question\`)
    SELECT seed._order, os.id, seed.idPrefix || os.id, seed.question
    FROM \`optimate_settings\` os
    JOIN (
      SELECT 1 AS _order, 'invoice-mate-starter-default-1-' AS idPrefix, 'Show me overdue invoices' AS question
      UNION ALL SELECT 2, 'invoice-mate-starter-default-2-', 'Summarise outstanding invoices'
      UNION ALL SELECT 3, 'invoice-mate-starter-default-3-', 'What invoices are scheduled to send?'
      UNION ALL SELECT 4, 'invoice-mate-starter-default-4-', 'Create this month’s retainer'
    ) seed
    WHERE NOT EXISTS (
      SELECT 1 FROM \`optimate_settings_invoice_mate_starter_questions\` existing
      WHERE existing.\`_parent_id\` = os.id
    );`));
}

/**
 * Array tables for OptiMate Settings starter prompt chips. Payload stores array
 * fields in child tables named after the global table plus the field name.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await createStarterQuestionTable(db, "optimate_settings_google_mate_starter_questions");
  await createStarterQuestionTable(db, "optimate_settings_google_mate_portfolio_starter_questions");
  await createStarterQuestionTable(db, "optimate_settings_invoice_mate_starter_questions");
  await seedStarterQuestions(db);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_settings_invoice_mate_starter_questions\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_settings_google_mate_portfolio_starter_questions\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_settings_google_mate_starter_questions\`;`);
}
