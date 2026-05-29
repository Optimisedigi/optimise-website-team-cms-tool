import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the Blog Settings global plus client-specific blog tone fields used by
 * the Blog Prompter. Statements are idempotent so the manual /api/migrate route
 * can be safely retried after deploys.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "blog_settings" (
      "id" integer PRIMARY KEY NOT NULL,
      "global_blog_rules" text,
      "global_markdown_rules" text,
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `));

  try {
    await db.run(sql.raw('ALTER TABLE "clients" ADD "blog_tone" text;'));
  } catch {
    /* column already exists */
  }

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "clients_blog_category_tones" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "category" text,
      "tone" text,
      FOREIGN KEY ("_parent_id") REFERENCES "clients"("id") ON UPDATE no action ON DELETE cascade
    );
  `));
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS "clients_blog_category_tones_order_idx" ON "clients_blog_category_tones" ("_order");'));
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS "clients_blog_category_tones_parent_id_idx" ON "clients_blog_category_tones" ("_parent_id");'));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('DROP TABLE IF EXISTS "clients_blog_category_tones";'));
  await db.run(sql.raw('DROP TABLE IF EXISTS "blog_settings";'));
  // Non-destructive: keep clients.blog_tone because SQLite cannot drop columns
  // safely without rebuilding the client table and risking existing client data.
}
