/**
 * Tool: stage_email_reply
 *
 * The OptiMate Email Reply voice agent's primary drafting tool. It has NO side
 * effects: it does not touch Gmail. It simply hands the drafted reply text back
 * to the chat UI so the human can read, edit, and confirm it directly in the
 * chat transcript before it ever becomes a Gmail draft.
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

import { removeForbiddenDashes } from "@/lib/agents/_shared/forbidden-dash-sanitizer";
import type { CanonicalTool } from "@/lib/agents/_shared/tool";

interface StageEmailReplyArgs {
  body: string;
  subject?: string;
}

export const stageEmailReplyTool: CanonicalTool<StageEmailReplyArgs> = {
  name: "stage_email_reply",
  description:
    "Show your drafted email in the chat for the user to read, edit and confirm. No side effects: it does not save to Gmail (the user clicks Create Gmail draft for that). Whenever you write or revise an email body, call this with the finished, polished `body` and optional `subject`; the user only sees a draft through this tool, so never describe or claim a draft in chat text instead. Start with a natural greeting, put the introduction right after it, and end on the final substantive sentence. Do NOT include a manual sign-off or sender name (including 'Thanks', 'Regards', or 'Peter'); Gmail adds the automated signature. By default, improve rough user notes, direct requests, dictation, or blunt wording into a clear customer-facing email rather than copying the instruction as the body. Preserve specific wording when the user frames a point as wording to include, e.g. 'say it this way' or quoted text. Re-call to revise after feedback. Use create_gmail_draft only when the user explicitly says to save the draft to Gmail right now.",
  inputSchema: {
    type: "object",
    properties: {
      body: {
        type: "string",
        minLength: 1,
        description:
          "The full polished email body in plain text or markdown-lite. Rewrite rough user notes into natural email copy by default; preserve specific phrasing when the user clearly asks you to include it. For a requested table (including from a pasted screenshot), use a markdown table with a header row and separator row; the Gmail renderer adds borders and a light-blue header. Leave out cells you can't read and ask. No subject line, headers or signature.",
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
    const body = typeof obj.body === "string" ? removeForbiddenDashes(obj.body).trim() : "";
    if (!body) throw new Error("body is required and must be non-empty");
    const out: StageEmailReplyArgs = { body };
    if (typeof obj.subject === "string" && obj.subject.trim().length > 0) {
      out.subject = removeForbiddenDashes(obj.subject).trim();
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
