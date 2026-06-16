import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function addLockedDocColumn(db: MigrateUpArgs["db"]): Promise<void> {
  try {
    await db.run(
      sql.raw(
        "ALTER TABLE `payload_locked_documents_rels` ADD `team_tasks_id` integer REFERENCES `team_tasks`(`id`) ON UPDATE no action ON DELETE cascade;",
      ),
    );
  } catch {
    // Column already exists or locked docs table is not present in this environment.
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "team_tasks" (
      "id" integer PRIMARY KEY NOT NULL,
      "title" text NOT NULL,
      "client_id" integer,
      "assigned_to_id" integer,
      "task_type" text DEFAULT 'other' NOT NULL,
      "status" text DEFAULT 'in_progress' NOT NULL,
      "priority" text DEFAULT 'normal' NOT NULL,
      "due_date" text,
      "completed_at" text,
      "instructions" text,
      "source_url" text,
      "staff_notes" text,
      "review_notes" text,
      "created_by_id" integer,
      "sheet_week" text,
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON UPDATE no action ON DELETE set null,
      FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null,
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null
    );
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "team_tasks_related_links" (
      "id" text PRIMARY KEY NOT NULL,
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "label" text NOT NULL,
      "url" text NOT NULL,
      "kind" text DEFAULT 'other',
      FOREIGN KEY ("_parent_id") REFERENCES "team_tasks"("id") ON UPDATE no action ON DELETE cascade
    );
  `));

  const indexStatements = [
    "CREATE INDEX IF NOT EXISTS `team_tasks_client_idx` ON `team_tasks` (`client_id`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_assigned_to_idx` ON `team_tasks` (`assigned_to_id`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_created_by_idx` ON `team_tasks` (`created_by_id`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_task_type_idx` ON `team_tasks` (`task_type`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_status_idx` ON `team_tasks` (`status`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_due_date_idx` ON `team_tasks` (`due_date`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_completed_at_idx` ON `team_tasks` (`completed_at`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_updated_at_idx` ON `team_tasks` (`updated_at`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_created_at_idx` ON `team_tasks` (`created_at`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_related_links_order_idx` ON `team_tasks_related_links` (`_order`)",
    "CREATE INDEX IF NOT EXISTS `team_tasks_related_links_parent_idx` ON `team_tasks_related_links` (`_parent_id`)",
  ];

  for (const statement of indexStatements) {
    await db.run(sql.raw(statement));
  }

  await addLockedDocColumn(db);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw("DROP TABLE IF EXISTS `team_tasks_related_links`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `team_tasks`;"));
}
