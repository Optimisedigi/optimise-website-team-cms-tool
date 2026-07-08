import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Rebuild contractor_time_entries so contractor_id can be nullable for
  // internal user time entries, and add user_id ownership for RBAC.
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`DROP INDEX IF EXISTS "contractor_time_entries_unique_week";`)
  await db.run(sql`CREATE TABLE IF NOT EXISTS "contractor_time_entries_next" (
    "id" integer PRIMARY KEY NOT NULL,
    "user_id" integer,
    "contractor_id" integer,
    "week_commencing" text NOT NULL,
    "hours" numeric DEFAULT 0 NOT NULL,
    "status" text DEFAULT 'draft' NOT NULL,
    "hourly_rate_snapshot" numeric,
    "total_fee" numeric,
    "payment_id" integer,
    "submitted_at" text,
    "approved_at" text,
    "paid_at" text,
    "notes" text,
    "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null,
    FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY ("payment_id") REFERENCES "contractor_payments"("id") ON UPDATE no action ON DELETE set null
  );`)
  await db.run(sql`INSERT OR IGNORE INTO "contractor_time_entries_next" (
    "id", "contractor_id", "week_commencing", "hours", "status", "hourly_rate_snapshot",
    "total_fee", "payment_id", "submitted_at", "approved_at", "paid_at", "notes", "updated_at", "created_at"
  ) SELECT
    "id", "contractor_id", "week_commencing", "hours", "status", "hourly_rate_snapshot",
    "total_fee", "payment_id", "submitted_at", "approved_at", "paid_at", "notes", "updated_at", "created_at"
  FROM "contractor_time_entries";`)
  await db.run(sql`DROP TABLE IF EXISTS "contractor_time_entries";`)
  await db.run(sql`ALTER TABLE "contractor_time_entries_next" RENAME TO "contractor_time_entries";`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS "contractor_time_entries_user_idx" ON "contractor_time_entries" ("user_id");`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS "contractor_time_entries_contractor_idx" ON "contractor_time_entries" ("contractor_id");`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS "contractor_time_entries_week_commencing_idx" ON "contractor_time_entries" ("week_commencing");`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS "contractor_time_entries_status_idx" ON "contractor_time_entries" ("status");`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "contractor_time_entries_unique_user_week" ON "contractor_time_entries" ("user_id", "week_commencing") WHERE "user_id" IS NOT NULL;`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS "contractor_time_entries_unique_contractor_week" ON "contractor_time_entries" ("contractor_id", "week_commencing") WHERE "user_id" IS NULL AND "contractor_id" IS NOT NULL;`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS "contractor_time_entries_client_allocations" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" text PRIMARY KEY NOT NULL,
    "client_id" integer NOT NULL,
    "hours" numeric DEFAULT 0 NOT NULL,
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY ("_parent_id") REFERENCES "contractor_time_entries"("id") ON UPDATE no action ON DELETE cascade
  );`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS "contractor_time_entries_client_allocations_order_idx" ON "contractor_time_entries_client_allocations" ("_order");`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS "contractor_time_entries_client_allocations_parent_id_idx" ON "contractor_time_entries_client_allocations" ("_parent_id");`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS "contractor_time_entries_client_allocations_client_idx" ON "contractor_time_entries_client_allocations" ("client_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS "contractor_time_entries_client_allocations";`)
}
