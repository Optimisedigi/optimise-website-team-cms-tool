import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunAgent } = vi.hoisted(() => ({ mockRunAgent: vi.fn() }));

vi.mock("@/lib/agents/_shared/base-agent", () => ({ runAgent: mockRunAgent }));

import { runAdminMateChatTurn } from "@/lib/agents/adminmate";

const assistantResult = (text: string, steps: unknown[] = []) => ({
  finalMessage: { role: "assistant", content: [{ type: "text", text }] },
  steps,
  totalUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  modelUsed: "gpt-5.6-luna",
  source: "service-account",
  runId: "run-1",
});

const input = {
  messages: [{
    role: "user" as const,
    content: [{ type: "text" as const, text: "Reply warmly to the attached email." }],
  }],
  existingClients: [],
  contractTemplates: [],
  userId: 17,
  allowGmailDraft: true,
  gmailReplyContext: {
    to: "Jane Client <jane@example.com>",
    subject: "Re: Campaign question",
    threadId: "thread-1",
    inReplyTo: "<message@example.com>",
  },
  modelOverride: "gpt-5.6-luna",
};

describe("runAdminMateChatTurn Gmail draft enforcement", () => {
  beforeEach(() => mockRunAgent.mockReset());

  it("retries with a correction when the first attached-email turn omits the draft tool", async () => {
    mockRunAgent
      .mockResolvedValueOnce(assistantResult("Here is some suggested wording."))
      .mockResolvedValueOnce(assistantResult("Draft created.", [{
        step: 1,
        type: "tool-call",
        toolName: "create_gmail_draft",
        output: {
          ok: true,
          data: {
            gmailUrl: "https://mail.google.com/mail/u/0/#drafts/draft-1",
            subject: "Re: Campaign question",
            to: "Jane Client <jane@example.com>",
          },
        },
        timestamp: "2026-09-16T10:00:00.000Z",
      }]));

    const result = await runAdminMateChatTurn(input);

    expect(mockRunAgent).toHaveBeenCalledTimes(2);
    const secondRun = mockRunAgent.mock.calls[1][0];
    expect(secondRun.initialMessages.at(-1).content[0].text).toContain("Call create_gmail_draft now");
    expect(secondRun.context).toMatchObject({
      userId: 17,
      gmailReplyTo: "Jane Client <jane@example.com>",
      gmailReplySubject: "Re: Campaign question",
      gmailReplyThreadId: "thread-1",
      gmailReplyInReplyTo: "<message@example.com>",
    });
    expect(secondRun.tools.map((tool: { name: string }) => tool.name)).toContain("create_gmail_draft");
    expect(result.gmailDraft?.gmailUrl).toBe("https://mail.google.com/mail/u/0/#drafts/draft-1");
  });

  it("fails instead of returning a text-only response when the corrective run also omits the draft", async () => {
    mockRunAgent
      .mockResolvedValueOnce(assistantResult("Suggested reply."))
      .mockResolvedValueOnce(assistantResult("Still no draft."));

    await expect(runAdminMateChatTurn(input)).rejects.toThrow("did not create the required Gmail draft");
    expect(mockRunAgent).toHaveBeenCalledTimes(2);
  });
});
