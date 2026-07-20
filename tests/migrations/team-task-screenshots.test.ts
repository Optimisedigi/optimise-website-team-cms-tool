import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const requiredSchemaFragments = [
  "team_tasks_screenshots",
  "thumbnail_url",
  "media_id",
  "team_tasks_screenshots_order_idx",
  "team_tasks_screenshots_parent_idx",
];

describe("team task screenshot production migration", () => {
  it("keeps the bundled production runner aligned with the Payload migration", () => {
    const payloadMigration = readFileSync(
      resolve(process.cwd(), "src/migrations/20260810_120000_add_team_task_screenshots.ts"),
      "utf8",
    );
    const productionRunner = readFileSync(
      resolve(process.cwd(), "src/lib/run-migrations.ts"),
      "utf8",
    );

    for (const fragment of requiredSchemaFragments) {
      expect(payloadMigration, `Payload migration is missing ${fragment}`).toContain(fragment);
      expect(productionRunner, `Bundled production migration is missing ${fragment}`).toContain(fragment);
    }
  });
});
