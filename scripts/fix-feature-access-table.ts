/**
 * Drops and recreates `users_feature_access` with the correct schema for
 * Payload's `select hasMany` field type.
 *
 *   order     integer
 *   parent_id integer (FK -> users.id)
 *   id        integer PK autoincrement
 *   value     text
 *
 * NOTE: writes to whatever DATABASE_URL points at — currently prod Turso.
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
  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  // Back up existing rows (if any)
  let existing: any[] = [];
  try {
    const res = await client.execute("SELECT * FROM users_feature_access");
    existing = res.rows as any[];
    console.log(`Backing up ${existing.length} existing rows.`);
  } catch (_e) {
    console.log("(no existing table)");
  }

  // Drop indexes + table
  await client.execute("DROP INDEX IF EXISTS users_feature_access_order_idx");
  await client.execute("DROP INDEX IF EXISTS users_feature_access_parent_idx");
  await client.execute(
    "DROP INDEX IF EXISTS users_feature_access_parent_id_idx",
  );
  await client.execute("DROP TABLE IF EXISTS users_feature_access");

  // Create with correct select-hasMany schema
  await client.execute(`
    CREATE TABLE users_feature_access (
      \`order\` integer NOT NULL,
      parent_id integer NOT NULL,
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      value text,
      FOREIGN KEY (parent_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
    )
  `);
  await client.execute(
    "CREATE INDEX users_feature_access_order_idx ON users_feature_access (`order`)",
  );
  await client.execute(
    "CREATE INDEX users_feature_access_parent_id_idx ON users_feature_access (parent_id)",
  );
  console.log("Recreated table with correct schema.");

  // Re-insert rows. Best-effort: read whatever columns existed.
  for (const r of existing) {
    const order = r.order ?? r._order ?? 1;
    const parentId = r.parent_id ?? r._parent_id;
    const value = r.value;
    if (parentId == null || !value) continue;
    await client.execute({
      sql: "INSERT INTO users_feature_access (`order`, parent_id, value) VALUES (?, ?, ?)",
      args: [Number(order), Number(parentId), String(value)],
    });
    console.log(`  Re-inserted: parent=${parentId} value=${value}`);
  }

  // If nothing was re-inserted but the test user (id=2) exists, restore the
  // expected blog-posts + blog-prompts feature access.
  if (existing.length === 0) {
    const userExists = await client.execute(
      "SELECT id FROM users WHERE id = 2",
    );
    if (userExists.rows.length === 1) {
      await client.execute({
        sql: "INSERT INTO users_feature_access (`order`, parent_id, value) VALUES (?, ?, ?)",
        args: [1, 2, "blog-posts"],
      });
      await client.execute({
        sql: "INSERT INTO users_feature_access (`order`, parent_id, value) VALUES (?, ?, ?)",
        args: [2, 2, "blog-prompts"],
      });
      console.log(
        "  Restored test-user feature access: blog-posts, blog-prompts",
      );
    }
  }

  // Verify
  const after = await client.execute(
    "SELECT * FROM users_feature_access ORDER BY parent_id, `order`",
  );
  console.log("\nFinal rows:");
  for (const r of after.rows) console.log("  ", JSON.stringify(r));

  console.log("\n✓ Done");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
