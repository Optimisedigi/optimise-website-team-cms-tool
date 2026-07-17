import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function runIgnoringExisting(db: MigrateUpArgs["db"], statement: string): Promise<void> {
  try {
    await db.run(sql.raw(statement));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column|already exists/i.test(message)) throw error;
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "google_ads_audit_snapshots" (
      "id" integer PRIMARY KEY NOT NULL,
      "audit_id" integer NOT NULL,
      "client_id" integer NOT NULL,
      "proposal_id" integer,
      "customer_id" text NOT NULL,
      "account_time_zone" text NOT NULL,
      "currency_code" text NOT NULL,
      "requested_at" text NOT NULL,
      "captured_at" text,
      "finalized_at" text,
      "period_start" text NOT NULL,
      "period_end" text NOT NULL,
      "earliest_available_activity_date" text NOT NULL,
      "retention_caveat" text,
      "schema_version" numeric DEFAULT 1 NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "progress" numeric DEFAULT 0,
      "error" text,
      "retry_count" numeric DEFAULT 0,
      "growth_tools_job_id" text,
      "source_row_counts" text,
      "chunk_manifest" text,
      "manifest_checksum" text,
      "analysis" text,
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY ("audit_id") REFERENCES "google_ads_audits"("id") ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY ("proposal_id") REFERENCES "client_proposals"("id") ON UPDATE no action ON DELETE set null
    );
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS "google_ads_audit_snapshot_chunks" (
      "id" integer PRIMARY KEY NOT NULL,
      "identity" text NOT NULL,
      "snapshot_id" integer NOT NULL,
      "dataset_key" text NOT NULL,
      "chunk_index" numeric NOT NULL,
      "row_count" numeric NOT NULL,
      "checksum" text NOT NULL,
      "rows" text NOT NULL,
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY ("snapshot_id") REFERENCES "google_ads_audit_snapshots"("id") ON UPDATE no action ON DELETE cascade
    );
  `));

  const indexes = [
    "CREATE INDEX IF NOT EXISTS `google_ads_audit_snapshots_audit_idx` ON `google_ads_audit_snapshots` (`audit_id`)",
    "CREATE INDEX IF NOT EXISTS `google_ads_audit_snapshots_client_idx` ON `google_ads_audit_snapshots` (`client_id`)",
    "CREATE INDEX IF NOT EXISTS `google_ads_audit_snapshots_status_idx` ON `google_ads_audit_snapshots` (`status`)",
    "CREATE INDEX IF NOT EXISTS `google_ads_audit_snapshots_requested_at_idx` ON `google_ads_audit_snapshots` (`requested_at`)",
    "CREATE INDEX IF NOT EXISTS `google_ads_audit_snapshots_job_idx` ON `google_ads_audit_snapshots` (`growth_tools_job_id`)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `google_ads_audit_snapshot_chunks_identity_idx` ON `google_ads_audit_snapshot_chunks` (`identity`)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `google_ads_audit_snapshot_chunks_natural_idx` ON `google_ads_audit_snapshot_chunks` (`snapshot_id`, `dataset_key`, `chunk_index`)",
  ];
  for (const statement of indexes) await db.run(sql.raw(statement));

  const auditColumns = [
    "ALTER TABLE `google_ads_audits` ADD `snapshot_id` integer REFERENCES `google_ads_audit_snapshots`(`id`) ON UPDATE no action ON DELETE set null",
    "ALTER TABLE `google_ads_audits` ADD `snapshot_state` text",
    "ALTER TABLE `google_ads_audits` ADD `snapshot_period_start` text",
    "ALTER TABLE `google_ads_audits` ADD `snapshot_period_end` text",
    "ALTER TABLE `google_ads_audits` ADD `snapshot_captured_at` text",
    "ALTER TABLE `google_ads_audits` ADD `deck_generated_at` text",
    "ALTER TABLE `google_ads_audits` ADD `deck_version` numeric",
    "ALTER TABLE `google_ads_audits` ADD `generated_deck_payload` text",
    "ALTER TABLE `google_ads_audits` ADD `deck_slide_visibility` text",
  ];
  for (const statement of auditColumns) await runIgnoringExisting(db, statement);
  await db.run(sql.raw("CREATE INDEX IF NOT EXISTS `google_ads_audits_snapshot_idx` ON `google_ads_audits` (`snapshot_id`)"));

  await runIgnoringExisting(db, "ALTER TABLE `payload_locked_documents_rels` ADD `google_ads_audit_snapshots_id` integer REFERENCES `google_ads_audit_snapshots`(`id`) ON UPDATE no action ON DELETE cascade");
  await runIgnoringExisting(db, "ALTER TABLE `payload_locked_documents_rels` ADD `google_ads_audit_snapshot_chunks_id` integer REFERENCES `google_ads_audit_snapshot_chunks`(`id`) ON UPDATE no action ON DELETE cascade");
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw("DROP TABLE IF EXISTS `google_ads_audit_snapshot_chunks`;"));
  await db.run(sql.raw("DROP TABLE IF EXISTS `google_ads_audit_snapshots`;"));
}
