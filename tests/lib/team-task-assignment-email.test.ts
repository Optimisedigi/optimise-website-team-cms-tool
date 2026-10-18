import { afterEach, describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";
import {
  assigneeToNotify,
  buildTeamTaskAssignmentEmail,
  sendTeamTaskAssignmentEmail,
  teamTaskPageUrl,
} from "@/lib/team-task-assignment-email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("assigneeToNotify", () => {
  it("notifies the assignee on create", () => {
    expect(assigneeToNotify("create", { assignedTo: 7 })).toBe(7);
    expect(assigneeToNotify("create", { assignedTo: { id: 7 } })).toBe(7);
  });

  it("skips unassigned tasks", () => {
    expect(assigneeToNotify("create", { assignedTo: null })).toBeUndefined();
    expect(assigneeToNotify("update", { assignedTo: null }, { assignedTo: 7 })).toBeUndefined();
  });

  it("notifies only when the assignee changes on update", () => {
    expect(assigneeToNotify("update", { assignedTo: 7 }, { assignedTo: 7 })).toBeUndefined();
    expect(assigneeToNotify("update", { assignedTo: { id: 7 } }, { assignedTo: "7" })).toBeUndefined();
    expect(assigneeToNotify("update", { assignedTo: 8 }, { assignedTo: 7 })).toBe(8);
    expect(assigneeToNotify("update", { assignedTo: 8 }, { assignedTo: null })).toBe(8);
  });
});

describe("buildTeamTaskAssignmentEmail", () => {
  it("includes the task details and the team task link, escaped", () => {
    vi.stubEnv("CMS_BASE_URL", "https://cms.example.com/");
    const url = teamTaskPageUrl(42);
    expect(url).toBe("https://cms.example.com/admin/collections/team-tasks?task=42");

    const email = buildTeamTaskAssignmentEmail({
      task: {
        id: 42,
        title: "Fix <title> tags",
        taskType: "seo",
        priority: "high",
        dueDate: "2026-10-24T00:00:00.000Z",
        instructions: "Check the homepage & blog",
      },
      assigneeName: "Sam",
      clientName: "Acme",
      taskUrl: url,
    });

    expect(email.subject).toBe("New task assigned: Fix <title> tags");
    expect(email.text).toContain("Hi Sam,");
    expect(email.text).toContain("Client: Acme");
    expect(email.text).toContain("Priority: High");
    expect(email.text).toContain("Check the homepage & blog");
    expect(email.text).toContain(url);
    expect(email.html).toContain("Fix &lt;title&gt; tags");
    expect(email.html).toContain("Check the homepage &amp; blog");
    expect(email.html).toContain(`href="${url}"`);
  });
});

describe("sendTeamTaskAssignmentEmail", () => {
  function fakePayload(users: Record<string, { email?: string; name?: string }>) {
    const warn = vi.fn();
    const payload = {
      logger: { warn },
      findByID: vi.fn(async ({ collection, id }: { collection: string; id: string | number }) => {
        if (collection === "users") return users[String(id)] ?? null;
        if (collection === "clients") return { name: "Acme" };
        return null;
      }),
    } as unknown as Payload;
    return { payload, warn };
  }

  it("sends the email to the assignee through Brevo", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: "m1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { payload, warn } = fakePayload({ "7": { email: "sam@example.com", name: "Sam" } });

    await sendTeamTaskAssignmentEmail(payload, { id: 42, title: "Write blog", client: 3, assignedTo: 7 }, 7);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual([{ email: "sam@example.com", name: "Sam" }]);
    expect(body.subject).toBe("New task assigned: Write blog");
    expect(body.textContent).toContain("Client: Acme");
    expect(body.textContent).toContain("/admin/collections/team-tasks?task=42");
    expect(warn).not.toHaveBeenCalled();
  });

  it("skips assignees without an email", async () => {
    vi.stubEnv("BREVO_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { payload, warn } = fakePayload({ "7": { name: "Sam" } });

    await sendTeamTaskAssignmentEmail(payload, { id: 42, title: "Write blog" }, 7);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
