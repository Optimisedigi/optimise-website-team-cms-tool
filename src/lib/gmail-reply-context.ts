import type { GmailMessageBody } from "@/lib/gmail-search";

/**
 * Trusted reply metadata for drafting a Gmail reply to a specific message.
 *
 * Built server-side from a message fetched with the user's own Gmail token,
 * never from model output, so an attached (untrusted) email cannot redirect
 * the reply or move it into another thread. Gmail only threads a draft when
 * the threadId, In-Reply-To/References and a matching "Re:" subject are all
 * present, so all of them are pinned together.
 */
export interface GmailReplyContext {
  to: string;
  subject: string;
  threadId?: string;
  inReplyTo?: string;
}

const MAX_MESSAGE_ID_LENGTH = 256;

/** Validate a client-supplied Gmail message id. Returns null when unusable. */
export function parseGmailMessageId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id.length > MAX_MESSAGE_ID_LENGTH) return null;
  // Gmail API message ids are hex; allow URL-safe id characters only.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

function sanitizeHeader(value: string | undefined, maxLength: number): string {
  return (value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, maxLength);
}

export function buildGmailReplyContext(
  email: Pick<GmailMessageBody, "from" | "subject" | "threadId" | "rfcMessageId">,
): GmailReplyContext {
  const to = sanitizeHeader(email.from, 998);
  const originalSubject = sanitizeHeader(email.subject, 998) || "(no subject)";
  const threadId = sanitizeHeader(email.threadId, 256);
  const inReplyTo = sanitizeHeader(email.rfcMessageId, 998);
  const subject = (/^re\s*:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`).slice(0, 998);
  return {
    to,
    subject,
    ...(threadId ? { threadId } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
  };
}

/** Agent tool-context keys read by create_gmail_draft. */
export const GMAIL_REPLY_CONTEXT_KEYS = [
  "gmailReplyTo",
  "gmailReplySubject",
  "gmailReplyThreadId",
  "gmailReplyInReplyTo",
] as const;

export function gmailReplyAgentContext(reply: GmailReplyContext | undefined): Record<string, string> {
  if (!reply) return {};
  return {
    gmailReplyTo: reply.to,
    gmailReplySubject: reply.subject,
    ...(reply.threadId ? { gmailReplyThreadId: reply.threadId } : {}),
    ...(reply.inReplyTo ? { gmailReplyInReplyTo: reply.inReplyTo } : {}),
  };
}

/** Copy of an agent context with any pinned Gmail reply metadata removed. */
export function withoutGmailReplyContext(context: Record<string, unknown>): Record<string, unknown> {
  const out = { ...context };
  for (const key of GMAIL_REPLY_CONTEXT_KEYS) delete out[key];
  return out;
}

/**
 * Trusted note appended to the user turn so the model knows drafts will be
 * threaded. Deliberately excludes the (untrusted) subject/sender text.
 */
export const GMAIL_REPLY_TARGET_NOTE =
  "[System note: the user has pinned a Gmail email as the reply target for this chat. Any Gmail draft you create with create_gmail_draft is saved automatically as a threaded reply to that email; the recipient and Re: subject are set for you, so do not ask who to send it to.]";
