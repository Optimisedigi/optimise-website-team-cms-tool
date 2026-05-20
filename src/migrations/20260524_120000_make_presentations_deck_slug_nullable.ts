import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * `deck_slug` on the presentations array tables was originally created as
 * `text NOT NULL`, but the admin field is `readOnly` and derived from
 * `deck_url` via a beforeChange hook. If the hook is ever skipped (e.g.
 * a direct API call without going through the hook chain, or a future
 * code path that bypasses it), the insert fails with SQLite NOT NULL
 * constraint and the admin save returns 500.
 *
 * Relax both tables to allow NULL. The beforeChange hooks still derive
 * the slug for normal saves — this is purely defensive.
 *
 * SQLite has no `ALTER COLUMN`, so we recreate each table via the
 * standard rename → create → copy → drop pattern, inside a transaction
 * with foreign keys temporarily off.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql.raw(`PRAGMA foreign_keys = OFF;`))
  try {
    // ── clients_presentations ─────────────────────────────────────────
    await db.run(sql.raw(`ALTER TABLE \`clients_presentations\` RENAME TO \`_clients_presentations_old\`;`))
    await db.run(sql`CREATE TABLE \`clients_presentations\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`title\` text NOT NULL,
      \`deck_slug\` text,
      \`deck_url\` text,
      \`presented_on\` text,
      \`kind\` text DEFAULT 'deck',
      \`is_public\` integer DEFAULT true,
      \`notes\` text,
      \`template_slug_id\` integer REFERENCES \`deck_templates\`(\`id\`) ON DELETE set null,
      \`deck_payload\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );`)
    await db.run(sql.raw(`INSERT INTO \`clients_presentations\`
      (\`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`deck_slug\`, \`deck_url\`, \`presented_on\`, \`kind\`, \`is_public\`, \`notes\`, \`template_slug_id\`, \`deck_payload\`)
      SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`deck_slug\`, \`deck_url\`, \`presented_on\`, \`kind\`, \`is_public\`, \`notes\`, \`template_slug_id\`, \`deck_payload\`
      FROM \`_clients_presentations_old\`;`))
    await db.run(sql.raw(`DROP TABLE \`_clients_presentations_old\`;`))
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_presentations_order_idx\` ON \`clients_presentations\` (\`_order\`);`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_presentations_parent_id_idx\` ON \`clients_presentations\` (\`_parent_id\`);`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_presentations_template_slug_idx\` ON \`clients_presentations\` (\`template_slug_id\`);`)

    // ── client_proposals_presentations ────────────────────────────────
    await db.run(sql.raw(`ALTER TABLE \`client_proposals_presentations\` RENAME TO \`_client_proposals_presentations_old\`;`))
    await db.run(sql`CREATE TABLE \`client_proposals_presentations\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`title\` text NOT NULL,
      \`deck_slug\` text,
      \`deck_url\` text,
      \`presented_on\` text,
      \`kind\` text DEFAULT 'deck',
      \`is_public\` integer DEFAULT true,
      \`notes\` text,
      FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );`)
    await db.run(sql.raw(`INSERT INTO \`client_proposals_presentations\`
      (\`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`deck_slug\`, \`deck_url\`, \`presented_on\`, \`kind\`, \`is_public\`, \`notes\`)
      SELECT \`_order\`, \`_parent_id\`, \`id\`, \`title\`, \`deck_slug\`, \`deck_url\`, \`presented_on\`, \`kind\`, \`is_public\`, \`notes\`
      FROM \`_client_proposals_presentations_old\`;`))
    await db.run(sql.raw(`DROP TABLE \`_client_proposals_presentations_old\`;`))
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_proposals_presentations_order_idx\` ON \`client_proposals_presentations\` (\`_order\`);`)
    await db.run(sql`CREATE INDEX IF NOT EXISTS \`client_proposals_presentations_parent_id_idx\` ON \`client_proposals_presentations\` (\`_parent_id\`);`)
  } finally {
    await db.run(sql.raw(`PRAGMA foreign_keys = ON;`))
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Intentional no-op. Reinstating the NOT NULL constraint would risk
  // rejecting legitimate rows that this migration unblocked.
}
