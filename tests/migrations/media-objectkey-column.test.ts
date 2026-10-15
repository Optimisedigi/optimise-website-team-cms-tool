import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/lib/run-migrations";
import { up as fixMediaObjectKey } from "@/migrations/20261015_120000_fix_media_objectkey_column";

/**
 * Regression guard for "Something went wrong." when saving a blog image.
 *
 * Payload 3.90 adds the cloud-storage `_objectKey` field to `media`. The
 * upgrade migration created `_object_key`, but Payload's column is
 * `_objectkey`, so every media insert failed with
 * "table media has no column named _objectkey".
 */

const MARKER = "20260814_133000_add_landing_lock_relations";

let client: Client;
const payloadWith = (c: Client) => ({ db: { client: c } }) as never;

async function mediaColumns(c: Client): Promise<string[]> {
  const info = await c.execute("PRAGMA table_info(`media`)");
  return (info.rows as Array<Record<string, unknown>>).map((row) => String(row.name));
}

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  // Satisfy the marker short-circuit so this mirrors the production database.
  await client.batch(
    [
      "CREATE TABLE `payload_migrations` (`name` text, `batch` integer, `created_at` text, `updated_at` text)",
      `INSERT INTO \`payload_migrations\` (\`name\`, \`batch\`) VALUES ('${MARKER}', 1)`,
      "CREATE TABLE `landing_events` (`id` integer PRIMARY KEY NOT NULL, `market` text)",
      "CREATE TABLE `landing_domains` (`id` integer PRIMARY KEY NOT NULL)",
      "CREATE TABLE `users` (`id` integer PRIMARY KEY NOT NULL)",
      "CREATE TABLE `media` (`id` integer PRIMARY KEY NOT NULL, `alt` text NOT NULL, `_object_key` text)",
      "INSERT INTO `media` (`id`, `alt`, `_object_key`) VALUES (1, 'existing', 'kept-key')",
    ],
    "write",
  );
});

describe("media _objectkey column", () => {
  it("renames the old column in the production runner, keeps values, and accepts Payload's insert", async () => {
    const results = await runMigrations(payloadWith(client));

    expect(results).toContainEqual({ label: "media._objectkey.rename", status: "ok" });
    const columns = await mediaColumns(client);
    expect(columns).toContain("_objectkey");
    expect(columns).not.toContain("_object_key");
    const kept = await client.execute("SELECT `_objectkey` FROM `media` WHERE `id` = 1");
    expect(kept.rows[0]?._objectkey).toBe("kept-key");
    // The write that used to fail.
    await client.execute(`INSERT INTO "media" ("alt", "_objectkey") VALUES ('new upload', NULL)`);
  });

  it("is a no-op in the Payload migration once the column is correct", async () => {
    const db = drizzle(client) as never;
    await fixMediaObjectKey({ db } as never);
    await fixMediaObjectKey({ db } as never);

    const columns = await mediaColumns(client);
    expect(columns.filter((name) => name === "_objectkey")).toHaveLength(1);
    expect(columns).not.toContain("_object_key");
  });
});
