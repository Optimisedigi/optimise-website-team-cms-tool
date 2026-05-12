import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

/**
 * Adds storage for the v2 proposal Roadmap (slide 21), Commercial model
 * (slide 23), and Next Steps / Launch Requirements (slide 25) slides.
 *
 * - Scalar columns on client_proposals for the three meta/note fields and the
 *   roadmap template selector.
 * - Five array tables: roadmap cells, commercial phases (with nested
 *   features), launch steps, launch blocks.
 *
 * Mirrors the mission_priorities migration: every CREATE is wrapped in
 * try/catch so re-running the migration is idempotent. `down()` is a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // -------------------------------------------------------------------------
  // Scalar columns on client_proposals
  // -------------------------------------------------------------------------
  const scalarColumns: Array<{ name: string; ddl: string }> = [
    { name: 'roadmap_template', ddl: `ALTER TABLE \`client_proposals\` ADD COLUMN \`roadmap_template\` text DEFAULT 'build-launch'` },
    { name: 'roadmap_meta', ddl: `ALTER TABLE \`client_proposals\` ADD COLUMN \`roadmap_meta\` text` },
    { name: 'roadmap_note', ddl: `ALTER TABLE \`client_proposals\` ADD COLUMN \`roadmap_note\` text` },
    { name: 'commercial_meta', ddl: `ALTER TABLE \`client_proposals\` ADD COLUMN \`commercial_meta\` text` },
    { name: 'commercial_note', ddl: `ALTER TABLE \`client_proposals\` ADD COLUMN \`commercial_note\` text` },
    { name: 'launch_meta', ddl: `ALTER TABLE \`client_proposals\` ADD COLUMN \`launch_meta\` text` },
  ]
  for (const col of scalarColumns) {
    try {
      await db.run(sql.raw(col.ddl))
    } catch {
      // Column already exists — safe to ignore on re-runs.
    }
  }

  // -------------------------------------------------------------------------
  // client_proposals_roadmap_cells
  // -------------------------------------------------------------------------
  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_roadmap_cells\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`week\` text NOT NULL,
        \`step\` text NOT NULL,
        \`desc\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_roadmap_cells_order_idx\`
        ON \`client_proposals_roadmap_cells\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_roadmap_cells_parent_id_idx\`
        ON \`client_proposals_roadmap_cells\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }

  // -------------------------------------------------------------------------
  // client_proposals_commercial_phases
  // -------------------------------------------------------------------------
  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_commercial_phases\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`tier\` text NOT NULL,
        \`name\` text NOT NULL,
        \`amount\` text NOT NULL,
        \`amount_sub\` text,
        \`featured\` integer DEFAULT 0,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_commercial_phases_order_idx\`
        ON \`client_proposals_commercial_phases\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_commercial_phases_parent_id_idx\`
        ON \`client_proposals_commercial_phases\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }

  // -------------------------------------------------------------------------
  // client_proposals_commercial_phases_features  (nested array)
  // -------------------------------------------------------------------------
  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_commercial_phases_features\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` text NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`item\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals_commercial_phases\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_commercial_phases_features_order_idx\`
        ON \`client_proposals_commercial_phases_features\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_commercial_phases_features_parent_id_idx\`
        ON \`client_proposals_commercial_phases_features\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }

  // -------------------------------------------------------------------------
  // client_proposals_launch_steps
  // -------------------------------------------------------------------------
  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_launch_steps\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`step_label\` text NOT NULL,
        \`title\` text NOT NULL,
        \`body\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_launch_steps_order_idx\`
        ON \`client_proposals_launch_steps\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_launch_steps_parent_id_idx\`
        ON \`client_proposals_launch_steps\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }

  // -------------------------------------------------------------------------
  // client_proposals_launch_blocks
  // -------------------------------------------------------------------------
  try {
    await db.run(sql`
      CREATE TABLE \`client_proposals_launch_blocks\` (
        \`_order\` integer NOT NULL,
        \`_parent_id\` integer NOT NULL,
        \`id\` text PRIMARY KEY NOT NULL,
        \`tag\` text NOT NULL,
        \`title\` text NOT NULL,
        \`body\` text NOT NULL,
        FOREIGN KEY (\`_parent_id\`) REFERENCES \`client_proposals\`(\`id\`)
          ON UPDATE no action ON DELETE cascade
      );
    `)
  } catch {
    // Table already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_launch_blocks_order_idx\`
        ON \`client_proposals_launch_blocks\` (\`_order\`);
    `)
  } catch {
    // Index already exists.
  }
  try {
    await db.run(sql`
      CREATE INDEX \`client_proposals_launch_blocks_parent_id_idx\`
        ON \`client_proposals_launch_blocks\` (\`_parent_id\`);
    `)
  } catch {
    // Index already exists.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: leave tables in place on rollback.
}
