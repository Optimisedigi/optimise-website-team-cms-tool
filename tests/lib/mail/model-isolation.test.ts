import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildMailModelRequest, MailModelRequestError, MAX_THREAD_MESSAGES, MAX_THREAD_TOTAL_CHARS, selectThreadContext } from "@/lib/mail/model-request";
import { MAIL_PROMPTS } from "@/lib/mail/prompts";

const mockPayload = { auth: vi.fn(), find: vi.fn(), findByID: vi.fn(), create: vi.fn(), update: vi.fn() };
vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
const mockHasFeature = vi.fn((_user: unknown, _slug: string) => true);
vi.mock("@/lib/access", () => ({ userHasFeature: (user: unknown, slug: string) => mockHasFeature(user, slug) }));
const CLIENT_NAMES: Record<number, string> = { 7: "Acme Pty Ltd", 8: "In The Picture" };
const mockProfile = vi.fn(async (_payload: unknown, args: { id: number }) =>
  CLIENT_NAMES[args.id]
    ? { id: args.id, name: CLIENT_NAMES[args.id], contracts: { totalCount: 1, returned: 1, items: [], latest: { contractTitle: `CONTRACT-FOR-${args.id}`, status: "signed", contractStartDate: null, contractEndDate: null, contractTerm: null, clientSignedAt: null } } }
    : null,
);
vi.mock("@/lib/optimate-client-profile", () => ({
  buildOptimateClientProfile: (payload: unknown, args: { id: number }) => mockProfile(payload, args),
}));
vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({
  getValidGmailToken: vi.fn(async () => ({ ok: true, accessToken: "tok", email: "peter@optimisedigital.online", userEmail: "" })),
}));
const mockCallLLM = vi.fn();
vi.mock("@/lib/agents/_shared/llm", () => ({ callLLM: (...args: unknown[]) => mockCallLLM(...args) }));
vi.mock("@/lib/agents/_shared/llm/registry", () => ({ DEFAULT_AUTONOMOUS_FALLBACKS: [] }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({
  getOptiMateDefaultModels: vi.fn(async () => ({ defaultAutonomousModel: "test-model", emailAssistantModel: "email-model" })),
}));
const mockSoul = vi.fn(async (_ids: unknown[], _opts: unknown) => ({ text: "## Working with this team\n- **email-tone**: SOUL-RULE-NO-SIGNOFF" }));
vi.mock("@/lib/agents/optimate-google-ads/memory-loader", () => ({
  loadPinnedMemoryBlock: (ids: unknown[], opts: unknown) => mockSoul(ids, opts),
}));

const INBOX: Record<string, { from: string; subject: string; body: string }> = {
  selected: { from: "jo@inthepicture.com.au", subject: "Meeting", body: "Can we meet Thursday? SELECTED-BODY" },
  other: { from: "sam@other.com", subject: "Secret", body: "OTHER-EMAIL-BODY must never reach the model" },
};
const mockGetFullMessage = vi.fn(async (_token: string, id: string) => ({
  messageId: id, threadId: "t1", rfcMessageId: "<x@y>", to: "peter@optimisedigital.online", cc: "", date: "",
  snippet: "", labelIds: [], ...INBOX[id]!,
}));
const mockGetThreadMessages = vi.fn(async (_token: string, threadId: string) => [
  { messageId: "earlier", threadId, rfcMessageId: "", from: "jo@inthepicture.com.au", to: "peter@optimisedigital.online", cc: "", subject: "Meeting", date: "", snippet: "", labelIds: [], bodyHtml: "", body: "Proposed Tuesday. EARLIER-IN-THREAD" },
  { messageId: "selected", threadId, rfcMessageId: "", from: "jo@inthepicture.com.au", to: "peter@optimisedigital.online", cc: "", subject: "Meeting", date: "", snippet: "", labelIds: [], bodyHtml: "", ...INBOX.selected },
  { messageId: "stray", threadId: "some-other-thread", rfcMessageId: "", from: "sam@other.com", to: "", cc: "", subject: "x", date: "", snippet: "", labelIds: [], bodyHtml: "", body: "OTHER-EMAIL-BODY" },
]);
vi.mock("@/lib/mail/gmail-mail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mail/gmail-mail")>()),
  getFullMessage: (t: string, id: string) => mockGetFullMessage(t, id),
  getThreadMessages: (t: string, id: string) => mockGetThreadMessages(t, id),
}));

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

describe("AI greeting and suggested subject", () => {
  it("replies open with Hi and the sender's first name", async () => {
    mockGetFullMessage.mockResolvedValueOnce({
      messageId: "selected", threadId: "t1", rfcMessageId: "<x@y>", to: "peter@optimisedigital.online", cc: "", date: "",
      snippet: "", labelIds: [], from: "Helena Smith <helena@flipside.com.au>", subject: "Paid ads", body: "Next steps?",
    });
    mockCallLLM.mockResolvedValueOnce({ message: { content: [{ type: "text", text: "Dear Helena,\n\nHappy to help." }] }, model: "m" });
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(post("/api/mail/ai", { action: "reply", gmailMessageId: "selected" }));
    expect(await res.json()).toMatchObject({ text: "Hi Helena,\n\nHappy to help." });
    expect(modelInput()).toContain("Always open with 'Hi'");
  });

  it("splits a suggested subject off the first draft of a new email", async () => {
    mockCallLLM.mockResolvedValueOnce({
      message: { content: [{ type: "text", text: "Subject: Call next week?\n\nHi Jo,\n\nFancy a call next week?" }] },
      model: "m",
    });
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(post("/api/mail/ai", { action: "draft", instruction: "invite Jo to a call", suggestSubject: true }));
    expect(await res.json()).toMatchObject({ subject: "Call next week?", text: "Hi Jo,\n\nFancy a call next week?" });
    expect(modelInput()).toContain("'Subject: <a short, specific subject line>'");
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "draft" }) }));
  });

  it("asks for a subject only on the first request of a new email", () => {
    expect(buildMailModelRequest({ action: "draft", instruction: "x", suggestSubject: true }).suggestSubject).toBe(true);
    expect(buildMailModelRequest({ action: "draft", instruction: "x" }).suggestSubject).toBe(false);
    expect(
      buildMailModelRequest({ action: "draft", instruction: "shorter", currentDraft: "Hi Jo", suggestSubject: true }).suggestSubject,
    ).toBe(false);
    expect(
      buildMailModelRequest({ action: "reply", email: { gmailMessageId: "a", from: "x", subject: "s", body: "b" }, suggestSubject: true })
        .suggestSubject,
    ).toBe(false);
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

describe("OptiMate writing style (soul) and model", () => {
  it("adds the email soul rules to reply prompts, soul only (no pinned account facts), using the Email Assistant model", async () => {
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    await POST(post("/api/mail/ai", { action: "reply", gmailMessageId: "selected", instruction: "ok" }));
    const call = mockCallLLM.mock.calls[0]![0] as { system: string; model: string };
    expect(call.system).toContain("SOUL-RULE-NO-SIGNOFF");
    expect(call.model).toBe("email-model");
    expect(mockSoul).toHaveBeenCalledWith([], { includePinnedFacts: false, soulAgentKeys: ["email"] });
  });

  it("does not add soul rules to timeline summaries", async () => {
    mockPayload.findByID.mockResolvedValue({ id: 5, gmailMessageId: "selected", ...INBOX.selected });
    const { POST } = await import("@/app/(frontend)/api/mail/summarise/route");
    await POST(post("/api/mail/summarise", { clientEmailId: 5 }));
    expect(modelInput()).not.toContain("SOUL-RULE-NO-SIGNOFF");
  });
});

describe("refining a draft (keep prompting)", () => {
  it("sends earlier prompts, drafts and the edited draft, but still only the one selected email", async () => {
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(
      post("/api/mail/ai", {
        action: "reply",
        gmailMessageId: "selected",
        instruction: "make it shorter",
        history: [{ instruction: "say Thursday works", draft: "Hi Jo, Thursday works. FIRST-DRAFT" }],
        currentDraft: "Hi Jo, Thursday works for me. MY-OWN-EDIT",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockGetFullMessage).toHaveBeenCalledTimes(1);
    const call = mockCallLLM.mock.calls[0]![0] as { messages: Array<{ role: string; content: Array<{ text: string }> }> };
    expect(call.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const input = modelInput();
    expect(input).toContain("SELECTED-BODY");
    expect(input).toContain("FIRST-DRAFT");
    expect(input).toContain("MY-OWN-EDIT");
    expect(input).toContain("make it shorter");
    expect(input).not.toContain("OTHER-EMAIL-BODY");
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ emailCount: 1 }) }));
  });

  it("a refined new draft still contains no email", () => {
    const req = buildMailModelRequest({
      action: "draft",
      instruction: "more formal",
      history: [{ instruction: "invite Jo to a call", draft: "Hi Jo, fancy a call?" }],
      currentDraft: "Hi Jo, fancy a call next week?",
    });
    expect(req.emailCount).toBe(0);
    expect(req.messages).toHaveLength(3);
    expect(req.messages[2]!.text).toContain("more formal");
  });

  it("requires a change instruction once there is a draft, and caps history", () => {
    expect(() =>
      buildMailModelRequest({ action: "draft", instruction: "", currentDraft: "Hi" }),
    ).toThrow(MailModelRequestError);
    const long = Array.from({ length: 20 }, (_, i) => ({ instruction: `i${i}`, draft: `d${i}` }));
    const req = buildMailModelRequest({ action: "draft", instruction: "x", history: long });
    // 8 kept rounds → 1 opening + 1 draft + 7 × 2 + final ask
    expect(req.messages).toHaveLength(17);
    expect(JSON.stringify(req.messages)).not.toContain("d11");
  });
});

describe("opt-in whole thread", () => {
  it("does not load the thread unless the box is ticked", async () => {
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    await POST(post("/api/mail/ai", { action: "reply", gmailMessageId: "selected", instruction: "ok" }));
    expect(mockGetThreadMessages).not.toHaveBeenCalled();
    expect(modelInput()).not.toContain("EARLIER-IN-THREAD");
  });

  it("adds the earlier messages of the selected email's own thread, never another thread", async () => {
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(
      post("/api/mail/ai", { action: "reply", gmailMessageId: "selected", instruction: "ok", includeThread: true, threadId: "attacker-thread" }),
    );
    expect(res.status).toBe(200);
    // Thread id comes from the selected message ("t1"), not from the request body.
    expect(mockGetThreadMessages).toHaveBeenCalledWith("tok", "t1");
    const input = modelInput();
    expect(input).toContain("EARLIER-IN-THREAD");
    expect(input).toContain("SELECTED-BODY");
    expect(input).not.toContain("OTHER-EMAIL-BODY");
    expect(mockPayload.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gmailMessageId: "selected", emailCount: 2 }) }),
    );
  });

  it("caps thread context and refuses it for new drafts", () => {
    const thread = Array.from({ length: 30 }, (_, i) => ({ gmailMessageId: `m${i}`, from: "a@b.com", subject: "s", body: `B${i}-`.padEnd(6_000, "x") }));
    const kept = selectThreadContext(thread, "m29");
    expect(kept.length).toBeLessThanOrEqual(MAX_THREAD_MESSAGES);
    expect(kept.reduce((n, m) => n + m.body.length, 0)).toBeLessThanOrEqual(MAX_THREAD_TOTAL_CHARS);
    expect(kept[kept.length - 1]!.gmailMessageId).toBe("m28");
    expect(() => buildMailModelRequest({ action: "draft", instruction: "x", thread })).toThrow(MailModelRequestError);
  });
});


describe("opt-in client data", () => {
  // Client 8 matches the sender's domain; client 7 is a manual assignment stored for "selected".
  function payloadWith(opts: { storedClient?: number | null } = {}) {
    mockPayload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === "client-emails") {
        return { docs: opts.storedClient ? [{ client: { id: opts.storedClient, name: CLIENT_NAMES[opts.storedClient] } }] : [] };
      }
      if (args.collection === "clients") {
        return { docs: [{ id: 8, name: "In The Picture", websiteUrl: "https://inthepicture.com.au", isActive: true }] };
      }
      return { docs: [] };
    });
  }
  const findCollections = () => mockPayload.find.mock.calls.map((call) => (call[0] as { collection: string }).collection);

  it("sends no client facts and reads no client data unless the box is ticked", async () => {
    payloadWith({ storedClient: 7 });
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(post("/api/mail/ai", { action: "reply", gmailMessageId: "selected", instruction: "ok" }));
    expect(res.status).toBe(200);
    expect(modelInput()).not.toMatch(/from our CMS\n|CONTRACT-FOR-/);
    expect(findCollections()).toEqual([]);
    expect(mockProfile).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ clientContext: null });
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ client: null }) }));
  });

  it("uses the client stored for the selected message, never a client id from the body", async () => {
    payloadWith({ storedClient: 7 });
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(
      post("/api/mail/ai", { action: "reply", gmailMessageId: "selected", instruction: "ok", includeClientData: true, clientId: 8 }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ clientContext: { id: 7, name: "Acme Pty Ltd" } });
    const input = modelInput();
    expect(input).toContain("Facts about Acme Pty Ltd from our CMS");
    expect(input).toContain("CONTRACT-FOR-7");
    expect(input).not.toContain("CONTRACT-FOR-8");
    expect(mockProfile).toHaveBeenCalledTimes(1);
    expect(mockPayload.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ client: 7 }) }));
  });

  it("falls back to the sender's domain match when the message is not stored", async () => {
    payloadWith();
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(post("/api/mail/ai", { action: "reply", gmailMessageId: "selected", includeClientData: true }));
    expect(res.status).toBe(200);
    expect(modelInput()).toContain("CONTRACT-FOR-8");
  });

  it("matches a new email's client from its recipients", async () => {
    payloadWith();
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(
      post("/api/mail/ai", { action: "draft", instruction: "Update Jo", includeClientData: true, to: "Jo <jo@inthepicture.com.au>", cc: "" }),
    );
    expect(res.status).toBe(200);
    expect(modelInput()).toContain("CONTRACT-FOR-8");
    expect(await res.json()).toMatchObject({ clientContext: { id: 8 } });
  });

  it("returns 400 without calling the model when no client resolves", async () => {
    payloadWith();
    const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
    const res = await POST(post("/api/mail/ai", { action: "draft", instruction: "Hi", includeClientData: true, to: "x@unknown.com" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This email isn't linked to a client.");
    expect(mockCallLLM).not.toHaveBeenCalled();
  });

  it("returns 403 for users without the clients feature", async () => {
    payloadWith({ storedClient: 7 });
    mockHasFeature.mockImplementation((_user, slug) => slug !== "clients");
    try {
      const { POST } = await import("@/app/(frontend)/api/mail/ai/route");
      const res = await POST(post("/api/mail/ai", { action: "reply", gmailMessageId: "selected", includeClientData: true }));
      expect(res.status).toBe(403);
      expect(mockCallLLM).not.toHaveBeenCalled();
      expect(mockProfile).not.toHaveBeenCalled();
    } finally {
      mockHasFeature.mockImplementation(() => true);
    }
  });

  it("summaries never take client context", () => {
    const email = { gmailMessageId: "a", from: "x@y.com", subject: "S", body: "B" };
    expect(() =>
      buildMailModelRequest({ action: "summarise", email, clientContext: { clientId: 7, clientName: "Acme", text: "facts" } }),
    ).toThrow(MailModelRequestError);
    const reply = buildMailModelRequest({ action: "reply", email, clientContext: { clientId: 7, clientName: "Acme", text: "facts" } });
    expect(reply.clientId).toBe(7);
    expect(reply.messages[0]!.text.indexOf("Facts about Acme")).toBeLessThan(reply.messages[0]!.text.indexOf("The email:"));
  });
});
