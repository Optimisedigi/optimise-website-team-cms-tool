import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── 1. clients_presentations ── add deck_url ──────────────────────────────
  try {
    await db.run(sql.raw(
      `ALTER TABLE \`clients_presentations\` ADD COLUMN \`deck_url\` text;`
    ))
  } catch { /* column may already exist */ }

  // ── 2. client_proposals_presentations ── add deck_url ────────────────────
  try {
    await db.run(sql.raw(
      `ALTER TABLE \`client_proposals_presentations\` ADD COLUMN \`deck_url\` text;`
    ))
  } catch { /* column may already exist */ }

  // ── 2b. clients_presentations ── add template_slug_id + deck_payload ─────
  // Payload's `presentations` array on clients gained `templateSlug` (relationship to
  // deck-templates) and `deckPayload` (json). Missing these blanks out the admin clients list.
  try {
    await db.run(sql.raw(
      `ALTER TABLE \`clients_presentations\` ADD COLUMN \`template_slug_id\` integer REFERENCES \`deck_templates\`(\`id\`) ON DELETE set null;`
    ))
  } catch { /* column may already exist */ }
  try {
    await db.run(sql.raw(
      `ALTER TABLE \`clients_presentations\` ADD COLUMN \`deck_payload\` text;`
    ))
  } catch { /* column may already exist */ }
  try {
    await db.run(sql.raw(
      `CREATE INDEX IF NOT EXISTS \`clients_presentations_template_slug_idx\` ON \`clients_presentations\` (\`template_slug_id\`);`
    ))
  } catch { /* index may already exist */ }

  // ── 3. deck_templates ──────────────────────────────────────────────────────
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`deck_templates\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`template_slug\` text NOT NULL,
      \`name\` text NOT NULL,
      \`description\` text,
      \`category\` text NOT NULL,
      \`preview_image_id\` integer REFERENCES \`media\`(\`id\`) ON DELETE set null,
      \`is_active\` integer DEFAULT true,
      \`is_default\` integer DEFAULT false,
      \`notes\` text,
      \`updated_at\` text,
      \`created_at\` text DEFAULT (datetime('now'))
    );
  `)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`deck_templates_template_slug_idx\` ON \`deck_templates\` (\`template_slug\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`deck_templates_created_at_idx\` ON \`deck_templates\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`deck_templates_updated_at_idx\` ON \`deck_templates\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`deck_templates_category_idx\` ON \`deck_templates\` (\`category\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`deck_templates_preview_image_idx\` ON \`deck_templates\` (\`preview_image_id\`);`)

  // ── 4. payload_locked_documents_rels FK column for deck_templates ─────────
  try {
    await db.run(sql.raw(
      `ALTER TABLE \`payload_locked_documents_rels\` ADD \`deck_templates_id\` text;`
    ))
  } catch { /* column may already exist */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`deck_templates\`;`)
  // deck_url columns are kept as no-ops on down (SQLite ALTER DROP is unreliable)
  // locked_docs_rels column intentionally left on rollback
}
