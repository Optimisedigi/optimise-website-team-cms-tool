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
});
