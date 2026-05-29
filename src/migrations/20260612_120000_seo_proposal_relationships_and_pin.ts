import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Completes the SEO Audit Proposal wiring that the earlier migration missed:
 *
 *  1. `client_proposals.seo_audit_proposal_id` — the proposal's relationship to
 *     its latest SEO Audit Proposal run (field `seoAuditProposal`).
 *  2. `clients_rels` table + `seo_audit_proposals_id` column — the Client's
 *     `hasMany` relationship (`seoAuditProposals`) is stored by Payload in the
 *     polymorphic relationships join table, not a scalar column. Without this
 *     table, loading any Client with depth>0 fails.
 *  3. `seo_audit_proposals.proposal_pin` — optional 4-digit PIN that gates the
 *     public deck (verified by /api/audit-auth).
 *
 * All statements are idempotent (IF NOT EXISTS / try-catch) so re-running is safe.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1. Proposal → run scalar relationship.
  try {
    await db.run(sql.raw(`ALTER TABLE \`client_proposals\` ADD \`seo_audit_proposal_id\` integer;`));
  } catch {
    /* exists */
  }

  // 3. PIN column on the run record.
  try {
    await db.run(sql.raw(`ALTER TABLE \`seo_audit_proposals\` ADD \`proposal_pin\` text;`));
  } catch {
    /* exists */
  }

  // 2. clients_rels join table for the Client hasMany relationship.
  // Payload may already have created this table for other hasMany rels; if so
  // we only need to ensure the seo_audit_proposals_id column exists.
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`clients_rels\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`order\` integer,
      \`parent_id\` integer NOT NULL,
      \`path\` text NOT NULL,
      \`seo_audit_proposals_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`seo_audit_proposals_id\`) REFERENCES \`seo_audit_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `);
  // If the table pre-existed without our column, add it.
  try {
    await db.run(sql.raw(`ALTER TABLE \`clients_rels\` ADD \`seo_audit_proposals_id\` integer REFERENCES \`seo_audit_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade;`));
  } catch {
    /* column already exists */
  }
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_rels_parent_idx\` ON \`clients_rels\` (\`parent_id\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_rels_path_idx\` ON \`clients_rels\` (\`path\`);`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`clients_rels_order_idx\` ON \`clients_rels\` (\`order\`);`);
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // Non-destructive: retaining nullable columns / the rels table is harmless.
}
