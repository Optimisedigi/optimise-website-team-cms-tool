import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-sqlite";
import { sql } from "drizzle-orm";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "team_tasks_screenshots" (
      "id" text PRIMARY KEY NOT NULL,
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "label" text NOT NULL,
      "url" text NOT NULL,
      "thumbnail_url" text,
      "media_id" numeric NOT NULL,
      FOREIGN KEY ("_parent_id") REFERENCES "team_tasks"("id") ON UPDATE no action ON DELETE cascade
    );
  `));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `team_tasks_screenshots_order_idx` ON `team_tasks_screenshots` (`_order`);"));
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `team_tasks_screenshots_parent_idx` ON `team_tasks_screenshots` (`_parent_id`);"));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw("DROP TABLE IF EXISTS `team_tasks_screenshots`;"));
}
