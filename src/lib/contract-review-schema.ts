/**
 * Additive SQL for contract draft review (2026-10-20): five new nullable
 * `contracts` columns (account manager contact + review link) and one new
 * table for the reviewer's inline comments. The comments collection sets
 * lockDocuments: false, so Payload expects no payload_locked_documents_rels
 * column. Shared by runMigrations() and
 * src/migrations/20261020_130000_contract_draft_review.ts. Every statement is
 * idempotent (ALTERs report "duplicate column" as skip).
 */
const ts = "text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL";

function index(column: string, field: string): [string, string] {
  const name = `contract_review_comments_${field}_idx`;
  return [name, `CREATE INDEX IF NOT EXISTS \`${name}\` ON \`contract_review_comments\` (\`${column}\`)`];
}

export const CONTRACT_REVIEW_SCHEMA: Array<[string, string]> = [
  ["contracts.account_manager_name", "ALTER TABLE `contracts` ADD `account_manager_name` text"],
  ["contracts.account_manager_email", "ALTER TABLE `contracts` ADD `account_manager_email` text"],
  ["contracts.review_token", "ALTER TABLE `contracts` ADD `review_token` text"],
  ["contracts.review_token_expires_at", "ALTER TABLE `contracts` ADD `review_token_expires_at` text"],
  ["contracts.review_sent_at", "ALTER TABLE `contracts` ADD `review_sent_at` text"],
  [
    "contracts_review_token_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS `contracts_review_token_idx` ON `contracts` (`review_token`)",
  ],
  ["contract_review_comments", `CREATE TABLE IF NOT EXISTS \`contract_review_comments\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`contract_id\` integer NOT NULL,
    \`quote\` text NOT NULL,
    \`occurrence\` numeric DEFAULT 0,
    \`section\` text,
    \`comment\` text NOT NULL,
    \`author_name\` text,
    \`emailed_at\` text,
    \`resolved\` integer DEFAULT false,
    \`updated_at\` ${ts},
    \`created_at\` ${ts},
    FOREIGN KEY (\`contract_id\`) REFERENCES \`contracts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`],
  index("contract_id", "contract"),
  index("emailed_at", "emailed_at"),
  index("updated_at", "updated_at"),
  index("created_at", "created_at"),
];
