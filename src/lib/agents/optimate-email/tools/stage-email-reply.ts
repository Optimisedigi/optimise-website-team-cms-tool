/**
 * Tool: stage_email_reply
 *
 * The OptiMate Email Reply voice agent's primary drafting tool. It has NO side
 * effects: it does not touch Gmail. It simply hands the drafted reply text back
 * to the chat UI so the human can read, edit, and confirm it in the review box
 * before it ever becomes a Gmail draft.
 *
 * Flow: the user talks to the agent about what the reply should say → the agent
 * calls this tool with the finished `body` (and optional `subject`) → the UI
 * shows the drafted email directly in the chat transcript → the user can ask
 * for edits or click Create Gmail draft, which saves via /api/gmail/draft
 * (threaded when replying to an existing message). Gmail stays draft-only.
 *
 * Use this for the conversational draft-and-review loop. Only use
 * `create_gmail_draft` when the user explicitly asks you to save the draft to
 * Gmail right now without further review.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";

interface StageEmailReplyArgs {
  body: string;
  subject?: string;
}

export const stageEmailReplyTool: CanonicalTool<StageEmailReplyArgs> = {
  name: "stage_email_reply",
  description:
    "Show your drafted email reply directly in the chat so the user can read it, ask for edits, and confirm. NO side effects — this does NOT save to Gmail. This is your PRIMARY and MANDATORY drafting tool: whenever you have written or revised any email body, you MUST call this with the finished, polished `body` (plain text or markdown-lite; do NOT include a signature, it is added automatically on save) and an optional `subject`. Never describe, summarise, or claim a draft is ready in chat text without calling this tool — the user only sees the draft when you call it. By default, improve rough user notes, direct requests, dictation, or blunt wording into a clear customer-facing email; do not copy the user's instruction verbatim as the body. Preserve specific wording when the user frames a point as wording to include, for example 'say it this way', 'word it like', or quoted text they ask you to add. After calling this, the draft appears in the chat and the user can click Create Gmail draft to push it to Gmail Drafts. Re-call this to revise after feedback. Only use create_gmail_draft instead when the user explicitly says to save the draft to Gmail right now.",
  inputSchema: {
    type: "object",
    properties: {
      body: {
        type: "string",
        minLength: 1,
        description:
          "The full polished email reply body in plain text or markdown-lite. Rewrite rough user notes into natural email copy by default; preserve specific phrasing when the user clearly asks you to include it. No subject line, headers, or signature.",
      },
      subject: {
        type: "string",
        description:
          "Optional subject line. When replying to an existing email, omit it — the UI keeps the Re: subject of the original thread.",
      },
    },
    required: ["body"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const body = typeof obj.body === "string" ? obj.body.trim() : "";
    if (!body) throw new Error("body is required and must be non-empty");
    const out: StageEmailReplyArgs = { body };
    if (typeof obj.subject === "string" && obj.subject.trim().length > 0) {
      out.subject = obj.subject.trim();
    }
    return out;
  },
  execute: async (args) => {
    // No side effects. Echo the staged reply back so the chat UI (and the voice
    // bridge) can render the draft directly in the transcript. The model is told
    // the draft is now shown in chat for the user to confirm.
    return {
      ok: true,
      data: {
        staged: true,
        subject: args.subject ?? null,
        body: args.body,
        note: "The drafted reply is now shown directly in the chat for the user to read, edit, and confirm. Do not claim it has been saved to Gmail — the user must click Create Gmail draft.",
      },
    };
  },
};
