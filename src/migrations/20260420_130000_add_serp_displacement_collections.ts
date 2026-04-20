import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── serp_displacement_snapshots main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`serp_displacement_snapshots\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`client_name\` text,
    \`keyword\` text NOT NULL,
    \`location\` text NOT NULL,
    \`device\` text NOT NULL,
    \`captured_at\` text NOT NULL,
    \`has_ai_overview\` integer DEFAULT false,
    \`ai_overview_expanded\` integer,
    \`ai_overview_cites_domain\` integer,
    \`ai_overview_references\` text,
    \`has_answer_box\` integer DEFAULT false,
    \`has_knowledge_graph\` integer DEFAULT false,
    \`has_shopping\` integer DEFAULT false,
    \`has_local_pack\` integer DEFAULT false,
    \`top_ad_count\` numeric DEFAULT 0,
    \`bottom_ad_count\` numeric DEFAULT 0,
    \`organic_position\` numeric,
    \`organic_pixel_offset\` numeric,
    \`paid_position\` numeric,
    \`paid_absolute_top_is\` numeric,
    \`paid_top_is\` numeric,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_snapshots_client_idx\` ON \`serp_displacement_snapshots\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_snapshots_captured_at_idx\` ON \`serp_displacement_snapshots\` (\`captured_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_snapshots_client_captured_at_idx\` ON \`serp_displacement_snapshots\` (\`client_id\`, \`captured_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_snapshots_keyword_idx\` ON \`serp_displacement_snapshots\` (\`keyword\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_snapshots_created_at_idx\` ON \`serp_displacement_snapshots\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_snapshots_updated_at_idx\` ON \`serp_displacement_snapshots\` (\`updated_at\`);`)

  // ── serp_displacement_alerts main table ──
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`serp_displacement_alerts\` (
    \`id\` integer PRIMARY KEY NOT NULL,
    \`client_id\` integer NOT NULL,
    \`client_name\` text,
    \`keyword\` text NOT NULL,
    \`alert_type\` text NOT NULL,
    \`severity\` text NOT NULL,
    \`description\` text NOT NULL,
    \`recommended_action\` text,
    \`email_sent\` integer DEFAULT false,
    \`created_at\` text NOT NULL,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`)

  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_alerts_client_idx\` ON \`serp_displacement_alerts\` (\`client_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_alerts_client_created_at_idx\` ON \`serp_displacement_alerts\` (\`client_id\`, \`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_alerts_severity_idx\` ON \`serp_displacement_alerts\` (\`severity\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_alerts_alert_type_idx\` ON \`serp_displacement_alerts\` (\`alert_type\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_alerts_keyword_idx\` ON \`serp_displacement_alerts\` (\`keyword\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`serp_displacement_alerts_updated_at_idx\` ON \`serp_displacement_alerts\` (\`updated_at\`);`)

  // ── Add link columns to payload_locked_documents_rels ──
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`serp_displacement_snapshots_id\` integer REFERENCES \`serp_displacement_snapshots\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }
  try {
    await db.run(sql.raw(`ALTER TABLE \`payload_locked_documents_rels\` ADD \`serp_displacement_alerts_id\` integer REFERENCES \`serp_displacement_alerts\`(\`id\`) ON DELETE CASCADE;`))
  } catch { /* column may already exist */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`serp_displacement_alerts\`;`)
  await db.run(sql`DROP TABLE IF EXISTS \`serp_displacement_snapshots\`;`)
  // SQLite DROP COLUMN support varies — safe to leave the locked_docs_rels columns.
}
