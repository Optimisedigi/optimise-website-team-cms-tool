/**
 * Tool: create_gmail_draft
 *
 * Creates a one-off draft in the proposing CMS user's own Gmail Drafts folder.
 * Never sends mail. The user reviews, picks a recipient (if not provided),
 * and hits Send themselves.
 *
 * This is the agent-callable wrapper around the same `createGmailDraft`
 * primitive used by:
 *   - the in-chat "Save as draft" button (POST /api/gmail/draft)
 *   - the scheduled-task tick (server/api/scheduled-tasks/tick)
 *
 * Use when the user asks for a one-off email draft NOW (vs propose_scheduled_task,
 * which sets up a RECURRING draft fired by cron). Typical use: pair with
 * get_budget_management_email — fetch the HTML, then drop it into Drafts in
 * one chain so the user gets a real Gmail draft, not a wall of HTML in chat.
 *
 * Args:
 *   - subject (required): the email subject line
 *   - htmlBody (required): the email body. Pass the EXACT `html` string from
 *     get_budget_management_email verbatim, or any other HTML the agent built
 *     for the user.
 *   - to (optional): default recipient. Omit to leave the recipient blank
 *     (Gmail will force the user to pick one before sending).
 *
 * Auth: requires ctx.context.userId AND the user must have Gmail connected
 * via /api/gmail/connect (gmail.compose scope). Returns a clear error if not.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { createGmailDraft } from "@/lib/gmail-service";

interface CreateGmailDraftArgs {
  subject: string;
  htmlBody: string;
  to?: string;
}

export const createGmailDraftTool: CanonicalTool<CreateGmailDraftArgs> = {
  name: "create_gmail_draft",
  description:
    "Create a ONE-OFF draft in the user's own Gmail Drafts folder, right now. Never sends mail. Use when the user asks for a draft email NOW (not on a schedule), including drafts based on the current conversation or an OptiMate analysis. The classic pairing: call get_budget_management_email first, then pass its `html` field as `htmlBody` here so the budget email lands as a real Gmail draft instead of pasted HTML in chat. For general emails, pass the client-ready body as `htmlBody`. Args: subject (required), htmlBody (required, raw HTML), to (optional recipient — leave blank if user didn't specify; Gmail forces them to pick one before sending). Requires the CMS user to have Gmail connected. Returns the Gmail deep-link to the draft. NOT for recurring drafts — use propose_scheduled_task for those.",
  inputSchema: {
    type: "object",
    properties: {
      subject: { type: "string", minLength: 1, maxLength: 998 },
      htmlBody: { type: "string", minLength: 1 },
      to: { type: "string" },
    },
    required: ["subject", "htmlBody"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const subject = String(obj.subject ?? "").trim();
    if (!subject) throw new Error("subject is required");
    if (subject.length > 998) throw new Error("subject exceeds RFC 5322 998-char limit");
    const htmlBody = typeof obj.htmlBody === "string" ? obj.htmlBody : "";
    if (htmlBody.trim().length === 0) throw new Error("htmlBody is required and must be non-empty");
    const out: CreateGmailDraftArgs = { subject, htmlBody };
    if (typeof obj.to === "string" && obj.to.trim().length > 0) {
      out.to = obj.to.trim();
    }
    return out;
  },
  execute: async (args, ctx) => {
    const userId = ctx.context.userId as number | undefined;
    if (userId === undefined || userId === null) {
      return {
        ok: false,
        error:
          "No CMS user in chat context; cannot create a Gmail draft. This tool only works in an authenticated chat session.",
      };
    }

    const tokenResult = await getValidGmailToken(userId);
    if (!tokenResult.ok) {
      // Surface the exact reason so the agent can tell the user what to do
      // (most often: "Connect Gmail at /admin/account").
      return {
        ok: false,
        error: `Gmail not available for user ${userId}: ${tokenResult.reason}`,
      };
    }

    try {
      const result = await createGmailDraft(tokenResult.accessToken, {
        to: args.to ?? "",
        subject: args.subject,
        htmlBody: args.htmlBody,
      });
      const gmailUrl = `https://mail.google.com/mail/u/0/#drafts/${result.messageId}`;
      return {
        ok: true,
        data: {
          draftId: result.draftId,
          messageId: result.messageId,
          gmailUrl,
          to: args.to ?? "",
          subject: args.subject,
        },
      };
    } catch (err) {
      const e = err as { code?: number; status?: number; message?: string };
      const status = e.code ?? e.status ?? 0;
      if (status === 401 || status === 403) {
        return {
          ok: false,
          error:
            "Gmail returned insufficient permissions. The user needs to reconnect Gmail to grant compose access.",
        };
      }
      return {
        ok: false,
        error: `Gmail draft creation failed: ${e.message ?? "unknown error"}`,
      };
    }
  },
};
