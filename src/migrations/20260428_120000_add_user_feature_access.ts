import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds the `featureAccess` multi-select field on the Users collection.
 *
 * Payload's Drizzle adapter stores `select hasMany` fields in a child table
 * with this exact schema (different from array/group hasMany — those use
 * `_order` / `_parent_id` / text id):
 *
 *   `users_feature_access` (
 *     order      integer            (no underscore for select hasMany)
 *     parent_id  integer            -> users.id (FK, cascade)
 *     id         integer  PRIMARY KEY AUTOINCREMENT
 *     value      text               (the selected option value)
 *   )
 *
 * The values are the collection slugs the user is allowed to access.
 * Admins ignore this list (full access in code).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS \`users_feature_access\` (
      \`order\` integer NOT NULL,
      \`parent_id\` integer NOT NULL,
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`value\` text,
      FOREIGN KEY (\`parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
  `);

  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`users_feature_access_order_idx\`
    ON \`users_feature_access\` (\`order\`);
  `);
  await db.run(sql`
    CREATE INDEX IF NOT EXISTS \`users_feature_access_parent_id_idx\`
    ON \`users_feature_access\` (\`parent_id\`);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE IF EXISTS \`users_feature_access\`;`);
}
