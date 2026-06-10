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
 * fills the review box → the user confirms → the UI saves via /api/gmail/draft
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
    "Put your drafted email reply into the chat review box for the user to read, edit, and confirm. NO side effects — this does NOT save to Gmail. This is your primary drafting tool: after talking through what the reply should say, call this with the finished `body` (plain text or markdown-lite; do NOT include a signature, it is added automatically on save) and an optional `subject`. The user reviews it in the box and clicks Save to push it to Gmail Drafts. Re-call this to revise after feedback. Only use create_gmail_draft instead when the user explicitly says to save the draft to Gmail right now.",
  inputSchema: {
    type: "object",
    properties: {
      body: {
        type: "string",
        minLength: 1,
        description:
          "The full email reply body in plain text or markdown-lite. No subject line, headers, or signature.",
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
    // No side effects. Echo the staged reply back so the voice bridge can hand
    // it to the chat UI's review box. The model is told the draft is now shown
    // for the user to confirm.
    return {
      ok: true,
      data: {
        staged: true,
        subject: args.subject ?? null,
        body: args.body,
        note: "The drafted reply is now shown in the chat review box for the user to read, edit, and confirm. Do not claim it has been saved to Gmail — the user must press Save.",
      },
    };
  },
};
