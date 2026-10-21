import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/lib/run-migrations";
import { up as addEstimateAdjustments } from "@/migrations/20261024_120000_estimate_adjustments";

/**
 * The estimate-adjustments table must reach production through /api/migrate, which
 * short-circuits on the schema marker. Guard that it runs before that skip,
 * is idempotent, and accepts the insert Payload makes.
 */

const MARKER = "20260814_133000_add_landing_lock_relations";

let client: Client;
const payloadWith = (c: Client) => ({ db: { client: c } }) as never;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  // Mirror production: marker present, so most of the sweep is skipped.
  await client.batch(
    [
      "CREATE TABLE `payload_migrations` (`name` text, `batch` integer, `created_at` text, `updated_at` text)",
      `INSERT INTO \`payload_migrations\` (\`name\`, \`batch\`) VALUES ('${MARKER}', 1)`,
      "CREATE TABLE `landing_events` (`id` integer PRIMARY KEY NOT NULL, `market` text)",
      "CREATE TABLE `landing_domains` (`id` integer PRIMARY KEY NOT NULL)",
      "CREATE TABLE `users` (`id` integer PRIMARY KEY NOT NULL)",
    ],
    "write",
  );
});

describe("estimate_adjustments migration", () => {
  it("creates the table on a production-shaped database, marks the migration, and is idempotent", async () => {
    await runMigrations(payloadWith(client));
    await runMigrations(payloadWith(client));

    await client.execute(
      "INSERT INTO `estimate_adjustments` (`month`, `kind`, `amount`, `description`, `account`) VALUES ('2026-11', 'cost', 1200, 'Freelancer', 'Contractors')",
    );
    const rows = await client.execute("SELECT `amount`, `month` FROM `estimate_adjustments`");
    expect(rows.rows).toHaveLength(1);

    const marked = await client.execute("SELECT COUNT(*) AS n FROM `payload_migrations` WHERE `name` = '20261024_120000_estimate_adjustments'");
    expect(Number(marked.rows[0]?.n)).toBe(1);

    const indexes = await client.execute("PRAGMA index_list(`estimate_adjustments`)");
    expect((indexes.rows as Array<Record<string, unknown>>).map((r) => String(r.name))).toContain("estimate_adjustments_month_idx");
  });

  it("can run twice via the Payload migration without error and keeps existing rows", async () => {
    const db = drizzle(client) as never;
    await addEstimateAdjustments({ db } as never);
    await client.execute("INSERT INTO `estimate_adjustments` (`month`, `kind`, `amount`, `description`) VALUES ('2026-12', 'invoiced', 10, 'KEEP')");
    await addEstimateAdjustments({ db } as never);

    const rows = await client.execute("SELECT `description` FROM `estimate_adjustments`");
    expect(rows.rows.map((r) => r.description)).toEqual(["KEEP"]);
  });
});
