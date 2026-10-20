/**
 * Additive SQL for the `google-ads-change-previews` collection (2026-10-20):
 * one new table, no change to any existing table (the collection sets
 * lockDocuments: false, so Payload expects no payload_locked_documents_rels
 * column). Matches Payload's own pushed schema for the collection. Shared by
 * runMigrations() and src/migrations/20261020_120000_google_ads_change_previews.ts.
 * Every statement is idempotent.
 */
const ts = "text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL";

function index(column: string, field: string): [string, string] {
  const name = `google_ads_change_previews_${field}_idx`;
  return [name, `CREATE INDEX IF NOT EXISTS \`${name}\` ON \`google_ads_change_previews\` (\`${column}\`)`];
}

export const GOOGLE_ADS_CHANGE_PREVIEWS_SCHEMA: Array<[string, string]> = [
  ["google_ads_change_previews", `CREATE TABLE IF NOT EXISTS \`google_ads_change_previews\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`owner_id\` integer NOT NULL,
    \`status\` text DEFAULT 'pending' NOT NULL,
    \`customer_id\` text NOT NULL,
    \`audit_id\` numeric,
    \`client_id\` numeric,
    \`agent_run_id\` text,
    \`action\` text NOT NULL,
    \`method\` text NOT NULL,
    \`path\` text NOT NULL,
    \`request_body\` text,
    \`summary\` text,
    \`expires_at\` text NOT NULL,
    \`applied_at\` text,
    \`result\` text,
    \`last_error\` text,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  index("owner_id", "owner"),
  index("status", "status"),
  index("customer_id", "customer_id"),
  index("agent_run_id", "agent_run_id"),
  index("updated_at", "updated_at"),
  index("created_at", "created_at"),
];
