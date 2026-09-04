import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/lib/run-migrations";
import { up as fixSalesLeadsServicesIdInteger } from "@/migrations/20260904_140000_fix_sales_leads_services_id_integer";

const MARKER = "20260814_133000_add_landing_lock_relations";

const BROKEN_TABLE =
  "CREATE TABLE `sales_leads_services` (`order` integer NOT NULL, `parent_id` integer NOT NULL, " +
  "`value` text, `id` text PRIMARY KEY NOT NULL, " +
  "FOREIGN KEY (`parent_id`) REFERENCES `sales_leads`(`id`) ON UPDATE no action ON DELETE cascade)";

const HEALTHY_TABLE =
  "CREATE TABLE `sales_leads_services` (`order` integer NOT NULL, `parent_id` integer NOT NULL, " +
  "`value` text, `id` integer PRIMARY KEY NOT NULL, " +
  "FOREIGN KEY (`parent_id`) REFERENCES `sales_leads`(`id`) ON UPDATE no action ON DELETE cascade)";

let client: Client;

const payloadWith = (c: Client) => ({ db: { client: c } }) as never;

async function idColumnType(c: Client): Promise<string> {
  const info = await c.execute("PRAGMA table_info(`sales_leads_services`)");
  const row = (info.rows as Array<Record<string, unknown>>).find((r) => r.name === "id");
  return String(row?.type ?? "").toLowerCase();
}

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.batch(
    [
      "CREATE TABLE `payload_migrations` (`name` text, `batch` integer, `created_at` text, `updated_at` text)",
      `INSERT INTO \`payload_migrations\` (\`name\`, \`batch\`) VALUES ('${MARKER}', 1)`,
      "CREATE TABLE `landing_events` (`id` integer PRIMARY KEY NOT NULL, `market` text)",
      "CREATE TABLE `landing_domains` (`id` integer PRIMARY KEY NOT NULL)",
      "CREATE TABLE `sales_leads` (`id` integer PRIMARY KEY NOT NULL, `business_name` text)",
      "INSERT INTO `sales_leads` (`id`, `business_name`) VALUES (1, 'Tina'), (2, 'Acme')",
    ],
    "write",
  );
});

describe("sales_leads_services id repair", () => {
  it("rebuilds a text id as integer and keeps every row", async () => {
    await client.execute(BROKEN_TABLE);
    await client.batch(
      [
        "INSERT INTO `sales_leads_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 1, 'google_ads', 'txt-a')",
        "INSERT INTO `sales_leads_services` (`order`, `parent_id`, `value`, `id`) VALUES (1, 1, 'meta_ads', 'txt-b')",
        "INSERT INTO `sales_leads_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 2, 'full_service', 'txt-c')",
      ],
      "write",
    );

    const results = await runMigrations(payloadWith(client));

    expect(results).toContainEqual({ label: "sales_leads_services.id_integer_repair", status: "ok" });
    expect(await idColumnType(client)).toBe("integer");

    const rows = await client.execute(
      "SELECT `order`, `parent_id`, `value` FROM `sales_leads_services` ORDER BY `parent_id`, `order`",
    );
    expect(rows.rows.map((r) => [r.order, r.parent_id, r.value])).toEqual([
      [0, 1, "google_ads"],
      [1, 1, "meta_ads"],
      [0, 2, "full_service"],
    ]);
  });

  it("accepts an insert that omits id, the write that used to fail", async () => {
    await client.execute(BROKEN_TABLE);

    await runMigrations(payloadWith(client));

    await client.execute(
      "INSERT INTO `sales_leads_services` (`order`, `parent_id`, `value`) VALUES (0, 1, 'google_ads')",
    );
    const rows = await client.execute("SELECT `id` FROM `sales_leads_services`");
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0].id)).toBeGreaterThan(0);
  });

  it("is a no-op once the column is already integer", async () => {
    await client.execute(HEALTHY_TABLE);
    await client.execute(
      "INSERT INTO `sales_leads_services` (`order`, `parent_id`, `value`) VALUES (0, 1, 'google_ads')",
    );

    const results = await runMigrations(payloadWith(client));

    expect(results).toContainEqual({
      label: "sales_leads_services.id_integer_repair",
      status: "skip",
      message: "already integer",
    });
  });
});

describe("20260904_140000_fix_sales_leads_services_id_integer up()", () => {
  const migrationArgs = (c: Client) => ({ db: drizzle(c) }) as never;

  it("rebuilds a broken text id as integer and accepts an omitted-id insert", async () => {
    await client.execute(BROKEN_TABLE);
    await client.execute(
      "INSERT INTO `sales_leads_services` (`order`, `parent_id`, `value`, `id`) VALUES (0, 1, 'google_ads', 'txt-a')",
    );

    await fixSalesLeadsServicesIdInteger(migrationArgs(client));

    expect(await idColumnType(client)).toBe("integer");
    await client.execute(
      "INSERT INTO `sales_leads_services` (`order`, `parent_id`, `value`) VALUES (1, 1, 'meta_ads')",
    );
    const after = await client.execute("SELECT COUNT(*) AS n FROM `sales_leads_services`");
    expect(Number(after.rows[0].n)).toBe(2);
  });
});
