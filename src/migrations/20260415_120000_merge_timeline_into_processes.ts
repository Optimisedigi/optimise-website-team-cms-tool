import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // --- ProcessTemplates: phases ---
  try {
    await db.run(sql`ALTER TABLE \`process_templates_phases\` ADD \`week_range\` text`)
  } catch { /* already exists */ }

  // --- ProcessTemplates: phases.steps ---
  try {
    await db.run(sql`ALTER TABLE \`process_templates_phases_steps\` ADD \`client_visible\` integer DEFAULT false`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`process_templates_phases_steps\` ADD \`client_label\` text`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`process_templates_phases_steps\` ADD \`requires_approval\` integer DEFAULT false`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`process_templates_phases_steps\` ADD \`internal_notes\` text`)
  } catch { /* already exists */ }

  // --- ProcessTemplates: root ---
  try {
    await db.run(sql`ALTER TABLE \`process_templates\` ADD \`duration_days\` numeric`)
  } catch { /* already exists */ }

  // --- ClientProcesses: phases ---
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases\` ADD \`week_range\` text`)
  } catch { /* already exists */ }

  // --- ClientProcesses: phases.steps ---
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` ADD \`client_visible\` integer DEFAULT false`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` ADD \`client_label\` text`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` ADD \`requires_approval\` integer DEFAULT false`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` ADD \`approval_status\` text DEFAULT 'not_needed'`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` ADD \`client_approved_at\` text`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` ADD \`estimated_hours\` numeric`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` ADD \`internal_notes\` text`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` ADD \`completed_by_id\` integer REFERENCES users(id) ON DELETE SET NULL`)
  } catch { /* already exists */ }

  // --- ClientProcesses: root ---
  try {
    await db.run(sql`ALTER TABLE \`client_processes\` ADD \`start_date\` text`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes\` ADD \`end_date\` text`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes\` ADD \`last_shared_at\` text`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes\` ADD \`shared_count\` integer DEFAULT 0`)
  } catch { /* already exists */ }
  try {
    await db.run(sql`ALTER TABLE \`client_processes\` ADD \`duration_days\` numeric`)
  } catch { /* already exists */ }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // ProcessTemplates phases
  try { await db.run(sql`ALTER TABLE \`process_templates_phases\` DROP COLUMN \`week_range\``) } catch {}

  // ProcessTemplates steps
  try { await db.run(sql`ALTER TABLE \`process_templates_phases_steps\` DROP COLUMN \`client_visible\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`process_templates_phases_steps\` DROP COLUMN \`client_label\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`process_templates_phases_steps\` DROP COLUMN \`requires_approval\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`process_templates_phases_steps\` DROP COLUMN \`internal_notes\``) } catch {}

  // ProcessTemplates root
  try { await db.run(sql`ALTER TABLE \`process_templates\` DROP COLUMN \`duration_days\``) } catch {}

  // ClientProcesses phases
  try { await db.run(sql`ALTER TABLE \`client_processes_phases\` DROP COLUMN \`week_range\``) } catch {}

  // ClientProcesses steps
  try { await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` DROP COLUMN \`client_visible\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` DROP COLUMN \`client_label\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` DROP COLUMN \`requires_approval\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` DROP COLUMN \`approval_status\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` DROP COLUMN \`client_approved_at\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` DROP COLUMN \`estimated_hours\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` DROP COLUMN \`internal_notes\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes_phases_steps\` DROP COLUMN \`completed_by_id\``) } catch {}

  // ClientProcesses root
  try { await db.run(sql`ALTER TABLE \`client_processes\` DROP COLUMN \`start_date\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes\` DROP COLUMN \`end_date\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes\` DROP COLUMN \`last_shared_at\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes\` DROP COLUMN \`shared_count\``) } catch {}
  try { await db.run(sql`ALTER TABLE \`client_processes\` DROP COLUMN \`duration_days\``) } catch {}
}
