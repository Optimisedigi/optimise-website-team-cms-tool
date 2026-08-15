#!/usr/bin/env node
/**
 * Build a throwaway landing database for the live ingestion test.
 *
 * Two steps, in order:
 *
 *   1. Boot Payload with push enabled, which creates every collection table.
 *   2. Run the landing migrations, so the test exercises the same migration
 *      path production uses rather than a schema that only exists in tests.
 *
 * Between them it creates `payload_migrations` by hand: a database built by
 * push mode has all the collection tables but not that bookkeeping table, and
 * the migration runner reads it before doing anything.
 *
 * Lives in the CMS repository because it imports the CMS's own config and
 * migration runner, which cannot be resolved from anywhere else.
 *
 * Refuses to touch anything but a local file, for the same reason the seeder
 * does: an earlier ad-hoc script wrote thousands of rows into production.
 *
 * Usage:
 *   DATABASE_URL=file:/tmp/scratch.db node scripts/prepare-e2e-database.mjs
 */

import { createClient } from "@libsql/client";
import { isLocalFileUrl, redact } from "../src/lib/dev-database-guard.ts";

const url = process.env.DATABASE_URL ?? "";

if (!isLocalFileUrl(url)) {
  console.error(
    [
      "Refusing to prepare a database that is not a local file.",
      `DATABASE_URL is ${redact(url) || "(empty)"}.`,
      "This script drops and rebuilds schema, so it may only ever point at a scratch file.",
    ].join("\n")
  );
  process.exit(1);
}

// Push mode creates the collection tables, and it only runs under
// NODE_ENV=development. Under production Payload skips it silently and leaves
// an empty database, which then fails much later as a confusing migration
// error, so the value is forced here rather than inherited.
process.env.NODE_ENV = "development";
process.env.DISABLE_DB_PUSH = "";
const { getPayload } = await import("payload");
const config = (await import("../src/payload.config.ts")).default;
await getPayload({ config });

const client = createClient({ url });

/**
 * getPayload resolves before push has finished writing every table, so the
 * schema has to be waited for rather than assumed. Without this the migrations
 * below fail against tables that are still being created, which reads as a
 * migration bug rather than a race.
 */
const REQUIRED_TABLES = ["clients", "landing_properties", "landing_events"];
const deadline = Date.now() + 120_000;
let missing = REQUIRED_TABLES;

while (Date.now() < deadline) {
  const present = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  );
  const names = new Set(present.rows.map((row) => String(row.name)));
  missing = REQUIRED_TABLES.filter((table) => !names.has(table));
  if (missing.length === 0) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (missing.length > 0) {
  console.error(`schema push did not create: ${missing.join(", ")}`);
  process.exit(1);
}

await client.execute(`CREATE TABLE IF NOT EXISTS \`payload_migrations\` (
  \`id\` integer PRIMARY KEY NOT NULL,
  \`name\` text,
  \`batch\` numeric,
  \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`);

const { runMigrations } = await import("../src/lib/run-migrations.ts");
const results = await runMigrations({ db: { client } });
const failed = results.filter((result) => result.status === "error");

if (failed.length > 0) {
  console.error("migrations failed:");
  for (const failure of failed.slice(0, 5)) {
    console.error(`  ${failure.label}: ${String(failure.message).slice(0, 160)}`);
  }
  process.exit(1);
}

console.log(`prepared ${url} (${results.length} migration statements, 0 errors)`);
process.exit(0);
