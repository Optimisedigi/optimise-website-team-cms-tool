import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds client-scoped workflow fields for the Blog Prompter.
 *
 * The statements are intentionally idempotent because production migrations are
 * triggered through /api/migrate and may be retried.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql.raw('ALTER TABLE "blog_prompts" ADD "client_id" integer;'));
  } catch {
    /* column already exists */
  }

  try {
    await db.run(sql.raw('ALTER TABLE "blog_prompts" ADD "workflow_status" text DEFAULT \'idea_phase\';'));
  } catch {
    /* column already exists */
  }

  try {
    await db.run(sql.raw('ALTER TABLE "blog_prompts" ADD "blog_post_id" integer;'));
  } catch {
    /* column already exists */
  }

  await db.run(sql.raw('UPDATE "blog_prompts" SET "workflow_status" = \'idea_phase\' WHERE "workflow_status" IS NULL;'));
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS "blog_prompts_client_idx" ON "blog_prompts" ("client_id");'));
  await db.run(sql.raw('CREATE INDEX IF NOT EXISTS "blog_prompts_blog_post_idx" ON "blog_prompts" ("blog_post_id");'));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw('DROP INDEX IF EXISTS "blog_prompts_blog_post_idx";'));
  await db.run(sql.raw('DROP INDEX IF EXISTS "blog_prompts_client_idx";'));
  // Non-destructive: keep added columns because SQLite column drops require a
  // table rebuild and the data is safe to leave in place.
}
