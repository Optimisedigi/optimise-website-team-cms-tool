import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds the `client_proposals_cro_key_findings` array table.
 *
 * Stores up to 6 manual CRO key-finding bullets shown on the v2 proposal
 * report's CRO Health slide. When the array is empty the slide falls back to
 * the auto-generated findings from the linked CRO audit (rendered in the
 * same clean bullet format).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_cro_key_findings\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`bullet\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists — safe to ignore on re-runs.
  }

  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_cro_key_findings_order_idx\`
        ON \`client_proposals_cro_key_findings\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }

  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_cro_key_findings_parent_id_idx\`
        ON \`client_proposals_cro_key_findings\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: leave the table in place on rollback.
}
