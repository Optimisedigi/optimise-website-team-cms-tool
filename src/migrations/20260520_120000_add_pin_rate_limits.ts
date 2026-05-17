import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * PIN rate-limit buckets — persistent per-target lockout for 4-digit PIN
 * endpoints. See `src/collections/PinRateLimits.ts` for the rationale.
 *
 * Adds:
 *  - `pin_rate_limits` table.
 *  - unique index on `bucket_key`.
 *  - `payload_locked_documents_rels.pin_rate_limits_id` FK column.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`pin_rate_limits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`bucket_key\` text NOT NULL,
    \`attempts\` numeric DEFAULT 0 NOT NULL,
    \`locked_until\` text,
    \`window_start\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`);

  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS \`pin_rate_limits_bucket_key_idx\` ON \`pin_rate_limits\` (\`bucket_key\`);`,
  );

  // payload_locked_documents_rels FK column — required for every new
  // collection or admin record-view crashes (see CLAUDE.md "Deployment
  // Gotchas").
  try {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`pin_rate_limits_id\` integer REFERENCES \`pin_rate_limits\`(\`id\`) ON DELETE CASCADE;`,
      ),
    );
  } catch {
    /* column already present */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`pin_rate_limits\`;`);
}
