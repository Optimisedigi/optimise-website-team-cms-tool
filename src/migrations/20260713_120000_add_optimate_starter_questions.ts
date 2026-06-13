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

/**
 * Array tables for OptiMate Settings starter prompt chips. Payload stores array
 * fields in child tables named after the global table plus the field name.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await createStarterQuestionTable(db, "optimate_settings_google_mate_starter_questions");
  await createStarterQuestionTable(db, "optimate_settings_google_mate_portfolio_starter_questions");
  await createStarterQuestionTable(db, "optimate_settings_invoice_mate_starter_questions");
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_settings_invoice_mate_starter_questions\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_settings_google_mate_portfolio_starter_questions\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`optimate_settings_google_mate_starter_questions\`;`);
}
