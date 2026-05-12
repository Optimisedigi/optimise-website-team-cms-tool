import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds the `client_proposals_mission_priorities` array table.
 *
 * Stores up to 4 priorities shown on the v2 proposal report's "Where to focus
 * our energy" slide (slide 13). Each row has a tag (eyebrow), title, and
 * description — surfaced in the CMS under Post-report-input.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_mission_priorities\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`tag\` text NOT NULL,
        \`title\` text NOT NULL,
        \`description\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists — safe to ignore on re-runs.
  }

  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_mission_priorities_order_idx\`
        ON \`client_proposals_mission_priorities\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }

  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_mission_priorities_parent_id_idx\`
        ON \`client_proposals_mission_priorities\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: leave the table in place on rollback.
}
