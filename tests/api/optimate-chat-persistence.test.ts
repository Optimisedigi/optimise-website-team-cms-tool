import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

const mockPayload = {
  auth: vi.fn(),
  create: vi.fn(),
  findByID: vi.fn(),
  findGlobal: vi.fn(),
};

vi.mock("payload", () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}));

vi.mock("@/payload.config", () => ({
  default: Promise.resolve({}),
}));

// The chat route imports the agent runner and a Gmail token helper. We mock
// both so we never reach external services from a unit test.
const mockRunChatTurn = vi.fn();
vi.mock("@/lib/agents/optimate-google-ads", () => ({
  runChatTurn: (...args: unknown[]) => mockRunChatTurn(...args),
}));

vi.mock("@/lib/agents/_shared/llm/registry", () => ({
  // Accept anything as a canonical model so we don't have to ship the real
  // registry through the test bundle.
  isCanonicalModel: () => true,
  DEFAULT_CHAT_MODEL: "claude-sonnet-4",
  DEFAULT_AUTONOMOUS_MODEL: "kimi-k2.6",
  CHAT_PICKER_MODELS: [{ canonical: "claude-sonnet-4" }, { canonical: "kimi-k2.6" }],
}));

vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: vi.fn(),
}));

vi.mock("@/lib/gmail-search", () => ({
  fetchMessageBody: vi.fn(),
}));

import { POST } from "@/app/(frontend)/api/google-ads-audits/[id]/chat/route";

function makeReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3001/api/google-ads-audits/5/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPayload.auth.mockResolvedValue({ user: { id: 7, role: "manager" } });
  mockPayload.findByID.mockResolvedValue({
    id: 5,
    customerId: "123-456-7890",
    client: null,
    proposal: null,
  });
  mockPayload.findGlobal.mockResolvedValue({
    defaultChatModel: "claude-sonnet-4",
    defaultAutonomousModel: "kimi-k2.6",
    chatHistoryTokenLimit: 6000,
  });
  mockRunChatTurn.mockResolvedValue({
    reply: "Here's your answer.",
    runId: "run-xyz",
    modelRequested: "claude-sonnet-4",
    modelUsed: "claude-sonnet-4",
    source: "anthropic",
    proposals: [],
  });
});

describe("POST /api/google-ads-audits/[id]/chat — persistence flag", () => {
  it("returns persisted: false (and HTTP 200) when chat-turn writes throw 'no such table'", async () => {
    mockPayload.create.mockRejectedValue(
      Object.assign(new Error("SqliteError: no such table: optimate_chat_turns"), {
        code: "SQLITE_ERROR",
      }),
    );

    // Silence the targeted console.warn we emit on this specific failure.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(makeReq({ message: "hello" }), makeParams("5"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persisted).toBe(false);
    expect(data.reply).toBe("Here's your answer.");
    // Both writes were attempted (user prompt + assistant reply).
    expect(mockPayload.create).toHaveBeenCalledTimes(2);
    // The targeted migrate-hint warning was emitted at least once.
    expect(warnSpy).toHaveBeenCalled();
    const warnedAboutMigrate = warnSpy.mock.calls.some((args) =>
      String(args[0] ?? "").includes("/api/migrate"),
    );
    expect(warnedAboutMigrate).toBe(true);

    warnSpy.mockRestore();
  });

  it("returns persisted: true when both writes succeed", async () => {
    mockPayload.create.mockResolvedValue({ id: 1 });

    const res = await POST(makeReq({ message: "hello" }), makeParams("5"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persisted).toBe(true);
    expect(mockPayload.create).toHaveBeenCalledTimes(2);
  });

  it("returns persisted: false when only the assistant write fails", async () => {
    mockPayload.create
      .mockResolvedValueOnce({ id: 1 }) // user row succeeds
      .mockRejectedValueOnce(new Error("FK violation"));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeReq({ message: "hello" }), makeParams("5"));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.persisted).toBe(false);

    errSpy.mockRestore();
  });

  it("echoes the supplied sessionId back in the response", async () => {
    mockPayload.create.mockResolvedValue({ id: 1 });

    const res = await POST(
      makeReq({ message: "hello", sessionId: "session-abc" }),
      makeParams("5"),
    );

    const data = await res.json();
    expect(data.sessionId).toBe("session-abc");
  });
});
