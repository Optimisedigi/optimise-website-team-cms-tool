import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { auth: vi.fn(), find: vi.fn() };
const runTaskMateChatTurn = vi.fn();
vi.mock("payload", () => ({ getPayload: vi.fn(async () => payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/agents/taskmate", () => ({ runTaskMateChatTurn }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({
  getOptiMateDefaultModels: vi.fn(async () => ({ defaultChatModel: "gpt-5.6-luna", chatHistoryTokenLimit: 6000 })),
}));
vi.mock("@/lib/agents/optimate-google-ads/error-translator", () => ({ translateAgentError: vi.fn(() => null) }));

const postRequest = (body: unknown) => new Request("http://localhost/api/optimate/taskmate/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("TaskMate chat route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payload.auth.mockResolvedValue({ user: { id: 1, role: "admin" } });
    payload.find.mockImplementation(async ({ collection }: { collection: string }) => collection === "clients"
      ? { docs: [{ id: 2, name: " Acme " }, { id: 3, name: "Beta" }] }
      : { docs: [{ id: 7, name: "Alex", email: "alex@example.com", role: "staff" }, { id: 9, name: "Admin User", email: "admin@optimise.digital", role: "admin" }] });
    runTaskMateChatTurn.mockResolvedValue({ reply: "Which tasks?", runId: "run", modelRequested: "gpt-5.6-luna", modelUsed: "gpt-5.6-luna", source: "service-account" });
  });

  it("denies unauthenticated and non-admin access", async () => {
    const route = await import("@/app/(frontend)/api/optimate/taskmate/chat/route");
    payload.auth.mockResolvedValueOnce({ user: null });
    expect((await route.GET()).status).toBe(401);
    payload.auth.mockResolvedValueOnce({ user: { id: 2, role: "staff" } });
    expect((await route.POST(postRequest({ message: "hello" }))).status).toBe(403);
    expect(runTaskMateChatTurn).not.toHaveBeenCalled();
  });

  it("rejects oversized messages and invalid histories", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/taskmate/chat/route");
    expect((await POST(postRequest({ message: "x".repeat(8001) }))).status).toBe(400);
    expect((await POST(postRequest({ message: "hello", history: Array.from({ length: 51 }, () => ({ role: "user", content: "x" })) }))).status).toBe(400);
  });

  it("grounds the agent with canonical clients, the complete assignable user set, and the configured general model", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/taskmate/chat/route");
    const response = await POST(postRequest({ message: "Plan next week", history: [{ role: "assistant", content: "Okay" }] }));
    expect(response.status).toBe(200);
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ collection: "clients", where: { isActive: { not_equals: false } } }));
    expect(runTaskMateChatTurn).toHaveBeenCalledWith(expect.objectContaining({
      clients: [{ id: "2", name: "Acme" }, { id: "3", name: "Beta" }],
      users: [{ id: "7", name: "Alex", email: "alex@example.com", role: "staff" }],
      modelOverride: "gpt-5.6-luna",
      userId: 1,
    }));
  });
});
