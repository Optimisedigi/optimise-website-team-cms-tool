import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Stores the meeting scheduler's calendar-grid availability (open and
 * favourite 30-minute cells, plus the Google Calendar busy times they were
 * checked against). Additive and nullable: existing schedulers keep working
 * from their generated slots. Keep in sync with addMeetingSchedulerAvailability()
 * in src/lib/run-migrations.ts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columns = await db.all<{ name: string }>(sql.raw("PRAGMA table_info(`meeting_schedulers`)"));
  if (!columns.some((column) => column.name === "availability")) {
    await db.run(sql.raw("ALTER TABLE `meeting_schedulers` ADD `availability` text;"));
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Additive nullable column; left in place so a rollback loses no availability.
}
