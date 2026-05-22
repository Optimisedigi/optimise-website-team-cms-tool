import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`clients\` ADD \`gads_auto_si_enabled\` integer DEFAULT 0 NOT NULL;`,
    );
  } catch {
    /* column already exists */
  }
  try {
    await db.run(
      sql`ALTER TABLE \`clients\` ADD \`gads_auto_si_position_threshold\` integer DEFAULT 3;`,
    );
  } catch {
    /* column already exists */
  }
  try {
    await db.run(
      sql`ALTER TABLE \`clients\` ADD \`gads_auto_si_check_frequency_hours\` integer DEFAULT 4;`,
    );
  } catch {
    /* column already exists */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` DROP COLUMN \`gads_auto_si_enabled\`;`);
  } catch {
    /* column does not exist */
  }
  try {
    await db.run(
      sql`ALTER TABLE \`clients\` DROP COLUMN \`gads_auto_si_position_threshold\`;`,
    );
  } catch {
    /* column does not exist */
  }
  try {
    await db.run(
      sql`ALTER TABLE \`clients\` DROP COLUMN \`gads_auto_si_check_frequency_hours\`;`,
    );
  } catch {
    /* column does not exist */
  }
}
