import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function tryRun(db: MigrateUpArgs["db"], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement));
  } catch {
    // Already applied or table/column not available in this environment.
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "team_task_comments" (
      "id" integer PRIMARY KEY NOT NULL,
      "task_id" integer NOT NULL,
      "author_id" integer NOT NULL,
      "body" text NOT NULL,
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY ("task_id") REFERENCES "team_tasks"("id") ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY ("author_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "team_task_comments_rels" (
      "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      "order" integer,
      "parent_id" integer,
      "path" text NOT NULL,
      "users_id" integer,
      FOREIGN KEY ("parent_id") REFERENCES "team_task_comments"("id") ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY ("users_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "team_task_comments_attachments" (
      "id" text PRIMARY KEY NOT NULL,
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "label" text NOT NULL,
      "url" text NOT NULL,
      "kind" text DEFAULT 'other',
      FOREIGN KEY ("_parent_id") REFERENCES "team_task_comments"("id") ON UPDATE no action ON DELETE cascade
    );
  `));

  const indexStatements = [
    "CREATE INDEX IF NOT EXISTS `team_task_comments_task_idx` ON `team_task_comments` (`task_id`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_author_idx` ON `team_task_comments` (`author_id`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_updated_at_idx` ON `team_task_comments` (`updated_at`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_created_at_idx` ON `team_task_comments` (`created_at`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_rels_order_idx` ON `team_task_comments_rels` (`order`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_rels_parent_idx` ON `team_task_comments_rels` (`parent_id`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_rels_path_idx` ON `team_task_comments_rels` (`path`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_rels_users_id_idx` ON `team_task_comments_rels` (`users_id`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_attachments_order_idx` ON `team_task_comments_attachments` (`_order`)",
    "CREATE INDEX IF NOT EXISTS `team_task_comments_attachments_parent_idx` ON `team_task_comments_attachments` (`_parent_id`)",
  ];

  for (const statement of indexStatements) await db.run(sql.raw(statement));

  await tryRun(db, "ALTER TABLE `notifications` ADD `related_team_task_id` integer REFERENCES `team_tasks`(`id`) ON UPDATE no action ON DELETE set null;");
  await tryRun(db, "CREATE INDEX IF NOT EXISTS `notifications_related_team_task_idx` ON `notifications` (`related_team_task_id`);");
  await tryRun(db, "ALTER TABLE `payload_locked_documents_rels` ADD `team_task_comments_id` integer REFERENCES `team_task_comments`(`id`) ON UPDATE no action ON DELETE cascade;");
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw("DROP TABLE IF EXISTS `team_task_comments_attachments`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `team_task_comments_rels`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `team_task_comments`;"));
}
