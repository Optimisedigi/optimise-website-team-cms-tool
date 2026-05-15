import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds pre-sale workspace tables + columns to `client_proposals`:
 *
 * - `client_proposals_notes` — array sub-table mirroring `client_notes`
 *   (powers the new Notes tab on proposals).
 * - `client_proposals_account_timeline` — array sub-table mirroring
 *   `client_account_timeline` (powers the new Prospect Timeline tab).
 * - `client_proposals.discovery_notes` — single text column behind the
 *   new Pre-sale Discovery tab.
 *
 * On convertToClient, notes + timeline rows are copied to the new client
 * (handled in `ClientProposals.convertToClientHook`); `discovery_notes` is
 * prepended as a single client note.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_notes\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`category\` text DEFAULT 'general',
        \`date\` text NOT NULL,
        \`author\` text,
        \`content\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists — safe on re-runs.
  }

  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_notes_order_idx\`
        ON \`client_proposals_notes\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }

  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_notes_parent_id_idx\`
        ON \`client_proposals_notes\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }

  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_account_timeline\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`date\` text NOT NULL,
        \`service_area\` text DEFAULT 'google_ads',
        \`action_type\` text NOT NULL,
        \`description\` text NOT NULL,
        \`added_by\` text,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists.
  }

  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_account_timeline_order_idx\`
        ON \`client_proposals_account_timeline\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }

  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_account_timeline_parent_id_idx\`
        ON \`client_proposals_account_timeline\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }

  try {
    await db.run(sql`
      ALTER TABLE \`client_proposals\` ADD \`discovery_notes\` text;
    `)
  } catch {
    // Column already exists.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: leave the tables/column in place on rollback. They're idempotent
  // and additive; dropping them would lose any captured pre-sale data.
}
