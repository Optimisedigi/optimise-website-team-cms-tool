import { google, type gmail_v1 } from "googleapis";
import { parseGmailFullMessage, readGmailHeader, type GmailFullMessage } from "@/lib/gmail-search";

/**
 * Gmail API calls for the CMS Mail view. Pure transport: no matching, no
 * storage, no model calls. Never logs message content or tokens.
 */

export interface InboxThreadSummary {
  threadId: string;
  /** Latest message in the thread (the one shown in the list). */
  messageId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  messageCount: number;
}

export class GmailHistoryExpiredError extends Error {}

function gmailApi(accessToken: string): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

function isoDate(value: string, internalDate?: string | null): string {
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  const internal = Number(internalDate);
  return Number.isFinite(internal) && internal > 0 ? new Date(internal).toISOString() : "";
}

/** Run `fn` over items with a small concurrency cap (Gmail per-user rate limits). */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

const SKIP_LABELS = new Set(["DRAFT", "SPAM", "TRASH", "CHAT"]);

export function isSyncableLabelSet(labelIds: string[] | null | undefined): boolean {
  return !(labelIds ?? []).some((label) => SKIP_LABELS.has(label));
}

export async function listInboxThreads(
  accessToken: string,
  options: { pageToken?: string; q?: string; maxResults?: number } = {},
): Promise<{ threads: InboxThreadSummary[]; nextPageToken: string | null }> {
  const gmail = gmailApi(accessToken);
  const list = await gmail.users.threads.list({
    userId: "me",
    labelIds: ["INBOX"],
    maxResults: Math.min(Math.max(options.maxResults ?? 25, 1), 50),
    ...(options.pageToken ? { pageToken: options.pageToken } : {}),
    ...(options.q ? { q: options.q } : {}),
  });
  const ids = (list.data.threads ?? []).map((thread) => thread.id).filter((id): id is string => Boolean(id));
  const threads = await mapLimited(ids, 8, async (id) => {
    const res = await gmail.users.threads.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
    });
    const messages = res.data.messages ?? [];
    const latest = messages[messages.length - 1];
    const first = messages[0];
    const headers = latest?.payload?.headers;
    return {
      threadId: id,
      messageId: latest?.id ?? "",
      from: readGmailHeader(headers, "From"),
      to: readGmailHeader(headers, "To"),
      cc: readGmailHeader(headers, "Cc"),
      subject: readGmailHeader(first?.payload?.headers, "Subject") || readGmailHeader(headers, "Subject"),
      snippet: latest?.snippet ?? "",
      date: isoDate(readGmailHeader(headers, "Date"), latest?.internalDate),
      unread: messages.some((message) => (message.labelIds ?? []).includes("UNREAD")),
      messageCount: messages.length,
    } satisfies InboxThreadSummary;
  });
  return { threads, nextPageToken: list.data.nextPageToken ?? null };
}

export async function getThreadMessages(accessToken: string, threadId: string): Promise<GmailFullMessage[]> {
  const gmail = gmailApi(accessToken);
  const res = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  return (res.data.messages ?? []).map(parseGmailFullMessage);
}

export async function getFullMessage(accessToken: string, messageId: string): Promise<GmailFullMessage> {
  const gmail = gmailApi(accessToken);
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  return parseGmailFullMessage(res.data);
}

export interface MessageHeadersOnly {
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  labelIds: string[];
}

export async function getMessageHeaders(accessToken: string, ids: string[]): Promise<MessageHeadersOnly[]> {
  const gmail = gmailApi(accessToken);
  return mapLimited(ids, 8, async (id) => {
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc"],
    });
    const headers = res.data.payload?.headers;
    return {
      messageId: res.data.id ?? id,
      threadId: res.data.threadId ?? "",
      from: readGmailHeader(headers, "From"),
      to: readGmailHeader(headers, "To"),
      cc: readGmailHeader(headers, "Cc"),
      labelIds: res.data.labelIds ?? [],
    };
  });
}

/** Archive = remove INBOX. Read/unread = remove/add UNREAD. Needs gmail.modify. */
export async function modifyThreadLabels(
  accessToken: string,
  threadId: string,
  change: { add?: string[]; remove?: string[] },
): Promise<void> {
  const gmail = gmailApi(accessToken);
  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: { addLabelIds: change.add ?? [], removeLabelIds: change.remove ?? [] },
  });
}

export async function getMailboxProfile(accessToken: string): Promise<{ emailAddress: string; historyId: string }> {
  const gmail = gmailApi(accessToken);
  const res = await gmail.users.getProfile({ userId: "me" });
  return { emailAddress: res.data.emailAddress ?? "", historyId: String(res.data.historyId ?? "") };
}

/**
 * Message ids added since `startHistoryId` (Gmail incremental sync).
 * Throws GmailHistoryExpiredError when Gmail no longer has that history (404),
 * so the caller can fall back to a recent-window sync.
 */
export async function listAddedMessageIdsSince(
  accessToken: string,
  startHistoryId: string,
  maxIds = 500,
): Promise<string[]> {
  const gmail = gmailApi(accessToken);
  const ids = new Set<string>();
  let pageToken: string | undefined;
  try {
    do {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        maxResults: 500,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const entry of res.data.history ?? []) {
        for (const added of entry.messagesAdded ?? []) {
          const message = added.message;
          if (message?.id && isSyncableLabelSet(message.labelIds)) ids.add(message.id);
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && ids.size < maxIds);
  } catch (err) {
    const status = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
    if (status === 404) throw new GmailHistoryExpiredError("Gmail history expired");
    throw err;
  }
  return [...ids].slice(0, maxIds);
}

/** Recent message ids (received and sent) for the first sync or after history expiry. */
export async function listRecentMessageIds(accessToken: string, days: number, maxIds: number): Promise<string[]> {
  const gmail = gmailApi(accessToken);
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: `newer_than:${days}d -in:chats -in:drafts -in:spam -in:trash`,
      maxResults: Math.min(100, maxIds - ids.length),
      ...(pageToken ? { pageToken } : {}),
    });
    for (const message of res.data.messages ?? []) if (message.id) ids.push(message.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < maxIds);
  return ids.slice(0, maxIds);
}

export function gmailMessageLink(messageId: string, account?: string): string {
  const user = account ? encodeURIComponent(account) : "0";
  return `https://mail.google.com/mail/u/${user}/#all/${messageId}`;
}
