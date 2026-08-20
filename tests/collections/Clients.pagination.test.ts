import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { Clients } from "@/collections/Clients";
import { runMigrations } from "@/lib/run-migrations";

/**
 * The clients list must page at 20 rows.
 *
 * Two halves have to hold together or the change is invisible:
 *  1. `admin.pagination` on the collection (covers users with no saved list
 *     preference, and puts 20 in the Per Page menu — Payload's stock options
 *     are 5/10/25/50/100 and skip it).
 *  2. The preference rewrite in the migration sweep (covers every user who has
 *     already opened the list and carries a stored `limit`, which beats config).
 */

const MARKER = "20260814_133000_add_landing_lock_relations";

let client: Client;

const payloadWith = (c: Client) => ({ db: { client: c } }) as never;

const prefRows = async (c: Client) =>
  (
    await c.execute("SELECT `key`, `value` FROM `payload_preferences` ORDER BY `id`")
  ).rows as unknown as Array<{ key: string; value: string }>;

describe("clients list pagination config", () => {
  it("defaults to 20 per page", () => {
    expect(Clients.admin?.pagination?.defaultLimit).toBe(20);
  });

  it("offers 20 in the Per Page menu", () => {
    expect(Clients.admin?.pagination?.limits).toContain(20);
  });

  it("keeps every offered limit a positive number", () => {
    const limits = Clients.admin?.pagination?.limits ?? [];
    expect(limits.length).toBeGreaterThan(0);
    for (const limit of limits) expect(limit).toBeGreaterThan(0);
  });
});

describe("clients list per-page preference rewrite", () => {
  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    // Marker present, so only the pre-short-circuit repairs run — mirroring
    // production rather than a from-scratch sweep.
    await client.batch(
      [
        "CREATE TABLE `payload_migrations` (`name` text, `batch` integer, `created_at` text, `updated_at` text)",
        `INSERT INTO \`payload_migrations\` (\`name\`, \`batch\`) VALUES ('${MARKER}', 1)`,
        "CREATE TABLE `landing_events` (`id` integer PRIMARY KEY NOT NULL, `market` text)",
        "CREATE TABLE `landing_domains` (`id` integer PRIMARY KEY NOT NULL)",
        "CREATE TABLE `payload_preferences` (`id` integer PRIMARY KEY NOT NULL, `key` text, `value` text)",
      ],
      "write",
    );
  });

  it("rewrites a stored limit of 10 to 20", async () => {
    await client.execute(
      "INSERT INTO `payload_preferences` (`key`, `value`) VALUES " +
        `('collection-clients', '{"editViewType":"default","limit":10}')`,
    );

    const results = await runMigrations(payloadWith(client));

    expect(results).toContainEqual({ label: "payload_preferences.clients_list_limit_20", status: "ok" });
    const [row] = await prefRows(client);
    expect(JSON.parse(row.value)).toEqual({ editViewType: "default", limit: 20 });
  });

  it("leaves other collections' preferences and column-order state alone", async () => {
    const proposals = '{"editViewType":"default","limit":25,"columns":[{"accessor":"slug"}]}';
    const noLimit = '{"editViewType":"default"}';
    await client.batch(
      [
        `INSERT INTO \`payload_preferences\` (\`key\`, \`value\`) VALUES ('collection-client-proposals', '${proposals}')`,
        `INSERT INTO \`payload_preferences\` (\`key\`, \`value\`) VALUES ('collection-clients', '${noLimit}')`,
      ],
      "write",
    );

    await runMigrations(payloadWith(client));

    const rows = await prefRows(client);
    expect(JSON.parse(rows[0].value)).toEqual(JSON.parse(proposals));
    // No stored limit → nothing to rewrite; config's defaultLimit of 20 applies.
    expect(JSON.parse(rows[1].value)).toEqual(JSON.parse(noLimit));
  });

  it("is idempotent and survives malformed preference JSON", async () => {
    await client.batch(
      [
        "INSERT INTO `payload_preferences` (`key`, `value`) VALUES " +
          `('collection-clients', '{"limit":20}')`,
        "INSERT INTO `payload_preferences` (`key`, `value`) VALUES ('collection-clients', 'not-json')",
      ],
      "write",
    );

    await runMigrations(payloadWith(client));
    const first = await prefRows(client);
    await runMigrations(payloadWith(client));
    const second = await prefRows(client);

    expect(first.map((r) => r.value)).toEqual(['{"limit":20}', "not-json"]);
    expect(second).toEqual(first);
  });
});
