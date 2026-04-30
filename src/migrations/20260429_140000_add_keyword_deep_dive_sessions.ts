import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the Keyword Deep Dive Sessions collection.
 *
 * Drizzle (Payload's data layer) maps each relationship field `foo` to a column
 * named `foo_id`, so the relationship columns must be named with the `_id`
 * suffix or the runtime will query for non-existent columns. The `keywords`
 * field is a Payload `array`, which is stored in a separate child table
 * `keyword_deep_dive_sessions_keywords` with `_parent_id` linking back to the
 * parent row \u2014 not as a JSON blob.
 *
 * Schema:
 *   keyword_deep_dive_sessions (
 *     id                    integer  PK autoincrement
 *     client_id             integer  NOT NULL  (FK -> clients,                ON DELETE cascade)
 *     google_ads_audit_id   integer            (FK -> google_ads_audits,      ON DELETE set null)
 *     applied_to_n_k_l_id   integer            (FK -> negative_keyword_lists, ON DELETE set null)
 *
 *   NOTE on column naming: Drizzle converts camelCase Payload field names
 *   to snake_case by inserting an underscore between every adjacent
 *   uppercase letter. So `appliedToNKL` becomes `applied_to_n_k_l`, then
 *   `_id` is appended for the FK.
 *     title                 text
 *     notes                 text
 *     status                text     DEFAULT 'pending'
 *     keyword_count         numeric  DEFAULT 0
 *     updated_at            text     NOT NULL
 *     created_at            text     NOT NULL
 *   )
 *
 *   keyword_deep_dive_sessions_keywords (
 *     _order               integer NOT NULL
 *     _parent_id           integer NOT NULL  (FK -> keyword_deep_dive_sessions.id, cascade)
 *     id                   text PK
 *     keyword              text NOT NULL
 *     match_type           text DEFAULT 'exact'
 *     flagged_for_removal  integer DEFAULT false
 *   )
 *
 * Also adds `keyword_deep_dive_sessions_id` to payload_locked_documents_rels
 * so the locking system works for the new collection.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // An earlier deploy created a malformed table with relationship columns
  // missing the `_id` suffix. Drop it (and any partially-created child table)
  // before recreating with the correct schema.
  await db.run(sql`DROP TABLE IF EXISTS \`keyword_deep_dive_sessions_keywords\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`keyword_deep_dive_sessions\`;`);

  await db.run(sql`
    CREATE TABLE \`keyword_deep_dive_sessions\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer NOT NULL,
      \`google_ads_audit_id\` integer,
      \`applied_to_n_k_l_id\` integer,
      \`title\` text,
      \`notes\` text,
      \`status\` text DEFAULT 'pending',
      \`keyword_count\` numeric DEFAULT 0,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`google_ads_audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`applied_to_n_k_l_id\`) REFERENCES \`negative_keyword_lists\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `);

  await db.run(sql`
    CREATE TABLE \`keyword_deep_dive_sessions_keywords\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`keyword\` text NOT NULL,
      \`match_type\` text DEFAULT 'exact',
      \`flagged_for_removal\` integer DEFAULT false,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`keyword_deep_dive_sessions\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `);

  await db.run(sql`
    CREATE INDEX \`keyword_deep_dive_sessions_client_idx\`
    ON \`keyword_deep_dive_sessions\` (\`client_id\`);
  `);
  await db.run(sql`
    CREATE INDEX \`keyword_deep_dive_sessions_audit_idx\`
    ON \`keyword_deep_dive_sessions\` (\`google_ads_audit_id\`);
  `);
  await db.run(sql`
    CREATE INDEX \`keyword_deep_dive_sessions_status_idx\`
    ON \`keyword_deep_dive_sessions\` (\`status\`);
  `);
  await db.run(sql`
    CREATE INDEX \`keyword_deep_dive_sessions_created_idx\`
    ON \`keyword_deep_dive_sessions\` (\`created_at\`);
  `);
  await db.run(sql`
    CREATE INDEX \`keyword_deep_dive_sessions_keywords_order_idx\`
    ON \`keyword_deep_dive_sessions_keywords\` (\`_order\`);
  `);
  await db.run(sql`
    CREATE INDEX \`keyword_deep_dive_sessions_keywords_parent_idx\`
    ON \`keyword_deep_dive_sessions_keywords\` (\`_parent_id\`);
  `);

  // payload_locked_documents_rels: add column for new collection.
  // Use a try/catch in case a previous partial migration already added it.
  try {
    await db.run(sql`
      ALTER TABLE \`payload_locked_documents_rels\`
      ADD COLUMN \`keyword_deep_dive_sessions_id\` integer
      REFERENCES \`keyword_deep_dive_sessions\`(\`id\`) ON UPDATE no action ON DELETE cascade;
    `);
  } catch {
    /* column already exists \u2014 ignore */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`keyword_deep_dive_sessions_keywords\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`keyword_deep_dive_sessions\`;`);
}
