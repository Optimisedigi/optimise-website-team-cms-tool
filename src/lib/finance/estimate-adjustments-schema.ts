/**
 * Additive SQL for the Estimate Adjustments collection (2026-10-24): one new
 * table plus indexes, no change to any existing table (the collection sets
 * lockDocuments: false, so Payload expects no payload_locked_documents_rels
 * column). Shared by runMigrations() and
 * src/migrations/20261024_120000_estimate_adjustments.ts.
 * Every statement is idempotent (IF NOT EXISTS).
 */
export const ESTIMATE_ADJUSTMENTS_SCHEMA: readonly [string, string][] = [
  ["estimate_adjustments", `CREATE TABLE IF NOT EXISTS \`estimate_adjustments\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`month\` text NOT NULL,
    \`kind\` text NOT NULL,
    \`amount\` numeric NOT NULL,
    \`description\` text NOT NULL,
    \`account\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  )`],
  ["estimate_adjustments_month_idx", "CREATE INDEX IF NOT EXISTS `estimate_adjustments_month_idx` ON `estimate_adjustments` (`month`)"],
  ["estimate_adjustments_updated_at_idx", "CREATE INDEX IF NOT EXISTS `estimate_adjustments_updated_at_idx` ON `estimate_adjustments` (`updated_at`)"],
  ["estimate_adjustments_created_at_idx", "CREATE INDEX IF NOT EXISTS `estimate_adjustments_created_at_idx` ON `estimate_adjustments` (`created_at`)"],
];
