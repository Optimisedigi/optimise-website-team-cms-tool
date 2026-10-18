/**
 * Additive SQL for the Bank Receipts collection (2026-10-17): one new table
 * plus indexes, no change to any existing table (the collection sets
 * lockDocuments: false, so Payload expects no payload_locked_documents_rels
 * column). Shared by runMigrations() and
 * src/migrations/20261017_120000_bank_receipts.ts.
 * Every statement is idempotent (IF NOT EXISTS).
 */
export const BANK_RECEIPTS_SCHEMA: readonly [string, string][] = [
  ["bank_receipts", `CREATE TABLE IF NOT EXISTS \`bank_receipts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`date\` text NOT NULL,
    \`amount\` numeric NOT NULL,
    \`description\` text NOT NULL,
    \`source\` text DEFAULT 'csv_import',
    \`month\` text,
    \`year\` numeric,
    \`import_batch\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`],
  ["bank_receipts_month_idx", "CREATE INDEX IF NOT EXISTS `bank_receipts_month_idx` ON `bank_receipts` (`month`)"],
  ["bank_receipts_updated_at_idx", "CREATE INDEX IF NOT EXISTS `bank_receipts_updated_at_idx` ON `bank_receipts` (`updated_at`)"],
  ["bank_receipts_created_at_idx", "CREATE INDEX IF NOT EXISTS `bank_receipts_created_at_idx` ON `bank_receipts` (`created_at`)"],
];
