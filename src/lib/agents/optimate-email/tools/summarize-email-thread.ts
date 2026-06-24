/**
 * Tool: summarize_email_thread
 *
 * Fetches the full Gmail thread (all messages) and returns a concise summary
 * for the user to review before drafting a reply. This is especially useful
 * when a long back-and-forth thread is shared and the user wants to understand
 * the full context before deciding how to respond.
 *
 * Flow:
 *   1. User asks for a summary → agent calls this tool
 *   2. Tool returns a structured summary (key points, open questions, action items,
 *      sender timeline, overall tone)
 *   3. User reviews the summary in chat, then says "write a reply" or similar
 *   4. The summary is already in the conversation history, so the agent naturally
 *      carries that context into stage_email_reply when drafting the reply.
 *
 * This tool has NO side effects — it only reads Gmail data.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { fetchThreadContext } from "@/lib/gmail-search";

interface SummarizeEmailThreadArgs {
  threadId: string;
  maxMessages?: number;
}

export const summarizeEmailThreadTool: CanonicalTool<SummarizeEmailThreadArgs> = {
  name: "summarize_email_thread",
  description:
    "Fetch and summarize a full Gmail email thread by its threadId. Returns a structured summary with: key points from each message, open questions or unresolved items, any action items or deadlines mentioned, a brief sender timeline, and the overall tone of the thread. Use this when the user wants to understand a long thread before replying, or when they share a thread and ask 'what's going on here' or 'give me a summary'. After returning the summary, wait for the user to request a reply draft — do NOT automatically draft a reply. The summary will remain in the conversation history so it is available when the user later asks to write a reply.",
  inputSchema: {
    type: "object",
    properties: {
      threadId: {
        type: "string",
        minLength: 1,
        description: "Gmail thread ID to summarize. Obtain from search_gmail_inbox results or from an attached email's threadId.",
      },
      maxMessages: {
        type: "number",
        description: "Optional max number of messages to include in the summary. Default is the full thread. Use when the thread is extremely long and the user only wants the most recent N messages.",
      },
    },
    required: ["threadId"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const threadId = typeof obj.threadId === "string" ? obj.threadId.trim() : "";
    if (!threadId) throw new Error("threadId is required");
    const out: SummarizeEmailThreadArgs = { threadId };
    if (typeof obj.maxMessages === "number") {
      out.maxMessages = Math.max(1, Math.round(obj.maxMessages));
    }
    return out;
  },
  execute: async (args, ctx) => {
    const userId = ctx.context.userId as number | undefined;
    if (userId === undefined || userId === null) {
      return { ok: false, error: "No CMS user in context; cannot read Gmail thread." };
    }
    const tokenResult = await getValidGmailToken(userId);
    if (!tokenResult.ok) {
      return { ok: false, error: `Gmail not available: ${tokenResult.reason}` };
    }
    try {
      const thread = await fetchThreadContext(
        tokenResult.accessToken,
        args.threadId,
        args.maxMessages,
      );
      if (!thread.messages.length) {
        return { ok: false, error: "Thread found but contains no messages." };
      }
      const summary = buildThreadSummary(thread);
      return {
        ok: true,
        data: {
          threadId: thread.threadId,
          messageCount: thread.messages.length,
          summary,
          note: "Summary delivered. The user can now review it and ask to draft a reply. When they do, use the summary context (already in conversation history) to inform the reply.",
        },
      };
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
      return { ok: false, error: `Gmail thread summary failed: ${e.message ?? "unknown error"}` };
    }
  },
};

interface ThreadSummaryMessage {
  from: string;
  date: string;
  subject: string;
  body: string;
}

interface ThreadSummaryData {
  threadId: string;
  messages: ThreadSummaryMessage[];
}

function buildThreadSummary(thread: ThreadSummaryData): string {
  const lines: string[] = [];
  lines.push(`Thread summary (${thread.messages.length} message${thread.messages.length === 1 ? "" : "s"}):`);
  lines.push("");

  // Cap per-message body to keep total summary reasonable within the agent's
  // 8k token budget (roughly 32k chars). Distribute budget across messages.
  const perMessageBodyChars = Math.min(
    12000,
    Math.max(500, Math.floor(30000 / Math.max(1, thread.messages.length))),
  );

  // Sender timeline
  const participants = new Map<string, number>();
  for (const msg of thread.messages) {
    const sender = parseSenderName(msg.from);
    participants.set(sender, (participants.get(sender) ?? 0) + 1);
  }
  const participantList = Array.from(participants.entries())
    .map(([name, count]) => `${name}${count > 1 ? ` (${count} msgs)` : ""}`)
    .join(", ");
  lines.push(`Participants: ${participantList}`);
  lines.push("");

  // Message-by-message key points
  for (let i = 0; i < thread.messages.length; i++) {
    const msg = thread.messages[i];
    const sender = parseSenderName(msg.from);
    const date = msg.date ? formatDate(msg.date) : "unknown date";
    const subject = msg.subject || "(no subject)";
    const bodyPreview = msg.body.trim().slice(0, perMessageBodyChars);
    const truncated = msg.body.trim().length > perMessageBodyChars ? " …" : "";

    lines.push(`--- Message ${i + 1} ---`);
    lines.push(`From: ${sender}`);
    lines.push(`Date: ${date}`);
    lines.push(`Subject: ${subject}`);
    lines.push("");
    lines.push(`${bodyPreview}${truncated}`);
    lines.push("");
  }

  // Overall tone assessment (heuristic)
  const allBodies = thread.messages.map((m) => m.body.toLowerCase()).join(" ");
  const tone = assessTone(allBodies);
  lines.push(`Overall tone: ${tone}`);

  // Extract potential action items / deadlines
  const actionItems = extractActionItems(thread.messages);
  if (actionItems.length > 0) {
    lines.push("");
    lines.push("Mentions / possible action items:");
    for (const item of actionItems) {
      lines.push(`  • ${item}`);
    }
  }

  lines.push("");
  lines.push("End of summary. Ask the user if they'd like a reply drafted based on this thread.");

  return lines.join("\n");
}

function parseSenderName(from: string): string {
  const m = from.match(/^(.*?)<([^>]+)>$/);
  if (m) {
    return m[1].replace(/^"|"$/g, "").trim() || m[2].trim();
  }
  return from.trim();
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoDate;
  }
}

function assessTone(allText: string): string {
  const urgent = /\b(urgent|asap|immediately|deadline|overdue|late|missed|critical|emergency)\b/.test(allText);
  const frustrated = /\b(disappointed|frustrated|unhappy|concerned|issue|problem|complaint|not working|broken|wrong|error|fail)\b/.test(allText);
  const positive = /\b(thank|appreciate|great|excellent|good|love|perfect|happy|pleased|wonderful|awesome)\b/.test(allText);
  const questionHeavy = (allText.match(/\?/g) || []).length >= 3;

  const tones: string[] = [];
  if (urgent) tones.push("urgent");
  if (frustrated) tones.push("concerned / frustrated");
  if (positive) tones.push("positive");
  if (questionHeavy) tones.push("question-heavy");
  if (tones.length === 0) tones.push("neutral / informational");
  return tones.join(", ");
}

function extractActionItems(messages: ThreadSummaryMessage[]): string[] {
  const items: string[] = [];
  const seen = new Set<string>();

  // Simple regex-based extraction of common patterns
  const actionPatterns = [
    /\b(please\s+\w+.*?)(?:\.|\n|$)/gi,
    /\b(can\s+you\s+.*?)(?:\.|\n|$)/gi,
    /\b(could\s+you\s+.*?)(?:\.|\n|$)/gi,
    /\b(need\s+to\s+.*?)(?:\.|\n|$)/gi,
    /\b(need\s+you\s+to\s+.*?)(?:\.|\n|$)/gi,
    /\b(let['']?s\s+\w+.*?)(?:\.|\n|$)/gi,
    /\b(by\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|next\s+week|end\s+of\s+\w+|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|\d{1,2}[\/\-]\d{1,2}[\/\-]?\d{0,4})).*?/gi,
    /\b(deadline\s+(?:is|of)\s+.*?)(?:\.|\n|$)/gi,
  ];

  for (const msg of messages) {
    for (const pattern of actionPatterns) {
      const matches = msg.body.matchAll(pattern);
      for (const match of matches) {
        const text = match[0]?.trim();
        if (!text || text.length < 10 || text.length > 200) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(`${parseSenderName(msg.from)}: ${text}`);
      }
    }
  }

  // Limit to top items
  return items.slice(0, 8);
}
