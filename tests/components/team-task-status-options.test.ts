import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const awaitingResponseOption = "['awaiting_response', 'Awaiting Response']";

describe("team task Awaiting Response status", () => {
  it("is available in the Payload admin and both team-task status dropdowns", () => {
    const collection = readFileSync(resolve(process.cwd(), "src/collections/TeamTasks.ts"), "utf8");
    const detailPane = readFileSync(resolve(process.cwd(), "src/components/TeamTaskDetailPane.tsx"), "utf8");
    const spreadsheet = readFileSync(resolve(process.cwd(), "src/components/TeamTasksSpreadsheet.tsx"), "utf8");

    expect(collection).toContain('{ label: "Awaiting Response", value: "awaiting_response" }');
    expect(detailPane).toContain(awaitingResponseOption);
    expect(spreadsheet).toContain(awaitingResponseOption);
  });
});
