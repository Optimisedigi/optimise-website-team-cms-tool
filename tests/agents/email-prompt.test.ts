import { describe, expect, it } from "vitest";
import {
  buildEmailReplySystemPrompt,
  extractLatestGmailDraft,
  extractLatestStagedEmailReply,
} from "@/lib/agents/optimate-email";
import { stageEmailReplyTool } from "@/lib/agents/optimate-email/tools/stage-email-reply";
import type { AgentStep } from "@/lib/agents/_shared/types";

describe("GmailMate email drafting prompt", () => {
  it("tells GmailMate to improve rough user notes instead of copying them verbatim", () => {
    const prompt = buildEmailReplySystemPrompt();

    expect(prompt).toContain("turn rough notes, direct requests, dictation, and short instructions into clear, polished, customer-facing email replies");
    expect(prompt).toContain("By default, treat the user's wording as instructions or rough source notes, not copy to paste");
    expect(prompt).toContain("convert it into a natural email paragraph rather than copying the phrase verbatim");
    expect(prompt).toContain("Preserve specific wording when the user frames a point as wording to include");
    expect(prompt).toContain("'say it this way', 'word it like', or quoted text they ask you to add");
  });

  it("describes staged email bodies as polished customer-facing copy", () => {
    expect(stageEmailReplyTool.description).toContain("finished, polished `body`");
    expect(stageEmailReplyTool.description).toContain("By default, improve rough user notes, direct requests, dictation, or blunt wording");
    expect(stageEmailReplyTool.description).toContain("Preserve specific wording when the user frames a point as wording to include");
    expect(stageEmailReplyTool.inputSchema.properties.body.description).toContain("preserve specific phrasing when the user clearly asks you to include it");
  });

  it("extracts staged replies from runAgent tool output", () => {
    const steps: AgentStep[] = [
      {
        step: 1,
        type: "tool-call",
        toolName: "stage_email_reply",
        output: JSON.stringify({ staged: true, body: "Hi Sam,\n\nThanks for this.", subject: "Re: Update" }),
        timestamp: "2026-06-23T00:00:00.000Z",
      },
    ];

    expect(extractLatestStagedEmailReply(steps)).toEqual({
      body: "Hi Sam,\n\nThanks for this.",
      subject: "Re: Update",
    });
  });

  it("extracts Gmail draft links from runAgent tool output", () => {
    const steps: AgentStep[] = [
      {
        step: 1,
        type: "tool-call",
        toolName: "create_gmail_draft",
        output: JSON.stringify({
          gmailUrl: "https://mail.google.com/mail/u/0/#drafts/msg-123",
          draftId: "draft-123",
          messageId: "msg-123",
          subject: "Re: Update",
          to: "client@example.com",
        }),
        timestamp: "2026-06-23T00:00:00.000Z",
      },
    ];

    expect(extractLatestGmailDraft(steps)).toEqual({
      gmailUrl: "https://mail.google.com/mail/u/0/#drafts/msg-123",
      draftId: "draft-123",
      messageId: "msg-123",
      subject: "Re: Update",
      to: "client@example.com",
    });
  });
});
