import { describe, expect, it } from "vitest";
import { createTaskMateTools, extractLatestStagedTaskList, validateStagedTaskList } from "@/lib/agents/taskmate";

const clients = [{ id: "1", name: "Acme" }, { id: "2", name: "Beta" }];
const users = [{ id: "7", name: "Alex", email: "alex@example.com", role: "staff" }, { id: "8", name: "Sam", email: "sam@example.com", role: "manager" }];
const valid = {
  weekStart: "2026-08-17",
  tasks: [{ title: "Write landing page", clientId: "1", taskType: "website_content", priority: "high", dueDate: "2026-08-20", instructions: "Use approved brief" }],
};

describe("TaskMate staging", () => {
  it("validates tasks and replaces model labels with the canonical client name", () => {
    expect(validateStagedTaskList({ ...valid, tasks: [{ ...valid.tasks[0], clientName: "Forged" }] }, clients)).toEqual({
      ...valid,
      tasks: [{ ...valid.tasks[0], clientName: "Acme" }],
    });
  });

  it.each([
    [{ ...valid, weekStart: "2026-08-18" }, "ISO Monday"],
    [{ ...valid, tasks: [{ ...valid.tasks[0], clientId: "999" }] }, "active client"],
    [{ ...valid, tasks: [{ ...valid.tasks[0], dueDate: "2026-08-24" }] }, "staged week"],
    [{ ...valid, tasks: [{ ...valid.tasks[0], taskType: "invented" }] }, "taskType"],
    [{ ...valid, tasks: [{ ...valid.tasks[0], priority: "critical" }] }, "priority"],
  ])("rejects invalid staged input", (input, message) => {
    expect(() => validateStagedTaskList(input, clients)).toThrow(message);
  });

  it("validates canonical assignees and replaces model labels with the selected user name", () => {
    const result = validateStagedTaskList({ ...valid, tasks: [{ ...valid.tasks[0], assignedToId: "7", assignedToName: "Forged" }] }, clients, users);
    expect(result.tasks[0]).toMatchObject({ assignedToId: "7", assignedToName: "Alex" });
    expect(() => validateStagedTaskList({ ...valid, tasks: [{ ...valid.tasks[0], assignedToId: "999" }] }, clients, users)).toThrow("assignable user");
  });

  it("keeps only the latest valid staged tool output", () => {
    const staged = extractLatestStagedTaskList([
      { step: 1, type: "tool-call", toolName: "stage_task_list", output: valid, timestamp: "2026-08-17T00:00:00Z" },
      { step: 2, type: "tool-call", toolName: "stage_task_list", output: { ...valid, tasks: [{ ...valid.tasks[0], clientId: "2" }] }, timestamp: "2026-08-17T00:00:01Z" },
    ], clients);
    expect(staged?.tasks[0]?.clientName).toBe("Beta");
  });

  it("lists canonical clients and every assignable user without side effects", async () => {
    const tools = createTaskMateTools(clients, users);
    const tool = tools.find(({ name }) => name === "list_task_clients")!;
    expect(await tool.execute({}, { agentName: "TaskMate", agentRunId: "run", context: {}, log: () => undefined })).toMatchObject({ ok: true, data: { clients } });
    expect(tool.sideEffect).toBeUndefined();
    const userTool = tools.find(({ name }) => name === "list_task_users")!;
    expect(await userTool.execute({}, { agentName: "TaskMate", agentRunId: "run", context: {}, log: () => undefined })).toMatchObject({ ok: true, data: { users } });
  });
});
