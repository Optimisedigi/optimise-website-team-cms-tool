import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const dbPath = process.argv[2] || 'content-prod-snapshot.db'

if (!existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`)
  process.exit(1)
}

const tempDir = mkdtempSync(join(tmpdir(), 'heal-admin-schema-'))
const sqlPath = join(tempDir, 'heal.sql')

writeFileSync(sqlPath, `
.bail off
CREATE TABLE IF NOT EXISTS consolidation_candidates (
  id integer PRIMARY KEY NOT NULL,
  client integer NOT NULL,
  nkl integer NOT NULL,
  nkl_name text,
  phrase_candidate text NOT NULL,
  exact_negatives_to_remove text NOT NULL,
  exact_count numeric,
  overlap_risk integer DEFAULT false,
  overlap_details text,
  status text DEFAULT 'pending' NOT NULL,
  approved_at text,
  rejected_at text,
  approved_by integer,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS consolidation_candidates_client_idx ON consolidation_candidates (client);
CREATE INDEX IF NOT EXISTS consolidation_candidates_nkl_idx ON consolidation_candidates (nkl);
CREATE INDEX IF NOT EXISTS consolidation_candidates_status_idx ON consolidation_candidates (status);

CREATE TABLE IF NOT EXISTS google_ads_snapshots (
  id integer PRIMARY KEY NOT NULL,
  client_id integer NOT NULL,
  level text NOT NULL,
  captured_at text NOT NULL,
  date_range_label text,
  date_range_start text,
  date_range_end text,
  customer_id text NOT NULL,
  row_count numeric,
  rows text,
  source_endpoint text,
  fetch_duration_ms numeric,
  error text,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE no action ON DELETE set null
);
CREATE INDEX IF NOT EXISTS google_ads_snapshots_client_idx ON google_ads_snapshots (client_id);
CREATE INDEX IF NOT EXISTS google_ads_snapshots_level_idx ON google_ads_snapshots (level);
CREATE INDEX IF NOT EXISTS google_ads_snapshots_client_level_unq ON google_ads_snapshots (client_id, level);

CREATE TABLE IF NOT EXISTS goal_runs (
  id integer PRIMARY KEY NOT NULL,
  client_id integer NOT NULL,
  goal text NOT NULL,
  status text NOT NULL,
  tier text,
  next_check_at text,
  cooling_off_until text,
  iterations_count integer NOT NULL DEFAULT 0,
  completed_at text,
  error text,
  parameters text,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE no action ON DELETE set null
);
CREATE INDEX IF NOT EXISTS goal_runs_client_idx ON goal_runs (client_id);
CREATE INDEX IF NOT EXISTS goal_runs_status_idx ON goal_runs (status);
CREATE INDEX IF NOT EXISTS goal_runs_tier_idx ON goal_runs (tier);
ALTER TABLE goal_runs ADD next_check_at text;
ALTER TABLE goal_runs ADD cooling_off_until text;
ALTER TABLE goal_runs ADD iterations_count integer NOT NULL DEFAULT 0;
ALTER TABLE goal_runs ADD parameters text;

CREATE TABLE IF NOT EXISTS goal_run_snapshots (
  id integer PRIMARY KEY NOT NULL,
  goal_run_id integer NOT NULL,
  step numeric NOT NULL,
  action text NOT NULL,
  risk_tier text NOT NULL,
  status text NOT NULL,
  proposed_payload text,
  modified_payload text,
  block_reason text,
  approval_id integer,
  measured_at text,
  measured_result text,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  FOREIGN KEY (goal_run_id) REFERENCES goal_runs(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS goal_run_snapshots_goal_run_idx ON goal_run_snapshots (goal_run_id);
CREATE INDEX IF NOT EXISTS goal_run_snapshots_status_idx ON goal_run_snapshots (status);

CREATE TABLE IF NOT EXISTS goal_run_snapshots_campaign_ids (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id text PRIMARY KEY NOT NULL,
  campaign_id text NOT NULL,
  FOREIGN KEY (_parent_id) REFERENCES goal_run_snapshots(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS goal_run_snapshots_campaign_ids_order_idx ON goal_run_snapshots_campaign_ids (_order);
CREATE INDEX IF NOT EXISTS goal_run_snapshots_campaign_ids_parent_idx ON goal_run_snapshots_campaign_ids (_parent_id);

CREATE TABLE IF NOT EXISTS goal_risk_tiers (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  name text NOT NULL,
  tier text NOT NULL,
  max_budget_impact_dollars real,
  requires_approval integer DEFAULT true,
  auto_execute integer DEFAULT false,
  description text,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS goal_risk_tiers_tier_idx ON goal_risk_tiers (tier);

CREATE TABLE IF NOT EXISTS goal_risk_tiers_allowed_action_types (
  _order integer NOT NULL,
  _parent_id integer NOT NULL,
  id integer PRIMARY KEY NOT NULL,
  action_type text NOT NULL,
  FOREIGN KEY (_parent_id) REFERENCES goal_risk_tiers(id) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS goal_risk_tiers_allowed_action_types_order_idx ON goal_risk_tiers_allowed_action_types (_order);
CREATE INDEX IF NOT EXISTS goal_risk_tiers_allowed_action_types_parent_idx ON goal_risk_tiers_allowed_action_types (_parent_id);

ALTER TABLE payload_locked_documents_rels ADD consolidation_candidates_id integer REFERENCES consolidation_candidates(id) ON DELETE cascade;
ALTER TABLE payload_locked_documents_rels ADD google_ads_snapshots_id integer REFERENCES google_ads_snapshots(id) ON DELETE cascade;
ALTER TABLE payload_locked_documents_rels ADD goal_runs_id integer REFERENCES goal_runs(id) ON DELETE cascade;
ALTER TABLE payload_locked_documents_rels ADD goal_run_snapshots_id integer REFERENCES goal_run_snapshots(id) ON DELETE cascade;
ALTER TABLE payload_locked_documents_rels ADD goal_risk_tiers_id integer REFERENCES goal_risk_tiers(id) ON DELETE cascade;
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_consolidation_candidates_id_idx ON payload_locked_documents_rels (consolidation_candidates_id);
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_google_ads_snapshots_id_idx ON payload_locked_documents_rels (google_ads_snapshots_id);
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_goal_runs_id_idx ON payload_locked_documents_rels (goal_runs_id);
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_goal_run_snapshots_id_idx ON payload_locked_documents_rels (goal_run_snapshots_id);
CREATE INDEX IF NOT EXISTS payload_locked_documents_rels_goal_risk_tiers_id_idx ON payload_locked_documents_rels (goal_risk_tiers_id);

INSERT INTO goal_risk_tiers (name, tier, max_budget_impact_dollars, requires_approval, auto_execute, description)
SELECT 'Yellow - Account Efficiency budget-update', 'yellow', 500, 1, 0, 'Yellow tier for Account Efficiency agent budget allocation saves. Requires approval.'
WHERE NOT EXISTS (SELECT 1 FROM goal_risk_tiers WHERE name = 'Yellow - Account Efficiency budget-update');
INSERT INTO goal_risk_tiers (name, tier, max_budget_impact_dollars, requires_approval, auto_execute, description)
SELECT 'Yellow - Account Efficiency budget-push-live', 'yellow', 500, 1, 0, 'Yellow tier for pushing approved Account Efficiency budget changes to Google Ads. Requires approval.'
WHERE NOT EXISTS (SELECT 1 FROM goal_risk_tiers WHERE name = 'Yellow - Account Efficiency budget-push-live');
`)

const result = spawnSync('sqlite3', [dbPath, `.read ${sqlPath}`], {
  encoding: 'utf8',
})

const combined = `${result.stdout || ''}${result.stderr || ''}`.trim()
if (combined) {
  for (const line of combined.split('\n')) {
    if (/duplicate column name|already exists/i.test(line)) {
      console.log(`SKIP ${line}`)
    } else {
      console.error(line)
      process.exitCode = 1
    }
  }
}

function query(sql) {
  const res = spawnSync('sqlite3', ['-list', dbPath, sql], { encoding: 'utf8' })
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout)
    process.exit(1)
  }
  return res.stdout.trim().split('\n').filter(Boolean)
}

const requiredTables = ['consolidation_candidates', 'google_ads_snapshots', 'goal_runs', 'goal_run_snapshots', 'goal_risk_tiers']
const tables = new Set(query("SELECT name FROM sqlite_master WHERE type='table'"))
const missingTables = requiredTables.filter((table) => !tables.has(table))
if (missingTables.length) {
  console.error(`Missing tables after heal: ${missingTables.join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`Verified tables: ${requiredTables.join(', ')}`)
}

const requiredColumns = ['consolidation_candidates_id', 'google_ads_snapshots_id', 'goal_runs_id', 'goal_run_snapshots_id', 'goal_risk_tiers_id']
const columns = new Set(query('PRAGMA table_info(payload_locked_documents_rels)').map((line) => line.split('|')[1]))
const missingColumns = requiredColumns.filter((column) => !columns.has(column))
if (missingColumns.length) {
  console.error(`Missing locked-doc columns after heal: ${missingColumns.join(', ')}`)
  process.exitCode = 1
} else {
  console.log(`Verified locked-doc columns: ${requiredColumns.join(', ')}`)
}

if (process.exitCode) process.exit(process.exitCode)
console.log('Admin schema heal complete')
