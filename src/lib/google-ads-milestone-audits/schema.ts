/**
 * Additive SQL for Google Ads milestone audits (2026-10-14). Shared by
 * runMigrations() (production heal on every cold start) and
 * src/migrations/20261014_120000_google_ads_milestone_audits.ts.
 * Every statement is idempotent or fails with "duplicate column"/"already exists".
 */
export const GOOGLE_ADS_MILESTONE_AUDITS_SCHEMA: Array<[string, string]> = [
  ["clients.gads_auto_milestone_audits_enabled", "ALTER TABLE `clients` ADD `gads_auto_milestone_audits_enabled` integer DEFAULT true"],
  ["google_ads_milestone_audits", `CREATE TABLE IF NOT EXISTS \`google_ads_milestone_audits\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`client_id\` integer NOT NULL,
    \`audit_id\` integer NOT NULL,
    \`months\` numeric NOT NULL,
    \`go_live_date\` text NOT NULL,
    \`due_date\` text NOT NULL,
    \`status\` text DEFAULT 'scheduled' NOT NULL,
    \`milestone_key\` text NOT NULL,
    \`period_start\` text,
    \`period_end\` text,
    \`overall_score\` numeric,
    \`snapshot_id\` integer,
    \`approval_id\` integer,
    \`deck_slug\` text,
    \`deck_url\` text,
    \`shared_at\` text,
    \`gmail_draft_id\` text,
    \`capture_started_at\` text,
    \`attempts\` numeric DEFAULT 0,
    \`note\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`audit_id\`) REFERENCES \`google_ads_audits\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`snapshot_id\`) REFERENCES \`google_ads_audit_snapshots\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`approval_id\`) REFERENCES \`agent_approval_queue\`(\`id\`) ON UPDATE no action ON DELETE set null
  )`],
  ["google_ads_milestone_audits_client_idx", "CREATE INDEX IF NOT EXISTS `google_ads_milestone_audits_client_idx` ON `google_ads_milestone_audits` (`client_id`)"],
  ["google_ads_milestone_audits_audit_idx", "CREATE INDEX IF NOT EXISTS `google_ads_milestone_audits_audit_idx` ON `google_ads_milestone_audits` (`audit_id`)"],
  ["google_ads_milestone_audits_due_date_idx", "CREATE INDEX IF NOT EXISTS `google_ads_milestone_audits_due_date_idx` ON `google_ads_milestone_audits` (`due_date`)"],
  ["google_ads_milestone_audits_status_idx", "CREATE INDEX IF NOT EXISTS `google_ads_milestone_audits_status_idx` ON `google_ads_milestone_audits` (`status`)"],
  ["google_ads_milestone_audits_milestone_key_idx", "CREATE UNIQUE INDEX IF NOT EXISTS `google_ads_milestone_audits_milestone_key_idx` ON `google_ads_milestone_audits` (`milestone_key`)"],
  ["google_ads_milestone_audits_snapshot_idx", "CREATE INDEX IF NOT EXISTS `google_ads_milestone_audits_snapshot_idx` ON `google_ads_milestone_audits` (`snapshot_id`)"],
  ["google_ads_milestone_audits_approval_idx", "CREATE INDEX IF NOT EXISTS `google_ads_milestone_audits_approval_idx` ON `google_ads_milestone_audits` (`approval_id`)"],
  ["google_ads_milestone_audits_updated_at_idx", "CREATE INDEX IF NOT EXISTS `google_ads_milestone_audits_updated_at_idx` ON `google_ads_milestone_audits` (`updated_at`)"],
  ["google_ads_milestone_audits_created_at_idx", "CREATE INDEX IF NOT EXISTS `google_ads_milestone_audits_created_at_idx` ON `google_ads_milestone_audits` (`created_at`)"],
  ["locked_docs_rels.google_ads_milestone_audits_id", "ALTER TABLE `payload_locked_documents_rels` ADD `google_ads_milestone_audits_id` integer REFERENCES `google_ads_milestone_audits`(`id`) ON DELETE cascade"],
  ["payload_locked_documents_rels_google_ads_milestone_audits_id_idx", "CREATE INDEX IF NOT EXISTS `payload_locked_documents_rels_google_ads_milestone_audits_id_idx` ON `payload_locked_documents_rels` (`google_ads_milestone_audits_id`)"],
];
