import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { auth: vi.fn() };
const runAdminMateChatTurn = vi.fn();
const getValidGmailToken = vi.fn();
const fetchMessageBody = vi.fn();
const listExistingClients = vi.fn();
const listContractTemplates = vi.fn();

vi.mock("payload", () => ({ getPayload: vi.fn(async () => payload) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/agents/adminmate", () => ({ runAdminMateChatTurn }));
vi.mock("@/lib/agents/adminmate/list-clients", () => ({ listExistingClients }));
vi.mock("@/lib/agents/adminmate/list-prospects", () => ({
  listMeetingProspects: vi.fn().mockResolvedValue([]),
  listSendableMeetingSchedulers: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/contract-from-template", () => ({ listContractTemplates }));
vi.mock("@/lib/agents/_shared/user-gmail-tokens", () => ({ getValidGmailToken }));
vi.mock("@/lib/gmail-search", () => ({ fetchMessageBody }));
vi.mock("@/lib/agents/_shared/optimate-default-models", () => ({
  getOptiMateDefaultModels: vi.fn(async () => ({
    defaultChatModel: "gpt-5.6-luna",
    chatHistoryTokenLimit: 6000,
  })),
}));
vi.mock("@/lib/agents/optimate-google-ads/error-translator", () => ({
  translateAgentError: vi.fn(() => null),
}));

const postRequest = (body: unknown) => new Request(
  "http://localhost/api/optimate/adminmate/chat",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  },
);

describe("AdminMate chat route email attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    payload.auth.mockResolvedValue({ user: { id: 17, role: "admin" } });
    listExistingClients.mockResolvedValue([]);
    listContractTemplates.mockResolvedValue([]);
    getValidGmailToken.mockResolvedValue({ ok: true, accessToken: "access-token" });
    fetchMessageBody.mockResolvedValue({
      messageId: "gmail-1",
      threadId: "thread-1",
      rfcMessageId: "<message@example.com>",
      from: "Jane Client <jane@example.com>",
      to: "admin@example.com",
      date: "2026-09-16T10:00:00.000Z",
      subject: "Campaign question",
      body: "Please share a friendly progress update.",
    });
    runAdminMateChatTurn.mockResolvedValue({
      reply: "Draft created.",
      gmailDraft: {
        gmailUrl: "https://mail.google.com/mail/u/0/#drafts/draft-1",
        subject: "Re: Campaign question",
        to: "jane@example.com",
      },
      runId: "run-1",
      modelRequested: "gpt-5.6-luna",
      modelUsed: "gpt-5.6-luna",
      source: "service-account",
    });
  });

  it("fetches the selected message with the signed-in admin's Gmail token and marks it untrusted", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/chat/route");
    const response = await POST(postRequest({
      message: "Draft a warm reply and mention Friday.",
      attachedEmail: {
        messageId: "gmail-1",
        from: "Spoofed Sender <wrong@example.com>",
        subject: "Spoofed subject",
        body: "Client-supplied body must not be trusted",
      },
    }));

    expect(response.status).toBe(200);
    expect(getValidGmailToken).toHaveBeenCalledWith(17);
    expect(fetchMessageBody).toHaveBeenCalledWith("access-token", "gmail-1");
    const input = runAdminMateChatTurn.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: 17,
      allowGmailDraft: true,
      gmailReplyContext: {
        to: "Jane Client <jane@example.com>",
        subject: "Re: Campaign question",
        threadId: "thread-1",
        inReplyTo: "<message@example.com>",
      },
    });
    const message = input.messages.at(-1).content[0].text as string;
    expect(message).toContain("--- UNTRUSTED attached email content ---");
    expect(message).toContain("From: Jane Client <jane@example.com>");
    expect(message).toContain("Subject: Campaign question");
    expect(message).toContain("Authenticated admin request: Draft a warm reply and mention Friday.");
    expect(message).not.toContain("Spoofed Sender");
    expect(message).not.toContain("Client-supplied body");

    await expect(response.json()).resolves.toMatchObject({
      gmailDraft: { gmailUrl: "https://mail.google.com/mail/u/0/#drafts/draft-1" },
    });
  });

  it("sends attached screenshots to the agent as image parts and returns links", async () => {
    runAdminMateChatTurn.mockResolvedValueOnce({
      reply: "That screenshot is the We Can Quit contract.",
      links: [{ label: "Website Hosting (signed)", href: "/admin/collections/contracts/15" }],
      runId: "run-2",
      modelRequested: "gpt-5.6-luna",
      modelUsed: "gpt-5.6-luna",
      source: "service-account",
    });
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/chat/route");
    const response = await POST(postRequest({
      message: "",
      imageAttachments: [{ name: "contract.png", mediaType: "image/png", data: "iVBORw0KGgo=" }],
    }));

    expect(response.status).toBe(200);
    const content = runAdminMateChatTurn.mock.calls[0][0].messages.at(-1).content;
    expect(content[0]).toEqual({ type: "image", mediaType: "image/png", data: "iVBORw0KGgo=" });
    expect(content[1].text).toContain("Admin attached 1 image: contract.png");
    expect(content[1].text).toContain("untrusted");
    expect(content[1].text).toContain("Please review the attached image.");
    await expect(response.json()).resolves.toMatchObject({
      links: [{ label: "Website Hosting (signed)", href: "/admin/collections/contracts/15" }],
    });
  });

  it("labels screenshots re-sent from an earlier turn", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/chat/route");
    await POST(postRequest({
      message: "and the setup fee?",
      imageAttachments: [{ name: "contract.png", mediaType: "image/png", data: "iVBORw0KGgo=" }],
      imagesFromEarlierTurn: true,
    }));
    const content = runAdminMateChatTurn.mock.calls[0][0].messages.at(-1).content;
    expect(content[0]).toMatchObject({ type: "image" });
    expect(content[1].text).toContain("Re-attached from earlier in this chat 1 image: contract.png");
  });

  it("rejects image data that does not match its declared type", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/chat/route");
    const response = await POST(postRequest({
      message: "What is this?",
      imageAttachments: [{ name: "x.png", mediaType: "image/png", data: "PHN2Zz4=" }],
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/does not match/) });
    expect(runAdminMateChatTurn).not.toHaveBeenCalled();
  });

  it("rejects invalid image attachments before running the agent", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/chat/route");
    const response = await POST(postRequest({
      message: "What is this?",
      imageAttachments: [{ name: "x.svg", mediaType: "image/svg+xml", data: "PHN2Zz4=" }],
    }));

    expect(response.status).toBe(400);
    expect(runAdminMateChatTurn).not.toHaveBeenCalled();
  });

  it("rejects invalid attachment identifiers before accessing Gmail", async () => {
    const { POST } = await import("@/app/(frontend)/api/optimate/adminmate/chat/route");
    const response = await POST(postRequest({
      message: "Draft a reply.",
      attachedEmail: { messageId: "" },
    }));

    expect(response.status).toBe(400);
    expect(getValidGmailToken).not.toHaveBeenCalled();
    expect(runAdminMateChatTurn).not.toHaveBeenCalled();
  });
});
