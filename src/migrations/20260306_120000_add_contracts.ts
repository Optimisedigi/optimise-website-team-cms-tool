import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`contracts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`contract_title\` text NOT NULL,
    \`proposal_id\` integer,
    \`client_id\` integer,
    \`client_name\` text NOT NULL,
    \`client_email\` text NOT NULL,
    \`contract_date\` text,
    \`contract_start_date\` text,
    \`monthly_price\` numeric,
    \`setup_fee\` numeric,
    \`retainer_amount\` numeric,
    \`contract_term\` text,
    \`payment_terms\` text,
    \`scope_of_work\` text,
    \`agency_signer_name\` text,
    \`agency_signer_title\` text,
    \`agency_signature\` text,
    \`agency_signed_at\` text,
    \`agency_signed_ip\` text,
    \`client_signer_name\` text,
    \`client_signature\` text,
    \`client_signed_at\` text,
    \`client_signed_ip\` text,
    \`signed_pdf_url\` text,
    \`status\` text DEFAULT 'draft',
    \`signing_token\` text,
    \`signing_token_expires_at\` text,
    \`sent_at\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`proposal_id\`) REFERENCES \`client_proposals\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contracts_proposal_idx\` ON \`contracts\` (\`proposal_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contracts_client_idx\` ON \`contracts\` (\`client_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`contracts_signing_token_idx\` ON \`contracts\` (\`signing_token\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contracts_status_idx\` ON \`contracts\` (\`status\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contracts_created_at_idx\` ON \`contracts\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`contracts_updated_at_idx\` ON \`contracts\` (\`updated_at\`);`)

  // Required for Payload's document locking system
  try { await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`contracts_id\` integer;`) } catch { /* exists */ }

  // Add contract fields to clients table
  try { await db.run(sql`ALTER TABLE \`clients\` ADD \`signed_contract_url\` text;`) } catch { /* exists */ }
  try { await db.run(sql`ALTER TABLE \`clients\` ADD \`signed_contract_id\` integer REFERENCES \`contracts\`(\`id\`) ON DELETE set null;`) } catch { /* exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`contracts\`;`)
}
