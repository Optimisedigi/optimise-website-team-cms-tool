import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function addLockedDocsColumn(db: MigrateUpArgs["db"]): Promise<void> {
  try {
    await db.run(sql.raw("ALTER TABLE `payload_locked_documents_rels` ADD `client_pulse_history_id` integer REFERENCES `client_pulse_history`(`id`) ON DELETE CASCADE;"));
  } catch (error) {
    if (error instanceof Error && /duplicate column name/i.test(error.message)) return;
    throw error;
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS "client_pulse_history" (
    "id" integer PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "date" text NOT NULL,
    "score" numeric NOT NULL,
    "status" text NOT NULL,
    "label" text,
    "organic_score" numeric,
    "paid_search_score" numeric,
    "service_coverage_score" numeric,
    "neglect_score" numeric,
    "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON UPDATE no action ON DELETE cascade
  );`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS "client_pulse_history_client_idx" ON "client_pulse_history" ("client_id");`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS "client_pulse_history_date_idx" ON "client_pulse_history" ("date");`);
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "client_pulse_history_client_date_idx" ON "client_pulse_history" ("client_id", "date");`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS "client_pulse_history_updated_at_idx" ON "client_pulse_history" ("updated_at");`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS "client_pulse_history_created_at_idx" ON "client_pulse_history" ("created_at");`);
  await addLockedDocsColumn(db);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS "client_pulse_history";`);
}
