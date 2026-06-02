import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds a `logo` upload field to clients (FK → media). Shown as the avatar in
 * the Clients admin list view, falling back to a coloured initial when empty.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(
      sql`ALTER TABLE \`clients\` ADD \`logo_id\` integer REFERENCES \`media\`(\`id\`) ON DELETE set null;`,
    );
  } catch {
    // Column may already exist on pushed/dev databases.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: nullable FK is safe to leave in place.
}
