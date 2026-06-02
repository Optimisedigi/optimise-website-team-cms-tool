import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds friendly schedule fields and multi-account relationships to scheduled
 * agent tasks. Existing cron schedules remain supported via schedule_mode.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols: Array<{ name: string; type: string }> = [
    { name: "schedule_mode", type: "text DEFAULT 'manual_cron' NOT NULL" },
    { name: "monthly_day", type: "integer DEFAULT 1" },
    { name: "time_of_day", type: "text DEFAULT '09:00'" },
  ];

  for (const col of cols) {
    try {
      await db.run(sql.raw(`ALTER TABLE \`scheduled_agent_tasks\` ADD \`${col.name}\` ${col.type};`));
    } catch {
      // Column may already exist.
    }
  }

  await db.run(sql.raw(`UPDATE \`scheduled_agent_tasks\` SET \`schedule_mode\` = 'manual_cron' WHERE \`schedule_mode\` IS NULL OR \`schedule_mode\` = '';`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_schedule_mode_idx\` ON \`scheduled_agent_tasks\` (\`schedule_mode\`);`));

  await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS \`scheduled_agent_tasks_rels\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`order\` integer,
    \`parent_id\` integer NOT NULL,
    \`path\` text NOT NULL,
    \`google_ads_audits_id\` integer,
    FOREIGN KEY (\`parent_id\`) REFERENCES \`scheduled_agent_tasks\`(\`id\`) ON DELETE CASCADE,
    FOREIGN KEY (\`google_ads_audits_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON DELETE CASCADE
  );`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_rels_order_idx\` ON \`scheduled_agent_tasks_rels\` (\`order\`);`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_rels_parent_idx\` ON \`scheduled_agent_tasks_rels\` (\`parent_id\`);`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_rels_path_idx\` ON \`scheduled_agent_tasks_rels\` (\`path\`);`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS \`scheduled_agent_tasks_rels_google_ads_audits_idx\` ON \`scheduled_agent_tasks_rels\` (\`google_ads_audits_id\`);`));
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // SQLite column drops require a table rebuild; the relationship table is safe
  // to leave in place if rolling code back.
}
