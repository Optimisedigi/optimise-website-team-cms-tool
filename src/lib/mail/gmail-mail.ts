import { google, type gmail_v1 } from "googleapis";
import { parseGmailFullMessage, readGmailHeader, type GmailFullMessage } from "@/lib/gmail-search";
import type { MailFolder } from "@/lib/mail/folders";

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

/** Gmail system label behind each Mail folder. */
const FOLDER_LABELS: Record<MailFolder, string> = { inbox: "INBOX", sent: "SENT", drafts: "DRAFT" };

/**
 * Threads in one folder, newest first (Gmail order). Each row describes the
 * message shown in the list: for the inbox that is the latest message in the
 * thread; for Sent and Drafts it is the latest message carrying that label, so
 * a sent thread shows what you sent (not an incoming reply) and a drafts row's
 * `messageId` is the draft message itself (what `/api/gmail/draft` opens).
 */
export async function listFolderThreads(
  accessToken: string,
  folder: MailFolder,
  options: { pageToken?: string; q?: string; maxResults?: number } = {},
): Promise<{ threads: InboxThreadSummary[]; nextPageToken: string | null }> {
  const gmail = gmailApi(accessToken);
  const label = FOLDER_LABELS[folder];
  const list = await gmail.users.threads.list({
    userId: "me",
    labelIds: [label],
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
    const shown =
      folder === "inbox"
        ? latest
        : ([...messages].reverse().find((message) => (message.labelIds ?? []).includes(label)) ?? latest);
    const first = messages[0];
    const headers = shown?.payload?.headers;
    return {
      threadId: id,
      messageId: shown?.id ?? "",
      from: readGmailHeader(headers, "From"),
      to: readGmailHeader(headers, "To"),
      cc: readGmailHeader(headers, "Cc"),
      subject: readGmailHeader(first?.payload?.headers, "Subject") || readGmailHeader(headers, "Subject"),
      snippet: shown?.snippet ?? "",
      date: isoDate(readGmailHeader(headers, "Date"), shown?.internalDate),
      unread: messages.some((message) => (message.labelIds ?? []).includes("UNREAD")),
      messageCount: messages.length,
    } satisfies InboxThreadSummary;
  });
  return { threads, nextPageToken: list.data.nextPageToken ?? null };
}

export interface MailFolderCounts {
  /** Inbox threads with unread mail (Gmail's own count, includes hidden senders). */
  inboxUnread: number;
  /** Draft threads, the same unit as the Drafts list rows. */
  drafts: number;
}

/** Two label lookups, no message reads. Sent is deliberately not counted. */
export async function getFolderCounts(accessToken: string): Promise<MailFolderCounts> {
  const gmail = gmailApi(accessToken);
  const [inbox, drafts] = await Promise.all([
    gmail.users.labels.get({ userId: "me", id: FOLDER_LABELS.inbox }),
    gmail.users.labels.get({ userId: "me", id: FOLDER_LABELS.drafts }),
  ]);
  return { inboxUnread: inbox.data.threadsUnread ?? 0, drafts: drafts.data.threadsTotal ?? 0 };
}

export async function listInboxThreads(
  accessToken: string,
  options: { pageToken?: string; q?: string; maxResults?: number } = {},
): Promise<{ threads: InboxThreadSummary[]; nextPageToken: string | null }> {
  return listFolderThreads(accessToken, "inbox", options);
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
  /** Bulk/auto headers used to skip automated mail (see automated-senders.ts). */
  autoSubmitted?: string;
  precedence?: string;
  listId?: string;
  listUnsubscribe?: string;
}

/**
 * Headers for each message id. Messages Gmail no longer has (404: deleted
 * forever after they were listed or recorded in history) are left out, so one
 * vanished email cannot fail the whole sync and pin the history cursor.
 */
export async function getMessageHeaders(accessToken: string, ids: string[]): Promise<MessageHeadersOnly[]> {
  const gmail = gmailApi(accessToken);
  const results = await mapLimited(ids, 8, async (id): Promise<MessageHeadersOnly | null> => {
    const res = await gmail.users.messages
      .get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Cc", "Auto-Submitted", "Precedence", "List-Id", "List-Unsubscribe"],
      })
      .catch((err: unknown) => {
        const status = Number((err as { code?: number; status?: number }).code ?? (err as { status?: number }).status ?? 0);
        if (status === 404) return null;
        throw err;
      });
    if (!res) return null;
    const headers = res.data.payload?.headers;
    return {
      messageId: res.data.id ?? id,
      threadId: res.data.threadId ?? "",
      from: readGmailHeader(headers, "From"),
      to: readGmailHeader(headers, "To"),
      cc: readGmailHeader(headers, "Cc"),
      labelIds: res.data.labelIds ?? [],
      autoSubmitted: readGmailHeader(headers, "Auto-Submitted"),
      precedence: readGmailHeader(headers, "Precedence"),
      listId: readGmailHeader(headers, "List-Id"),
      listUnsubscribe: readGmailHeader(headers, "List-Unsubscribe"),
    };
  });
  return results.filter((header): header is MessageHeadersOnly => header !== null);
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
 *
 * Stops after about `maxIds` ids. When it stops early, `resumeHistoryId` is
 * the last history record it read, so the next sync carries on from there
 * instead of jumping to the newest point and skipping the rest.
 */
export async function listAddedMessageIdsSince(
  accessToken: string,
  startHistoryId: string,
  maxIds = 500,
): Promise<{ ids: string[]; resumeHistoryId: string | null }> {
  const gmail = gmailApi(accessToken);
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let resumeHistoryId: string | null = null;
  try {
    pages: do {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        maxResults: 500,
        ...(pageToken ? { pageToken } : {}),
      });
      const history = res.data.history ?? [];
      for (const [index, entry] of history.entries()) {
        for (const added of entry.messagesAdded ?? []) {
          const message = added.message;
          if (message?.id && isSyncableLabelSet(message.labelIds)) ids.add(message.id);
        }
        const more = index < history.length - 1 || Boolean(res.data.nextPageToken);
        if (ids.size >= maxIds && more && entry.id) {
          resumeHistoryId = String(entry.id);
          break pages;
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err) {
    const status = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
    if (status === 404) throw new GmailHistoryExpiredError("Gmail history expired");
    throw err;
  }
  return { ids: [...ids], resumeHistoryId };
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

export interface MessageFilePart {
  filename: string;
  mimeType: string;
  /** Content-ID without angle brackets, for images the HTML shows via cid:. */
  contentId: string;
  /** Standard base64 (not base64url). */
  data: string;
  size: number;
}

export interface MessageContentParts {
  html: string;
  text: string;
  inline: MessageFilePart[];
  attachments: MessageFilePart[];
  /** True when the files exceed `maxBytes`; no file data is returned then. */
  tooLarge: boolean;
}

/**
 * HTML, inline images and attachments of one message, for re-editing a draft
 * in the Mail compose window. Stops fetching once the files pass `maxBytes`.
 */
export async function getMessageContentParts(
  accessToken: string,
  messageId: string,
  maxBytes: number,
): Promise<MessageContentParts> {
  const gmail = gmailApi(accessToken);
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const decode = (data: string) => Buffer.from(data, "base64url");
  const header = (part: gmail_v1.Schema$MessagePart, name: string) =>
    readGmailHeader(part.headers ?? undefined, name);

  const out: MessageContentParts = { html: "", text: "", inline: [], attachments: [], tooLarge: false };
  const files: Array<{ part: gmail_v1.Schema$MessagePart; inline: boolean }> = [];
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    const contentId = header(part, "Content-ID").replace(/^<|>$/g, "");
    const isFile = Boolean(part.filename) || Boolean(part.body?.attachmentId);
    if (isFile) {
      const disposition = header(part, "Content-Disposition").toLowerCase();
      files.push({ part, inline: Boolean(contentId) && !disposition.startsWith("attachment") });
    } else if (part.mimeType === "text/html" && part.body?.data && !out.html) {
      out.html = decode(part.body.data).toString("utf-8");
    } else if (part.mimeType === "text/plain" && part.body?.data && !out.text) {
      out.text = decode(part.body.data).toString("utf-8");
    }
    part.parts?.forEach(walk);
  };
  if (res.data.payload) walk(res.data.payload);

  let total = 0;
  for (const { part, inline } of files) {
    total += part.body?.size ?? 0;
    if (total > maxBytes) {
      out.tooLarge = true;
      out.inline = [];
      out.attachments = [];
      return out;
    }
    let data = part.body?.data ?? "";
    if (!data && part.body?.attachmentId) {
      const attachment = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: part.body.attachmentId,
      });
      data = attachment.data.data ?? "";
    }
    const content = decode(data);
    const file: MessageFilePart = {
      filename: part.filename || "attachment",
      mimeType: part.mimeType || "application/octet-stream",
      contentId: header(part, "Content-ID").replace(/^<|>$/g, ""),
      data: content.toString("base64"),
      size: content.length,
    };
    (inline ? out.inline : out.attachments).push(file);
  }
  return out;
}

/**
 * Gmail draft id for a draft's message id. Gmail links and OptiMate only carry
 * the message id, but updating or deleting a draft needs the draft id.
 * Returns null when no draft holds that message (sent, discarded or not a draft).
 */
export async function findDraftIdByMessageId(accessToken: string, messageId: string): Promise<string | null> {
  const gmail = gmailApi(accessToken);
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const res = await gmail.users.drafts.list({ userId: "me", maxResults: 500, ...(pageToken ? { pageToken } : {}) });
    const match = (res.data.drafts ?? []).find((draft) => draft.message?.id === messageId);
    if (match?.id) return match.id;
    pageToken = res.data.nextPageToken ?? undefined;
    pages++;
  } while (pageToken && pages < 5);
  return null;
}

/** Delete a draft (after it has been sent from the Mail view). Needs gmail.compose. */
export async function deleteDraft(accessToken: string, draftId: string): Promise<void> {
  const gmail = gmailApi(accessToken);
  await gmail.users.drafts.delete({ userId: "me", id: draftId });
}

export function gmailMessageLink(messageId: string, account?: string): string {
  const user = account ? encodeURIComponent(account) : "0";
  return `https://mail.google.com/mail/u/${user}/#all/${messageId}`;
}
