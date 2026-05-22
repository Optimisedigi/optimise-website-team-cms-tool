import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Sync `payload_locked_documents_rels` FK columns with the full set Payload 3.17
 * needs at runtime.  Payload generates a locked-documents subquery that SELECTs
 * every `{slug}_id` column from this table.  If any column is absent the entire
 * admin UI crashes with "no such column" — even when no rows use that column.
 *
 * The individual collection migrations (e.g. 20260508_180000, 20260512_120000,
 * 20260519_120000, etc.) were deployed but their ALTER TABLE statements appear
 * to have been skipped on the Turso production database (schema-lock edge-case).
 * This catch-all migration is idempotent: each ADD COLUMN is wrapped in try/catch
 * so it is safe to re-run on a database where columns already exist.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const cols: Array<{ col: string; refs: string }> = [
    { col: 'invoice_statement_drafts_id',      refs: 'invoice_statement_drafts' },
    { col: 'agent_approval_queue_id',        refs: 'agent_approval_queue' },
    { col: 'agent_credentials_id',           refs: 'agent_credentials' },
    { col: 'scheduled_agent_tasks_id',       refs: 'scheduled_agent_tasks' },
    { col: 'agent_memory_id',                refs: 'agent_memory' },
    { col: 'agent_soul_id',                  refs: 'agent_soul' },
    { col: 'optimate_chat_turns_id',         refs: 'optimate_chat_turns' },
    { col: 'deck_templates_id',              refs: 'deck_templates' },
    { col: 'contract_reminders_id',           refs: 'contract_reminders' },
    { col: 'notifications_id',               refs: 'notifications' },
    { col: 'pin_rate_limits_id',             refs: 'pin_rate_limits' },
    { col: 'client_discovery_briefings_id', refs: 'client_discovery_briefings' },
    {
      col: 'match_type_violation_candidates_id',
      refs: 'match_type_violation_candidates',
    },
    { col: 'match_type_sync_state_id',       refs: 'match_type_sync_state' },
  ]

  for (const { col, refs } of cols) {
    try {
      await db.run(
        sql.raw(
          `ALTER TABLE \`payload_locked_documents_rels\` ADD \`${col}\` integer REFERENCES \`${refs}\`(\`id\`) ON DELETE SET NULL;`,
        ),
      )
    } catch {
      /* column already present — safe to skip */
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite does not support DROP COLUMN easily; down is intentionally a no-op.
  // This migration only adds columns; removing them requires a table rebuild.
  void db
}
