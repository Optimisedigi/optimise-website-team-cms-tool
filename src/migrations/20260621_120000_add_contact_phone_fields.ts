import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-sqlite";

/**
 * Adds phone fields to client contacts:
 *  - `clients.contact_phone` — phone for the primary contact (Contact Name /
 *    Email / Phone row in the Contacts & Managers section).
 *  - `clients_additional_contacts.phone` — phone column for each additional
 *    contact row (Name / Job Title / Email / Phone).
 *
 * Both are nullable text; existing rows keep NULL. Wrapped in try/catch so
 * re-running against an already-migrated/pushed DB is a no-op.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  try {
    await db.run(sql`ALTER TABLE \`clients\` ADD \`contact_phone\` text;`);
  } catch {
    // Column may already exist.
  }
  try {
    await db.run(sql`ALTER TABLE \`clients_additional_contacts\` ADD \`phone\` text;`);
  } catch {
    // Column may already exist.
  }
}

export async function down(_: MigrateDownArgs): Promise<void> {
  // No-op: nullable columns are safe to leave in place.
}
