/**
 * Runs the 20260429_120000_add_permission_profiles migration directly
 * against the configured DATABASE_URL (currently prod Turso).
 *
 * Idempotent — uses CREATE TABLE / INDEX IF NOT EXISTS and tolerates the
 * `ALTER TABLE ADD COLUMN` failing if the column already exists.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) {
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

async function main() {
  const db = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  console.log(`DB: ${process.env.DATABASE_URL}\n`);

  const results: string[] = [];

  async function run(label: string, sql: string) {
    try {
      await db.execute(sql);
      results.push(`OK    ${label}`);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("already exists") || msg.includes("duplicate column")) {
        results.push(`SKIP  ${label}  (already exists)`);
      } else {
        results.push(`ERROR ${label}: ${msg}`);
      }
    }
  }

  await run(
    "permission_profiles",
    `CREATE TABLE IF NOT EXISTS permission_profiles (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       name text NOT NULL,
       description text,
       updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
       created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
     )`,
  );
  await run(
    "permission_profiles_name_idx",
    "CREATE UNIQUE INDEX IF NOT EXISTS permission_profiles_name_idx ON permission_profiles (name)",
  );

  await run(
    "permission_profiles_features",
    `CREATE TABLE IF NOT EXISTS permission_profiles_features (
       \`order\` integer NOT NULL,
       parent_id integer NOT NULL,
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       value text,
       FOREIGN KEY (parent_id) REFERENCES permission_profiles(id) ON UPDATE no action ON DELETE cascade
     )`,
  );
  await run(
    "permission_profiles_features_order_idx",
    "CREATE INDEX IF NOT EXISTS permission_profiles_features_order_idx ON permission_profiles_features (`order`)",
  );
  await run(
    "permission_profiles_features_parent_id_idx",
    "CREATE INDEX IF NOT EXISTS permission_profiles_features_parent_id_idx ON permission_profiles_features (parent_id)",
  );

  await run(
    "users_rels",
    `CREATE TABLE IF NOT EXISTS users_rels (
       id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
       \`order\` integer,
       parent_id integer,
       path text NOT NULL,
       permission_profiles_id integer,
       FOREIGN KEY (parent_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
       FOREIGN KEY (permission_profiles_id) REFERENCES permission_profiles(id) ON UPDATE no action ON DELETE cascade
     )`,
  );
  await run("users_rels_order_idx", "CREATE INDEX IF NOT EXISTS users_rels_order_idx ON users_rels (`order`)");
  await run("users_rels_parent_idx", "CREATE INDEX IF NOT EXISTS users_rels_parent_idx ON users_rels (parent_id)");
  await run("users_rels_path_idx", "CREATE INDEX IF NOT EXISTS users_rels_path_idx ON users_rels (path)");
  await run(
    "users_rels_permission_profiles_id_idx",
    "CREATE INDEX IF NOT EXISTS users_rels_permission_profiles_id_idx ON users_rels (permission_profiles_id)",
  );

  await run(
    "payload_locked_documents_rels.permission_profiles_id",
    "ALTER TABLE payload_locked_documents_rels ADD COLUMN permission_profiles_id integer REFERENCES permission_profiles(id) ON UPDATE no action ON DELETE cascade",
  );

  for (const r of results) console.log(r);
  console.log("\n✓ Done");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
