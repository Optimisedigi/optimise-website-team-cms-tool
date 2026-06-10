/**
 * Tool: search_gmail_inbox
 *
 * Read-only Gmail inbox search for the Email Reply voice agent. Wraps the same
 * `searchInbox` primitive the launcher's "attach email" UI uses. Requires the
 * connected user's `gmail.readonly` scope. Returns lightweight metadata only.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { searchInbox } from "@/lib/gmail-search";

interface SearchGmailInboxArgs {
  query: string;
  max?: number;
}

export const searchGmailInboxTool: CanonicalTool<SearchGmailInboxArgs> = {
  name: "search_gmail_inbox",
  description:
    "Search the connected user's Gmail inbox using Gmail search syntax (e.g. 'from:jane subject:invoice newer_than:7d'). Read-only. Returns up to 20 matches with messageId, threadId, subject, from, date, and snippet. Use the returned messageId with read_gmail_message to read a full message before drafting a reply.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        minLength: 1,
        description: "Gmail search query string.",
      },
      max: {
        type: "number",
        description: "Max results to return. Default 20, max 50.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const query = typeof obj.query === "string" ? obj.query.trim() : "";
    if (!query) throw new Error("query is required");
    const out: SearchGmailInboxArgs = { query };
    if (typeof obj.max === "number") out.max = Math.max(1, Math.min(50, Math.round(obj.max)));
    return out;
  },
  execute: async (args, ctx) => {
    const userId = ctx.context.userId as number | undefined;
    if (userId === undefined || userId === null) {
      return { ok: false, error: "No CMS user in context; cannot search Gmail." };
    }
    const tokenResult = await getValidGmailToken(userId);
    if (!tokenResult.ok) {
      return { ok: false, error: `Gmail not available: ${tokenResult.reason}` };
    }
    try {
      const { results } = await searchInbox(tokenResult.accessToken, args.query, args.max ?? 20);
      return { ok: true, data: { count: results.length, results } };
    } catch (err) {
      const e = err as { code?: number; status?: number; message?: string };
      const status = e.code ?? e.status ?? 0;
      if (status === 401 || status === 403) {
        return {
          ok: false,
          error:
            "Gmail returned insufficient permissions. The user needs to reconnect Gmail to grant read access.",
        };
      }
      return { ok: false, error: `Gmail search failed: ${e.message ?? "unknown error"}` };
    }
  },
};
