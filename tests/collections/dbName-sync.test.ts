import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Prevents the dbName ↔ migration mismatch that took down the Clients
 * collection in production (2026-02-27).
 *
 * When a Payload field uses `dbName`, the migration SQL must create the
 * table using that exact name — NOT the auto-generated collection_field name.
 * Payload queries sub-tables by dbName, so a mismatch causes 500 errors on
 * every query to the parent collection.
 */

// Recursively find all dbName values in a fields array
function findDbNames(fields: any[], parentSlug: string, fieldPath = ""): Array<{ slug: string; path: string; dbName: string }> {
  const results: Array<{ slug: string; path: string; dbName: string }> = [];

  for (const field of fields) {
    const currentPath = fieldPath ? `${fieldPath}.${field.name || field.type}` : (field.name || field.type);

    if (field.dbName) {
      results.push({ slug: parentSlug, path: currentPath, dbName: field.dbName });
    }

    // Recurse into nested fields
    if (field.fields && Array.isArray(field.fields)) {
      results.push(...findDbNames(field.fields, parentSlug, currentPath));
    }
    if (field.tabs && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        if (tab.fields) {
          results.push(...findDbNames(tab.fields, parentSlug, fieldPath));
        }
      }
    }
  }

  return results;
}

// Dynamically import all collection configs
async function getAllCollections() {
  const collectionsDir = path.resolve(__dirname, "../../src/collections");
  const files = fs.readdirSync(collectionsDir).filter((f) => f.endsWith(".ts") && !f.startsWith("_"));
  const collections: any[] = [];

  for (const file of files) {
    try {
      const mod = await import(path.join(collectionsDir, file));
      const config = Object.values(mod).find((v: any) => v?.slug && v?.fields);
      if (config) collections.push(config);
    } catch {
      // skip files that can't be imported in test context
    }
  }

  return collections;
}

describe("dbName ↔ migration sync", () => {
  it("every dbName override must have a matching CREATE TABLE in the migration", async () => {
    // Migration SQL now lives in two files: the shared `runMigrations` helper
    // (called from both `POST /api/migrate` and Payload's `onInit`), plus the
    // legacy GET handler in the route file which still has its own statement
    // list. Concatenate both so dbName lookups find their CREATE TABLE in
    // either place.
    const routePath = path.resolve(
      __dirname,
      "../../src/app/(frontend)/api/migrate/route.ts",
    );
    const runMigrationsPath = path.resolve(
      __dirname,
      "../../src/lib/run-migrations.ts",
    );
    const migrationSql =
      fs.readFileSync(routePath, "utf-8") +
      "\n" +
      fs.readFileSync(runMigrationsPath, "utf-8");

    const collections = await getAllCollections();
    const allDbNames = collections.flatMap((c) => findDbNames(c.fields, c.slug));

    // Must have found the known dbNames (sanity check)
    expect(allDbNames.length).toBeGreaterThan(0);

    for (const { slug, path: fieldPath, dbName } of allDbNames) {
      // The migration must contain:
      // 1. A CREATE TABLE with the exact dbName (for array/table-level dbName), OR
      // 2. A RENAME TO that dbName, OR
      // 3. The dbName as a column within a CREATE TABLE (for column-level dbName)
      // Note: template literals in the source use \` (escaped backtick) while
      // regular strings use plain backticks, so check both patterns
      const hasCreate = migrationSql.includes(`CREATE TABLE IF NOT EXISTS \`${dbName}\``) ||
        migrationSql.includes(`CREATE TABLE IF NOT EXISTS \\\`${dbName}\\\``);
      const hasRename = migrationSql.includes(`RENAME TO \`${dbName}\``) ||
        migrationSql.includes(`RENAME TO \\\`${dbName}\\\``);
      // Column-level dbName: the name appears as a column definition inside a CREATE TABLE
      const hasColumn = migrationSql.includes(`\`${dbName}\``) ||
        migrationSql.includes(`\\\`${dbName}\\\``);

      expect(
        hasCreate || hasRename || hasColumn,
        `Collection "${slug}" field "${fieldPath}" has dbName="${dbName}" but the migration has no CREATE TABLE, RENAME TO, or column definition for \`${dbName}\`. ` +
        `This will cause a 500 error on every query to the ${slug} collection.`,
      ).toBe(true);
    }
  });
});
