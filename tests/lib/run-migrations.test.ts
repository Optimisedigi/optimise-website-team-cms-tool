import { describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/lib/run-migrations";

describe("runMigrations", () => {
  it("rebuilds contractor time entries when legacy unique week index remains", async () => {
    const batch = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn(async (sql: string) => {
      if (sql === "PRAGMA table_info(`contractor_time_entries`)") {
        return {
          rows: [
            { name: "user_id", notnull: 0 },
            { name: "contractor_id", notnull: 0 },
          ],
        };
      }
      if (sql === "PRAGMA index_list(`contractor_time_entries`)") {
        return { rows: [{ name: "contractor_time_entries_unique_week" }] };
      }
      return { rows: [] };
    });
    const payload = { db: { client: { execute, batch } } } as any;

    const results = await runMigrations(payload);
    const contractorMigration = results.find((result) => result.label === "contractor_time_entries_user_allocations");
    const contractorStatements = batch.mock.calls.flatMap((call) => call[0] as string[]);

    expect(contractorMigration).toEqual({ label: "contractor_time_entries_user_allocations", status: "ok" });
    expect(contractorStatements).toContain("DROP INDEX IF EXISTS `contractor_time_entries_unique_week`");
    expect(contractorStatements).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS `contractor_time_entries_unique_user_week` ON `contractor_time_entries` (`user_id`, `week_commencing`) WHERE `user_id` IS NOT NULL",
    );
    expect(execute).toHaveBeenCalledWith(
      "UPDATE `contractor_time_entries` SET `week_commencing` = `week_commencing` || 'T00:00:00.000Z' WHERE length(`week_commencing`) = 10 AND substr(`week_commencing`, 5, 1) = '-' AND substr(`week_commencing`, 8, 1) = '-'",
    );
  });

  it("adds every task-specific OptiMate model column to existing databases", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const batch = vi.fn().mockResolvedValue(undefined);
    const payload = { db: { client: { execute, batch } } } as any;

    const results = await runMigrations(payload);

    const expectedColumns = [
      "search_term_research_model",
      "negative_sweep_model",
      "blog_image_generation_model",
    ];
    for (const column of expectedColumns) {
      expect(results).toContainEqual({
        label: `optimate_settings.${column}`,
        status: "ok",
      });
      expect(execute).toHaveBeenCalledWith(
        `ALTER TABLE \`optimate_settings\` ADD \`${column}\` text`,
      );
    }
  });

  it("adds landing collection lock columns so document updates can clear locks", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const batch = vi.fn().mockResolvedValue(undefined);
    const payload = { db: { client: { execute, batch } } } as any;

    await runMigrations(payload);

    for (const collection of ["landing_properties", "landing_experiments", "landing_events"]) {
      expect(execute).toHaveBeenCalledWith(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`${collection}_id\` integer REFERENCES \`${collection}\`(\`id\`) ON DELETE cascade`,
      );
    }
  });

  it("seeds AutoTrader PIN and audit deck without overwriting an existing client", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    const payload = { db: { client: { execute, batch: vi.fn() } } } as any
    const results = await runMigrations(payload)
    expect(results).toContainEqual({ label: "seed_autotrader_client", status: "ok" })
    expect(results).toContainEqual({ label: "seed_autotrader_audit_deck", status: "ok" })
    const clientSql = execute.mock.calls.map((call) => String(call[0])).find((sql) => sql.includes("seed_autotrader") || sql.includes("'autotrader'"))
    expect(clientSql).toContain("WHERE NOT EXISTS (SELECT 1 FROM clients WHERE slug = 'autotrader')")
    expect(clientSql).toContain("AND NOT EXISTS (SELECT 1 FROM clients WHERE client_pin = '2244')")
  })

  it("uses the current schema marker to avoid a production timeout", async () => {
    const execute = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("20260814_120000_add_hosting_billing") && sql.startsWith("SELECT")) {
        return { rows: [{ 1: 1 }] };
      }
      return { rows: [] };
    });
    const payload = { db: { client: { execute } } } as any;

    const results = await runMigrations(payload);

    // The fast path creates the landing tables and their lock relations, then
    // stops. The exact statement count is not the point — staying far below the
    // full sweep is, because that is what keeps production inside its timeout.
    expect(results.length).toBeLessThan(100);
    expect(results.every((result) => result.status !== "error")).toBe(true);

    // Tables must be created before the ALTERs that reference them.
    const createdAt = results.findIndex((result) => result.label === "landing_properties");
    const lockedAt = results.findIndex((result) => result.label === "locked_docs_rels.landing_properties_id");
    expect(createdAt).toBeGreaterThanOrEqual(0);
    expect(lockedAt).toBeGreaterThan(createdAt);

    const createStatements = execute.mock.calls.map(([sql]) => String(sql)).filter((sql) => sql.startsWith("CREATE TABLE"));
    expect(createStatements.join("\n")).not.toContain("`client_id` integer NOT NULL");
    expect(createStatements.join("\n")).not.toContain("`property_id` integer NOT NULL");

    expect(results.at(-1)).toMatchObject({
      label: "mark_migration:20260814_133000_add_landing_lock_relations",
      status: "ok",
    });
  });
});
