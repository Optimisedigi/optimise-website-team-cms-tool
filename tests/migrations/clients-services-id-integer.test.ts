import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/lib/run-migrations";
import { up as fixClientsServicesIdInteger } from "@/migrations/20260819_130000_fix_clients_services_id_integer";

/**
 * Regression guard for the "Something went wrong." failure when saving a client
 * with any service selected.
 *
 * `services` is a hasMany **select** field, so the adapter builds its side table
 * with an `id integer PRIMARY KEY` that inserts omit and SQLite's rowid alias
 * fills. A migration once rebuilt it as `id text PRIMARY KEY NOT NULL`, which
 * has no default, so every insert wrote NULL and hit
 * `NOT NULL constraint failed: clients_services.id`.
 */

const MARKER = "20260814_133000_add_landing_lock_relations";

const BROKEN_TABLE =
  "CREATE TABLE `clients_services` (`order` integer NOT NULL, `parent_id` integer NOT NULL, " +
  "`value` text, `id` text PRIMARY KEY NOT NULL, " +
  "FOREIGN KEY (`parent_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade)";

const HEALTHY_TABLE =
  "CREATE TABLE `clients_services` (`order` integer NOT NULL, `parent_id` integer NOT NULL, " +
  "`value` text, `id` integer PRIMARY KEY NOT NULL, " +
  "FOREIGN KEY (`parent_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade)";

let client: Client;

/** Payload stub exposing only what runMigrations touches. */
const payloadWith = (c: Client) => ({ db: { client: c } }) as never;

async function idColumnType(c: Client): Promise<string> {
  const info = await c.execute("PRAGMA table_info(`clients_services`)");
  const row = (info.rows as Array<Record<string, unknown>>).find((r) => r.name === "id");
  return String(row?.type ?? "").toLowerCase();
}

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  // Satisfy the marker short-circuit so only the repair runs, mirroring the
  // production database rather than a from-scratch sweep.
  await client.batch(
    [
      "CREATE TABLE `payload_migrations` (`name` text, `batch` integer, `created_at` text, `updated_at` text)",
      `INSERT INTO \`payload_migrations\` (\`name\`, \`batch\`) VALUES ('${MARKER}', 1)`,
      "CREATE TABLE `landing_events` (`id` integer PRIMARY KEY NOT NULL, `market` text)",
      "CREATE TABLE `landing_domains` (`id` integer PRIMARY KEY NOT NULL)",
      "CREATE TABLE `clients` (`id` integer PRIMARY KEY NOT NULL, `name` text)",
      "INSERT INTO `clients` (`id`, `name`) VALUES (1, 'Acme'), (2, 'Globex')",
    ],
    "write",
  );
});

describe("clients_services id repair", () => {
  it("rebuilds a text id as integer and keeps every row", async () => {
    await client.execute(BROKEN_TABLE);
    await client.batch(
      [
        "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 1, 'seo', 'txt-a')",
        "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (1, 1, 'google_ads', 'txt-b')",
        "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 2, 'automations', 'txt-c')",
      ],
      "write",
    );

    const results = await runMigrations(payloadWith(client));

    expect(results).toContainEqual({ label: "clients_services.id_integer_repair", status: "ok" });
    expect(await idColumnType(client)).toBe("integer");

    const rows = await client.execute(
      "SELECT `order`, `parent_id`, `value` FROM `clients_services` ORDER BY `parent_id`, `order`",
    );
    expect(rows.rows.map((r) => [r.order, r.parent_id, r.value])).toEqual([
      [0, 1, "seo"],
      [1, 1, "google_ads"],
      [0, 2, "automations"],
    ]);
  });

  it("accepts an insert that omits id, the write that used to fail", async () => {
    await client.execute(BROKEN_TABLE);

    await runMigrations(payloadWith(client));

    await client.execute(
      "INSERT INTO `clients_services` (`order`, `parent_id`, `value`) VALUES (0, 1, 'seo')",
    );
    const rows = await client.execute("SELECT `id` FROM `clients_services`");
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0].id)).toBeGreaterThan(0);
  });

  it("runs ahead of the marker short-circuit that returns early in production", async () => {
    await client.execute(BROKEN_TABLE);

    const results = await runMigrations(payloadWith(client));

    // Repair before the early return — proof it is not stranded behind it.
    // (Other pre-short-circuit steps may sit between the two labels.)
    const labels = results.map((r) => r.label);
    expect(labels.indexOf("clients_services.id_integer_repair")).toBe(0);
    expect(labels).toContain(`mark_migration:${MARKER}`);
    expect(labels[labels.length - 1]).toBe(`mark_migration:${MARKER}`);
  });

  it("is a no-op once the column is already integer", async () => {
    await client.execute(HEALTHY_TABLE);
    await client.execute(
      "INSERT INTO `clients_services` (`order`, `parent_id`, `value`) VALUES (0, 1, 'seo')",
    );

    const results = await runMigrations(payloadWith(client));

    expect(results).toContainEqual({
      label: "clients_services.id_integer_repair",
      status: "skip",
      message: "already integer",
    });
    const rows = await client.execute("SELECT `id` FROM `clients_services`");
    expect(rows.rows).toHaveLength(1);
  });

  it("skips cleanly when the table does not exist yet", async () => {
    const results = await runMigrations(payloadWith(client));

    expect(results).toContainEqual({
      label: "clients_services.id_integer_repair",
      status: "skip",
      message: "table not present",
    });
  });

  it("recovers when an earlier half-finished run stranded the scratch table", async () => {
    await client.execute(BROKEN_TABLE);
    await client.execute(
      "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 1, 'seo', 'txt-a')",
    );
    // Leftover from a run that died between CREATE and RENAME.
    await client.execute("CREATE TABLE `clients_services__idfix` (`bogus` text)");

    const results = await runMigrations(payloadWith(client));

    expect(results).toContainEqual({ label: "clients_services.id_integer_repair", status: "ok" });
    expect(await idColumnType(client)).toBe("integer");
    const rows = await client.execute("SELECT `value` FROM `clients_services`");
    expect(rows.rows.map((r) => r.value)).toEqual(["seo"]);
  });
});

/**
 * The registry migration is a second, independent path to the same repair: it
 * runs via `/api/migrate/payload`, not the raw sweep. It is exercised here
 * through a real Drizzle libSQL instance — the same object the sqlite adapter
 * hands migrations as `db` — rather than a stub, because the guard depends on
 * `db.run(PRAGMA table_info(...))` actually returning `.rows`.
 */
describe("20260819_130000_fix_clients_services_id_integer up()", () => {
  /** Real Drizzle instance over the in-memory DB, cast to the migration's args. */
  const migrationArgs = (c: Client) => ({ db: drizzle(c) }) as never;

  it("rebuilds a broken text id as integer and keeps every row", async () => {
    await client.execute(BROKEN_TABLE);
    await client.batch(
      [
        "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 1, 'seo', 'txt-a')",
        "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (1, 1, 'google_ads', 'txt-b')",
        "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 2, 'automations', 'txt-c')",
      ],
      "write",
    );

    await fixClientsServicesIdInteger(migrationArgs(client));

    expect(await idColumnType(client)).toBe("integer");
    const rows = await client.execute(
      "SELECT `order`, `parent_id`, `value` FROM `clients_services` ORDER BY `parent_id`, `order`",
    );
    expect(rows.rows.map((r) => [r.order, r.parent_id, r.value])).toEqual([
      [0, 1, "seo"],
      [1, 1, "google_ads"],
      [0, 2, "automations"],
    ]);

    // The write that used to fail with NOT NULL constraint failed.
    await client.execute(
      "INSERT INTO `clients_services` (`order`, `parent_id`, `value`) VALUES (1, 2, 'seo')",
    );
    const after = await client.execute("SELECT COUNT(*) AS n FROM `clients_services`");
    expect(Number(after.rows[0].n)).toBe(4);
  });

  it("leaves an already-correct integer schema untouched", async () => {
    await client.execute(HEALTHY_TABLE);
    // Explicit, non-contiguous ids: a needless rebuild would renumber these to
    // 1 and 2, so this asserts the guard really short-circuits rather than
    // rebuilding and happening to land on the same values.
    await client.execute(
      "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 1, 'seo', 5), (1, 1, 'google_ads', 9)",
    );

    await fixClientsServicesIdInteger(migrationArgs(client));

    expect(await idColumnType(client)).toBe("integer");
    const after = await client.execute("SELECT `id`, `value` FROM `clients_services` ORDER BY `id`");
    expect(after.rows.map((r) => [Number(r.id), r.value])).toEqual([
      [5, "seo"],
      [9, "google_ads"],
    ]);
  });

  it("is idempotent across repeated runs", async () => {
    await client.execute(BROKEN_TABLE);
    await client.execute(
      "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 1, 'seo', 'txt-a')",
    );

    await fixClientsServicesIdInteger(migrationArgs(client));
    const first = await client.execute("SELECT `id`, `value` FROM `clients_services`");
    await fixClientsServicesIdInteger(migrationArgs(client));
    const second = await client.execute("SELECT `id`, `value` FROM `clients_services`");

    expect(await idColumnType(client)).toBe("integer");
    expect(second.rows.map((r) => [r.id, r.value])).toEqual(first.rows.map((r) => [r.id, r.value]));
    // No orphaned scratch table left behind.
    const scratch = await client.execute(
      "SELECT `name` FROM `sqlite_master` WHERE `name` = 'clients_services__idfix'",
    );
    expect(scratch.rows).toHaveLength(0);
  });

  it("does not throw when the table is absent", async () => {
    await expect(fixClientsServicesIdInteger(migrationArgs(client))).resolves.toBeUndefined();
  });

  it("recovers when an earlier half-finished run stranded the scratch table", async () => {
    await client.execute(BROKEN_TABLE);
    await client.execute(
      "INSERT INTO `clients_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 1, 'seo', 'txt-a')",
    );
    await client.execute("CREATE TABLE `clients_services__idfix` (`bogus` text)");

    await fixClientsServicesIdInteger(migrationArgs(client));

    expect(await idColumnType(client)).toBe("integer");
    const rows = await client.execute("SELECT `value` FROM `clients_services`");
    expect(rows.rows.map((r) => r.value)).toEqual(["seo"]);
  });
});
