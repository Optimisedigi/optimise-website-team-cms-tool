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

describe("runAdminMateChatTurn client questions", () => {
  beforeEach(() => mockRunAgent.mockReset());

  const questionInput = (text: string) => ({
    messages: [{ role: "user" as const, content: [{ type: "text" as const, text }] }],
    existingClients: [],
    contractTemplates: [],
    clientDetails: { getProfile: async () => null, getExtras: async () => null, getDiscoveryBriefings: async () => [], getBudget: async () => null, getContracts: async () => [] },
    userId: 17,
    modelOverride: "gpt-5.6-luna",
  });

  it("registers get_client_details when a reader is supplied and not otherwise", async () => {
    mockRunAgent.mockResolvedValue(assistantResult("Account Timeline, 10 Jul 2026: Google ads campaign went live."));

    await runAdminMateChatTurn(questionInput("for client EPG, what date did the Google ads campaigns go live?"));
    expect(mockRunAgent.mock.calls[0][0].tools.map((tool: { name: string }) => tool.name)).toContain("get_client_details");
    expect(mockRunAgent.mock.calls[0][0].systemPrompt).toContain("get_client_details");

    const { clientDetails: _omit, ...withoutReader } = questionInput("hi");
    await runAdminMateChatTurn(withoutReader);
    expect(mockRunAgent.mock.calls[1][0].tools.map((tool: { name: string }) => tool.name)).not.toContain("get_client_details");
  });

  it("registers get_client_links alongside get_client_details", async () => {
    mockRunAgent.mockResolvedValue(assistantResult("Here you go."));
    await runAdminMateChatTurn(questionInput("give me a link to the contract for we can quit"));
    expect(mockRunAgent.mock.calls[0][0].tools.map((tool: { name: string }) => tool.name)).toContain("get_client_links");
  });

  it("returns links from get_client_links as buttons, dropping unsafe or duplicate hrefs", async () => {
    mockRunAgent.mockResolvedValueOnce(assistantResult("Here is the We Can Quit contract.", [{
      step: 1,
      type: "tool-call",
      toolName: "get_client_links",
      output: {
        ok: true,
        data: {
          links: [
            { label: "SEO Retainer (signed)", href: "/admin/collections/contracts/12" },
            { label: "duplicate", href: "/admin/collections/contracts/12" },
            { label: "Phish", href: "https://evil.example/login" },
            { label: "SEO Retainer — signed PDF", href: "/api/contracts/12/download-pdf" },
          ],
        },
      },
      timestamp: "2026-10-02T10:00:00.000Z",
    }]));

    const result = await runAdminMateChatTurn(questionInput("give me a link to the contract for we can quit"));

    expect(result.links).toEqual([
      { label: "SEO Retainer (signed)", href: "/admin/collections/contracts/12" },
      { label: "SEO Retainer — signed PDF", href: "/api/contracts/12/download-pdf" },
    ]);
  });

  it("returns no links when get_client_links was not called", async () => {
    mockRunAgent.mockResolvedValueOnce(assistantResult("The retainer is $1,500."));
    const result = await runAdminMateChatTurn(questionInput("what is the retainer for we can quit?"));
    expect(result.links).toBeUndefined();
  });

  it("does not force a create-client correction when the admin asked a question about a client", async () => {
    mockRunAgent.mockResolvedValueOnce(assistantResult("Yes, the Google Ads ID is set up.", [{
      step: 1,
      type: "tool-call",
      toolName: "get_client_details",
      output: { ok: true, data: { tracking: { googleAdsCustomerIdSet: true } } },
      timestamp: "2026-09-30T10:00:00.000Z",
    }]));

    const result = await runAdminMateChatTurn(questionInput("Is the Google Ads ID set up for the new client EPG?"));

    expect(mockRunAgent).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe("Yes, the Google Ads ID is set up.");
  });
});

describe("runAdminMateChatTurn client proposals", () => {
  beforeEach(() => mockRunAgent.mockReset());

  const proposalInput = (text: string) => ({
    messages: [{
      role: "user" as const,
      content: [{ type: "text" as const, text }],
    }],
    existingClients: [],
    contractTemplates: [],
    userId: 17,
    modelOverride: "gpt-5.6-luna",
  });

  const stagedProposalStep = {
    step: 1,
    type: "tool-call",
    toolName: "stage_client_proposal",
    output: {
      ok: true,
      data: {
        staged: {
          businessName: "Aussie Fluid Power",
          slug: "aussie-fluid-power",
          websiteUrl: "https://www.aussiefluidpower.com.au",
        },
      },
    },
    timestamp: "2026-10-06T10:00:00.000Z",
  };

  it("registers stage_client_proposal and returns the staged proposal card", async () => {
    mockRunAgent.mockResolvedValueOnce(assistantResult("Staged for review.", [stagedProposalStep]));

    const result = await runAdminMateChatTurn(proposalInput("create a client proposal for Aussie Fluid Power"));

    expect(mockRunAgent.mock.calls[0][0].tools.map((tool: { name: string }) => tool.name)).toContain("stage_client_proposal");
    expect(result.stagedProposal).toMatchObject({ businessName: "Aussie Fluid Power", slug: "aussie-fluid-power" });
    expect(result.stagedClient).toBeUndefined();
  });

  it("routes 'create a client proposal' to proposal staging, not client staging", async () => {
    mockRunAgent.mockResolvedValue(assistantResult("Staged.", [stagedProposalStep]));

    const result = await runAdminMateChatTurn(proposalInput("create a client proposal for Aussie Fluid Power"));

    // One run is enough: no create-client correction is forced.
    expect(mockRunAgent).toHaveBeenCalledTimes(1);
    expect(result.stagedProposal?.businessName).toBe("Aussie Fluid Power");
  });

  it("corrects a text-only reply that claims a staged card into a real stage_client_proposal call", async () => {
    mockRunAgent
      .mockResolvedValueOnce(assistantResult("I've staged the new client proposal card for review."))
      .mockResolvedValueOnce(assistantResult("Staged.", [stagedProposalStep]));

    const result = await runAdminMateChatTurn(proposalInput("create a client proposal for Aussie Fluid Power"));

    expect(mockRunAgent).toHaveBeenCalledTimes(2);
    const secondRun = mockRunAgent.mock.calls[1][0];
    expect(secondRun.initialMessages.at(-1).content[0].text).toContain("stage_client_proposal");
    expect(result.stagedProposal?.businessName).toBe("Aussie Fluid Power");
  });

  it("keeps correcting until a card is actually staged", async () => {
    mockRunAgent
      .mockResolvedValueOnce(assistantResult("I've staged the proposal."))
      .mockResolvedValueOnce(assistantResult("I've staged the proposal card again."))
      .mockResolvedValueOnce(assistantResult("Now staged.", [stagedProposalStep]));

    const result = await runAdminMateChatTurn(proposalInput("create a client proposal for Aussie Fluid Power"));

    expect(mockRunAgent).toHaveBeenCalledTimes(3);
    expect(result.stagedProposal?.businessName).toBe("Aussie Fluid Power");
  });
});

describe("runAdminMateChatTurn meeting schedulers", () => {
  beforeEach(() => mockRunAgent.mockReset());

  const meetingInput = (text: string) => ({
    messages: [{ role: "user" as const, content: [{ type: "text" as const, text }] }],
    existingClients: [],
    contractTemplates: [],
    prospects: [{ id: "4", businessName: "Aussie Fluid Power", contactEmail: "priya@afp.com.au" }],
    userId: 17,
    modelOverride: "gpt-5.6-luna",
  });

  const stagedMeetingStep = {
    step: 1,
    type: "tool-call",
    toolName: "stage_meeting_scheduler",
    output: {
      ok: true,
      data: {
        staged: {
          title: "Discovery call",
          link: { kind: "prospect", id: "4", name: "Aussie Fluid Power" },
          durationMinutes: "30",
          timezone: "Australia/Sydney",
          dates: [{ date: "2026-10-13", start: "09:00", end: "12:00" }],
          attendees: [{ name: "Priya", email: "priya@afp.com.au" }],
        },
      },
    },
    timestamp: "2026-10-08T10:00:00.000Z",
  };

  it("registers the meeting tools and returns the staged meeting card", async () => {
    mockRunAgent.mockResolvedValueOnce(assistantResult("Staged.", [stagedMeetingStep]));

    const result = await runAdminMateChatTurn(meetingInput("set up a meeting with Aussie Fluid Power next Tuesday morning"));

    const toolNames = mockRunAgent.mock.calls[0][0].tools.map((tool: { name: string }) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining(["stage_meeting_scheduler", "find_meeting_prospects"]));
    expect(mockRunAgent).toHaveBeenCalledTimes(1);
    expect(result.stagedMeetingScheduler).toMatchObject({
      title: "Discovery call",
      link: { kind: "prospect", id: "4" },
      attendees: [{ email: "priya@afp.com.au", internalConfirmed: false }],
    });
    expect(result.stagedClient).toBeUndefined();
  });

  it("corrects a 'meeting with the client' reply that staged nothing into a stage_meeting_scheduler call", async () => {
    mockRunAgent
      .mockResolvedValueOnce(assistantResult("I've staged the meeting."))
      .mockResolvedValueOnce(assistantResult("Staged.", [stagedMeetingStep]));

    const result = await runAdminMateChatTurn(meetingInput("schedule a meeting with the client Aussie Fluid Power on Tuesday"));

    expect(mockRunAgent).toHaveBeenCalledTimes(2);
    expect(mockRunAgent.mock.calls[1][0].initialMessages.at(-1).content[0].text).toContain("stage_meeting_scheduler");
    expect(result.stagedMeetingScheduler?.title).toBe("Discovery call");
  });
});
