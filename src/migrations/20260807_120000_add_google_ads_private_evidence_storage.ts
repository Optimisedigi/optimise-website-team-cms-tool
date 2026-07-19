import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-sqlite";

async function rebuildChunkTable(db: MigrateUpArgs["db"] | MigrateDownArgs["db"], direction: "up" | "down") {
  await db.run(sql.raw("PRAGMA foreign_keys=OFF;"));
  await db.run(sql.raw("DROP INDEX IF EXISTS `google_ads_audit_snapshot_chunks_identity_idx`;"));
  await db.run(sql.raw("DROP INDEX IF EXISTS `google_ads_audit_snapshot_chunks_natural_idx`;"));
  await db.run(sql.raw("DROP INDEX IF EXISTS `google_ads_audit_snapshot_chunks_storage_mode_idx`;"));
  await db.run(sql.raw("DROP INDEX IF EXISTS `google_ads_audit_snapshot_chunks_blob_pathname_idx`;"));
  const metadataColumns = direction === "up" ? `
      "storage_mode" text DEFAULT 'database_json' NOT NULL,
      "blob_url" text,
      "blob_pathname" text,
      "encoding" text,
      "compressed_bytes" numeric,
      "uncompressed_bytes" numeric,` : "";
  await db.run(sql.raw(`
    CREATE TABLE "google_ads_audit_snapshot_chunks_new" (
      "id" integer PRIMARY KEY NOT NULL,
      "identity" text NOT NULL,
      "snapshot_id" integer NOT NULL,
      "dataset_key" text NOT NULL,
      "chunk_index" numeric NOT NULL,
      "row_count" numeric NOT NULL,
      "checksum" text NOT NULL,
      ${metadataColumns}
      "rows" text${direction === "down" ? " NOT NULL" : ""},
      "updated_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      "created_at" text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY ("snapshot_id") REFERENCES "google_ads_audit_snapshots"("id") ON UPDATE no action ON DELETE cascade
    );
  `));
  if (direction === "up") {
    await db.run(sql.raw(`
      INSERT INTO "google_ads_audit_snapshot_chunks_new" (
        id, identity, snapshot_id, dataset_key, chunk_index, row_count, checksum, storage_mode, rows, updated_at, created_at
      ) SELECT id, identity, snapshot_id, dataset_key, chunk_index, row_count, checksum, 'database_json', rows, updated_at, created_at
      FROM "google_ads_audit_snapshot_chunks";
    `));
  } else {
    await db.run(sql.raw(`
      INSERT INTO "google_ads_audit_snapshot_chunks_new" (id, identity, snapshot_id, dataset_key, chunk_index, row_count, checksum, rows, updated_at, created_at)
      SELECT id, identity, snapshot_id, dataset_key, chunk_index, row_count, checksum, COALESCE(rows, '[]'), updated_at, created_at
      FROM "google_ads_audit_snapshot_chunks";
    `));
  }
  await db.run(sql.raw("DROP TABLE `google_ads_audit_snapshot_chunks`;"));
  await db.run(sql.raw("ALTER TABLE `google_ads_audit_snapshot_chunks_new` RENAME TO `google_ads_audit_snapshot_chunks`;"));
  await db.run(sql.raw("CREATE UNIQUE INDEX `google_ads_audit_snapshot_chunks_identity_idx` ON `google_ads_audit_snapshot_chunks` (`identity`);"));
  await db.run(sql.raw("CREATE UNIQUE INDEX `google_ads_audit_snapshot_chunks_natural_idx` ON `google_ads_audit_snapshot_chunks` (`snapshot_id`, `dataset_key`, `chunk_index`);"));
  if (direction === "up") {
    await db.run(sql.raw("CREATE INDEX `google_ads_audit_snapshot_chunks_storage_mode_idx` ON `google_ads_audit_snapshot_chunks` (`storage_mode`);"));
    await db.run(sql.raw("CREATE INDEX `google_ads_audit_snapshot_chunks_blob_pathname_idx` ON `google_ads_audit_snapshot_chunks` (`blob_pathname`);"));
  }
  await db.run(sql.raw("PRAGMA foreign_keys=ON;"));
}

const snapshotColumns = [
  ["analysis_blob_url", "text"],
  ["analysis_blob_pathname", "text"],
  ["analysis_blob_checksum", "text"],
  ["analysis_blob_encoding", "text"],
  ["analysis_blob_compressed_bytes", "numeric"],
  ["analysis_blob_uncompressed_bytes", "numeric"],
] as const;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await rebuildChunkTable(db, "up");
  for (const [column, type] of snapshotColumns) {
    await db.run(sql.raw(`ALTER TABLE \`google_ads_audit_snapshots\` ADD COLUMN \`${column}\` ${type};`));
  }
  await db.run(sql.raw("CREATE INDEX `google_ads_audit_snapshots_analysis_blob_pathname_idx` ON `google_ads_audit_snapshots` (`analysis_blob_pathname`);"));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql.raw("DROP INDEX IF EXISTS `google_ads_audit_snapshots_analysis_blob_pathname_idx`;"));
  for (const [column] of [...snapshotColumns].reverse()) {
    await db.run(sql.raw(`ALTER TABLE \`google_ads_audit_snapshots\` DROP COLUMN \`${column}\`;`));
  }
  await rebuildChunkTable(db, "down");
}
