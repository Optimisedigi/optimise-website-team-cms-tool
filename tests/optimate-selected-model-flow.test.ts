import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  payload: {
    auth: vi.fn(async () => ({ user: { id: 123, role: "admin", features: ["nav:invoices"] } })),
    create: vi.fn(async () => ({ id: 1 })),
    findByID: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "google-ads-audits") return { id: 44, customerId: "123-456-7890", businessName: "Test Co", client: 55 };
      if (collection === "clients") return { id: 55, name: "Test Co" };
      return { id: 1 };
    }),
  },
  getPayload: vi.fn(async () => mocks.payload),
  nextHeaders: vi.fn(async () => new Headers()),
  getOptiMateDefaultModels: vi.fn(async () => ({
    defaultChatModel: "grok-build",
    defaultAutonomousModel: "grok-build",
    invoiceAssistantModel: "grok-build",
    emailAssistantModel: "grok-build",
    chatHistoryTokenLimit: 6000,
    googleMateStarterQuestions: [],
    googleMatePortfolioStarterQuestions: [],
    invoiceMateStarterQuestions: [],
  })),
  callLLM: vi.fn(async (opts: { model: string }) => ({
    message: { role: "assistant", content: [{ type: "text", text: "selected model used" }] },
    stopReason: "end_turn",
    model: opts.model,
    providerModel: opts.model,
    source: "api-key",
    usage: { inputTokens: 1, outputTokens: 1 },
  })),
  runEmailChatTurn: vi.fn(async () => ({
    reply: "ok",
    runId: "email-run",
    modelRequested: "claude-opus-4-8",
    modelUsed: "claude-opus-4-8",
    source: "oauth",
  })),
  runChatTurn: vi.fn(async () => ({
    reply: "ok",
    runId: "google-run",
    modelRequested: "claude-opus-4-8",
    modelUsed: "claude-opus-4-8",
    source: "oauth",
    proposals: [],
    confirmRequests: [],
  })),
  runPortfolioChatTurn: vi.fn(async () => ({
    reply: "ok",
    runId: "google-portfolio-run",
    modelRequested: "claude-opus-4-8",
    modelUsed: "claude-opus-4-8",
    source: "oauth",
    proposals: [],
    confirmRequests: [],
  })),
  loadPinnedMemoryBlock: vi.fn(async () => ({ text: "" })),
}));

vi.mock("payload", () => ({ getPayload: mocks.getPayload }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("next/headers", () => ({ headers: mocks.nextHeaders }));
vi.mock("@/lib/access", () => ({ userHasFeature: () => true }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({
  getOptiMateDefaultModels: mocks.getOptiMateDefaultModels,
}));
vi.mock("@/lib/agents/_shared/llm", () => ({ callLLM: mocks.callLLM }));
vi.mock("@/lib/agents/optimate-google-ads/memory-loader", () => ({
  loadPinnedMemoryBlock: mocks.loadPinnedMemoryBlock,
}));
vi.mock("@/lib/agents/optimate-email", () => ({
  runEmailChatTurn: mocks.runEmailChatTurn,
}));
vi.mock("@/lib/agents/optimate-google-ads", () => ({
  runChatTurn: mocks.runChatTurn,
  runPortfolioChatTurn: mocks.runPortfolioChatTurn,
}));
vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: vi.fn(),
}));
vi.mock("@/lib/gmail-search", () => ({
  fetchMessageBody: vi.fn(),
  fetchThreadContext: vi.fn(),
}));

describe("OptiMate selected model flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROWTH_TOOLS_URL = "https://growth.test";
    process.env.INTERNAL_API_KEY = "internal-test-key";
  });

  it("InvoiceMate calls the LLM with the UI-selected model instead of stored grok-build", async () => {
    const { POST } = await import("../src/app/(frontend)/api/xero/chat/route");

    await POST(
      new Request("https://cms.test/api/xero/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Summarise overdue invoices",
          model: "claude-opus-4-8",
        }),
      }) as never,
    );

    expect(mocks.getOptiMateDefaultModels).toHaveBeenCalled();
    expect(mocks.callLLM).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-opus-4-8" }));
    expect(mocks.callLLM).not.toHaveBeenCalledWith(expect.objectContaining({ model: "grok-build" }));
  });

  it("GmailMate forwards the UI-selected model to the email agent", async () => {
    const { POST } = await import("../src/app/(frontend)/api/optimate/email/chat/route");

    await POST(
      new Request("https://cms.test/api/optimate/email/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Draft a reply",
          model: "claude-opus-4-8",
        }),
      }),
    );

    expect(mocks.runEmailChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ modelOverride: "claude-opus-4-8" }),
    );
  });

  it("GoogleMate audit chat forwards the UI-selected model to the Google Ads agent", async () => {
    const { POST } = await import("../src/app/(frontend)/api/google-ads-audits/[id]/chat/route");

    await POST(
      new Request("https://cms.test/api/google-ads-audits/44/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Review this account",
          model: "claude-opus-4-8",
          sessionId: "session-1",
        }),
      }),
      { params: Promise.resolve({ id: "44" }) },
    );

    expect(mocks.runChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ modelOverride: "claude-opus-4-8" }),
    );
  });

  it("GoogleMate portfolio forwards the UI-selected model to the Google Ads agent", async () => {
    const { POST } = await import("../src/app/(frontend)/api/optimate/google-ads-portfolio/chat/route");

    await POST(
      new Request("https://cms.test/api/optimate/google-ads-portfolio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Compare selected accounts",
          model: "claude-opus-4-8",
          sessionId: "session-1",
          selectedAccountRefs: ["123"],
        }),
      }),
    );

    expect(mocks.runPortfolioChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ modelOverride: "claude-opus-4-8" }),
    );
  });
});
