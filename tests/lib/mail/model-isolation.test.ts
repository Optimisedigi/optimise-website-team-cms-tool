import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildMailModelRequest, MailModelRequestError } from "@/lib/mail/model-request";
import { MAIL_PROMPTS } from "@/lib/mail/prompts";

const mockPayload = { auth: vi.fn(), find: vi.fn(), findByID: vi.fn(), create: vi.fn(), update: vi.fn() };
vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/access", () => ({ userHasFeature: () => true }));
vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: vi.fn(async () => ({ ok: true, accessToken: "tok", email: "peter@optimisedigital.online", userEmail: "" })),
}));
const mockCallLLM = vi.fn();
vi.mock("@/lib/agents/_shared/llm", () => ({ callLLM: (...args: unknown[]) => mockCallLLM(...args) }));
vi.mock("@/lib/agents/_shared/llm/registry", () => ({ DEFAULT_AUTONOMOUS_FALLBACKS: [] }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({
  getOptiMateDefaultModels: vi.fn(async () => ({ defaultAutonomousModel: "test-model" })),
}));

const INBOX: Record<string, { from: string; subject: string; body: string }> = {
  selected: { from: "jo@inthepicture.com.au", subject: "Meeting", body: "Can we meet Thursday? SELECTED-BODY" },
  other: { from: "sam@other.com", subject: "Secret", body: "OTHER-EMAIL-BODY must never reach the model" },
};
const mockGetFullMessage = vi.fn(async (_token: string, id: string) => ({
  messageId: id, threadId: "t1", rfcMessageId: "<x@y>", to: "peter@optimisedigital.online", cc: "", date: "",
  snippet: "", labelIds: [], ...INBOX[id]!,
}));
vi.mock("@/lib/mail/gmail-mail", () => ({ getFullMessage: (t: string, id: string) => mockGetFullMessage(t, id) }));

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

function modelInput(): string {
  const call = mockCallLLM.mock.calls[0]![0] as { system: string; messages: Array<{ content: Array<{ text: string }> }> };
  return call.system + JSON.stringify(call.messages);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPayload.auth.mockResolvedValue({ user: { id: 10, role: "admin" } });
  mockPayload.create.mockResolvedValue({ id: 1 });
  mockCallLLM.mockResolvedValue({ message: { content: [{ type: "text", text: "Draft text" }] }, model: "test-model" });
});

describe("buildMailModelRequest", () => {
  const email = { gmailMessageId: "a", from: "x@y.com", subject: "S", body: "B" };
  it("includes exactly one email for reply/summarise and none for draft", () => {
    expect(buildMailModelRequest({ action: "reply", email }).emailCount).toBe(1);
    expect(buildMailModelRequest({ action: "summarise", email }).emailCount).toBe(1);
    expect(buildMailModelRequest({ action: "draft", instruction: "hi" })).toMatchObject({ emailCount: 0, gmailMessageId: null });
  });
  it("rejects lists of emails and emails attached to a fresh draft", () => {
    expect(() => buildMailModelRequest({ action: "reply", email: [email, email] as never })).toThrow(MailModelRequestError);
    expect(() => buildMailModelRequest({ action: "draft", email, instruction: "x" })).toThrow(MailModelRequestError);
    expect(() => buildMailModelRequest({ action: "reply" })).toThrow(MailModelRequestError);
  });
  it("every prompt states it only sees the supplied email", () => {
    for (const prompt of Object.values(MAIL_PROMPTS)) expect(prompt.system).toMatch(/You only see/);
  });
});

describe("POST /api/mail/ai", () => {
  it("sends only the selected email plus the instruction, and logs one email", async () => {
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(post("/api/mail/ai", { action: "reply", gmailMessageId: "selected", instruction: "say Thursday works" }));
    expect(res.status).toBe(200);
    expect(mockGetFullMessage).toHaveBeenCalledTimes(1);
    expect(mockGetFullMessage).toHaveBeenCalledWith("tok", "selected");
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const input = modelInput();
    expect(input).toContain("SELECTED-BODY");
    expect(input).toContain("say Thursday works");
    expect(input).not.toContain("OTHER-EMAIL-BODY");
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "mail-ai-requests",
        data: expect.objectContaining({ action: "reply", gmailMessageId: "selected", emailCount: 1 }),
      }),
    );
    const logged = JSON.stringify(mockPayload.create.mock.calls);
    expect(logged).not.toContain("SELECTED-BODY");
  });

  it("rejects more than one email without calling the model", async () => {
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(post("/api/mail/ai", { action: "reply", gmailMessageId: ["selected", "other"] }));
    expect(res.status).toBe(400);
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(mockGetFullMessage).not.toHaveBeenCalled();
  });

  it("a new draft sends no email at all", async () => {
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(post("/api/mail/ai", { action: "draft", instruction: "Invite Jo to a call" }));
    expect(res.status).toBe(200);
    expect(mockGetFullMessage).not.toHaveBeenCalled();
    expect(modelInput()).not.toMatch(/SELECTED-BODY|OTHER-EMAIL-BODY/);
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ emailCount: 0 }) }));
  });
});

describe("POST /api/mail/summarise", () => {
  it("summarises only the one stored email and saves nothing to the timeline", async () => {
    mockPayload.findByID.mockResolvedValue({ id: 5, gmailMessageId: "selected", ...INBOX.selected });
    const { POST } = await import("@/app/(frontend)/api/mail/summarise/route");
    const res = await POST(post("/api/mail/summarise", { clientEmailId: 5 }));
    expect(res.status).toBe(200);
    expect(mockPayload.findByID).toHaveBeenCalledTimes(1);
    expect(mockPayload.find).not.toHaveBeenCalled();
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(modelInput()).toContain("SELECTED-BODY");
    const collections = mockPayload.create.mock.calls.map((c) => (c[0] as { collection: string }).collection);
    expect(collections).toEqual(["mail-ai-requests"]);
  });
});
