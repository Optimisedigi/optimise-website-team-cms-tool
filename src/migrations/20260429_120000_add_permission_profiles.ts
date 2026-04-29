import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the Permission Profiles collection + the Users -> PermissionProfiles
 * hasMany relationship.
 *
 * Schema:
 *   permission_profiles (
 *     id              integer  PK autoincrement
 *     name            text     NOT NULL UNIQUE
 *     description     text
 *     updated_at      text     NOT NULL
 *     created_at      text     NOT NULL
 *   )
 *
 *   permission_profiles_features (  -- select hasMany child table
 *     order           integer  NOT NULL
 *     parent_id       integer  NOT NULL  (FK -> permission_profiles.id)
 *     id              integer  PK autoincrement
 *     value           text
 *   )
 *
 *   users_rels (  -- relationship hasMany child for users.permissionProfiles
 *     id                       integer  PK autoincrement
 *     order                    integer
 *     parent_id                integer  (FK -> users.id)
 *     path                     text     NOT NULL  ('permissionProfiles')
 *     permission_profiles_id   integer  (FK -> permission_profiles.id)
 *   )
 *
 * Also adds `permission_profiles_id` to payload_locked_documents_rels so the
 * locking system works for the new collection.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1. permission_profiles
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`permission_profiles\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`name\` text NOT NULL,
      \`description\` text,
      \`updated_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
      \`created_at\` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
    );
  `);
  await db.run(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS \`permission_profiles_name_idx\`
    ON \`permission_profiles\` (\`name\`);
  `);

  // 2. permission_profiles_features (select hasMany)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`permission_profiles_features\` (
      \`order\` integer NOT NULL,
      \`parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`value\` text,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`permission_profiles\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`permission_profiles_features_order_idx\`
    ON \`permission_profiles_features\` (\`order\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`permission_profiles_features_parent_id_idx\`
    ON \`permission_profiles_features\` (\`parent_id\`);
  `);

  // 3. users_rels (relationship hasMany for users.permissionProfiles)
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`users_rels\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`order\` integer,
      \`parent_id\` integer,
      \`path\` text NOT NULL,
      \`permission_profiles_id\` integer,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`permission_profiles_id\`) REFERENCES \`permission_profiles\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`users_rels_order_idx\`
    ON \`users_rels\` (\`order\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`users_rels_parent_idx\`
    ON \`users_rels\` (\`parent_id\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`users_rels_path_idx\`
    ON \`users_rels\` (\`path\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`users_rels_permission_profiles_id_idx\`
    ON \`users_rels\` (\`permission_profiles_id\`);
  `);

  // 4. payload_locked_documents_rels: add column for new collection.
  await db.run(sql`
    ALTER TABLE \`payload_locked_documents_rels\`
    ADD COLUMN \`permission_profiles_id\` integer
    REFERENCES \`permission_profiles\`(\`id\`) ON UPDATE no action ON DELETE cascade;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // SQLite doesn't support DROP COLUMN reliably on older versions; leave the
  // column in payload_locked_documents_rels (harmless once the table is gone).
  await db.run(sql`DROP TABLE IF EXISTS \`users_rels\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`permission_profiles_features\`;`);
  await db.run(sql`DROP TABLE IF EXISTS \`permission_profiles\`;`);
}
