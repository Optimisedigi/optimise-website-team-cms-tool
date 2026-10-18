import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/lib/run-migrations";
import { up as addBankReceipts } from "@/migrations/20261017_120000_bank_receipts";

/**
 * The bank-receipts table must reach production through /api/migrate, which
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

describe("bank_receipts migration", () => {
  it("creates the table on a production-shaped database, marks the migration, and is idempotent", async () => {
    await runMigrations(payloadWith(client));
    await runMigrations(payloadWith(client));

    await client.execute(
      "INSERT INTO `bank_receipts` (`date`, `amount`, `description`, `source`, `month`, `year`, `import_batch`) VALUES ('2026-10-03T00:00:00.000Z', 5000, 'ACME', 'csv_import', '2026-10', 2026, 'csv_1')",
    );
    const rows = await client.execute("SELECT `amount`, `month` FROM `bank_receipts`");
    expect(rows.rows).toHaveLength(1);

    const marked = await client.execute("SELECT COUNT(*) AS n FROM `payload_migrations` WHERE `name` = '20261017_120000_bank_receipts'");
    expect(Number(marked.rows[0]?.n)).toBe(1);

    const indexes = await client.execute("PRAGMA index_list(`bank_receipts`)");
    expect((indexes.rows as Array<Record<string, unknown>>).map((r) => String(r.name))).toContain("bank_receipts_month_idx");
  });

  it("can run twice via the Payload migration without error and keeps existing rows", async () => {
    const db = drizzle(client) as never;
    await addBankReceipts({ db } as never);
    await client.execute("INSERT INTO `bank_receipts` (`date`, `amount`, `description`) VALUES ('2026-10-03T00:00:00.000Z', 10, 'KEEP')");
    await addBankReceipts({ db } as never);

    const rows = await client.execute("SELECT `description` FROM `bank_receipts`");
    expect(rows.rows.map((r) => r.description)).toEqual(["KEEP"]);
  });
});
