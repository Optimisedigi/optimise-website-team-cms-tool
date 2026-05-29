import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the SEO Audit Proposals collection — full new-client SEO analysis from
 * the Growth Tools `POST /api/seo-proposal` engine, stored as a report JSON.
 *
 * Drizzle maps relationship fields `foo` → column `foo_id`, and inserts an
 * underscore between adjacent uppercase letters when snake-casing camelCase
 * field names. So:
 *   gscSiteUrl         → gsc_site_url
 *   averageOrderValue  → average_order_value
 *   conversionRate     → conversion_rate
 *   costPerLead        → cost_per_lead
 *   reportSlug         → report_slug
 *   businessType       → business_type
 *   brandKeywords      → brand_keywords
 *   startedAt/completedAt → started_at / completed_at
 *
 * Schema:
 *   seo_audit_proposals (
 *     id                   integer PK autoincrement
 *     client_id            integer  (FK -> clients,          ON DELETE set null)
 *     proposal_id          integer  (FK -> client_proposals, ON DELETE set null)
 *     report_slug          text UNIQUE
 *     website_url          text NOT NULL
 *     gsc_site_url         text NOT NULL
 *     business_type        text
 *     location             text
 *     brand_keywords       text
 *     average_order_value  numeric
 *     conversion_rate      numeric
 *     cost_per_lead        numeric
 *     status               text DEFAULT 'pending'
 *     progress             text
 *     started_at           text
 *     completed_at         text
 *     error                text
 *     verdict              text
 *     report               text   (JSON)
 *     updated_at           text NOT NULL
 *     created_at           text NOT NULL
 *   )
 *
 * Also adds `seo_audit_proposals_id` to payload_locked_documents_rels.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`seo_audit_proposals\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`client_id\` integer,
      \`proposal_id\` integer,
      \`report_slug\` text,
      \`website_url\` text NOT NULL,
      \`gsc_site_url\` text NOT NULL,
      \`business_type\` text,
      \`location\` text,
      \`brand_keywords\` text,
      \`average_order_value\` numeric,
      \`conversion_rate\` numeric,
      \`cost_per_lead\` numeric,
      \`status\` text DEFAULT 'pending',
      \`progress\` text,
      \`started_at\` text,
      \`completed_at\` text,
      \`error\` text,
      \`verdict\` text,
      \`report\` text,
      \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
      FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
      FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null
    );
  `);

  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS \`seo_audit_proposals_report_slug_idx\`
    ON \`seo_audit_proposals\` (\`report_slug\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`seo_audit_proposals_client_idx\`
    ON \`seo_audit_proposals\` (\`client_id\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`seo_audit_proposals_proposal_idx\`
    ON \`seo_audit_proposals\` (\`proposal_id\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`seo_audit_proposals_status_idx\`
    ON \`seo_audit_proposals\` (\`status\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`seo_audit_proposals_created_idx\`
    ON \`seo_audit_proposals\` (\`created_at\`);
  `);

  // payload_locked_documents_rels: add column for the new collection.
  try {
    await db.run(sql`
      ALTER TABLE \`payload_locked_documents_rels\`
      ADD COLUMN \`seo_audit_proposals_id\` integer
      REFERENCES \`seo_audit_proposals\`(\`id\`) ON UPDATE no action ON DELETE cascade;
    `);
  } catch {
    /* column already exists — ignore */
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`seo_audit_proposals\`;`);
}
