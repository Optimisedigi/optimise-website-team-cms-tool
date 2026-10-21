import { google, type gmail_v1 } from "googleapis";
import { parseGmailFullMessage, readGmailHeader, type GmailFullMessage } from "@/lib/gmail-search";
import type { MailFolder } from "@/lib/mail/folders";

/**
 * Gmail API calls for the CMS Mail view. Pure transport: no matching, no
 * storage, no model calls. Never logs message content or tokens.
 */

export interface InboxThreadSummary {
  threadId: string;
  /** The message shown in the list (see listFolderThreads). */
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
 * The account's own messages: what it sent (exactly what the Sent view lists,
 * send-as aliases included) and unsent drafts. Judged by Gmail's labels, not
 * the From address, so mail that only claims your address (a website form,
 * say) still arrives in the Inbox.
 */
function isOwnMessage(message: gmail_v1.Schema$Message): boolean {
  return (message.labelIds ?? []).some((label) => label === "SENT" || label === "DRAFT");
}

/**
 * Threads in one folder, newest first (Gmail order). Each row describes the
 * message shown in the list: for the inbox that is the latest message from
 * someone else, so your reply never shows as an incoming row, and a thread
 * holding only your own messages is left out (it is in Sent); for Sent and
 * Drafts it is the latest message carrying that label, so a sent thread shows
 * what you sent (not an incoming reply) and a drafts row's `messageId` is the
 * draft message itself (what `/api/gmail/draft` opens). `messageCount` and
 * `unread` always cover the whole thread, and opening a row loads every
 * message, your replies included.
 */
export async function listFolderThreads(
  accessToken: string,
  folder: MailFolder,
  options: { pageToken?: string; q?: string; maxResults?: number } = {},
): Promise<{ threads: InboxThreadSummary[]; nextPageToken: string | null }> {
  const gmail = gmailApi(accessToken);
  const label = FOLDER_LABELS[folder];
  const maxResults = Math.min(Math.max(options.maxResults ?? 25, 1), 50);
  const page = options.pageToken ? { pageToken: options.pageToken } : {};
  let ids: string[];
  let nextPageToken: string | null;
  if (options.q) {
    // threads.list with any `q` (even "in:inbox") returns threads out of date
    // order and silently drops some recent ones; messages.list with the same
    // query is newest first. Rows are its threads in first-seen order. A thread
    // can reappear on a later page, so callers dedupe when appending.
    const list = await gmail.users.messages.list({ userId: "me", labelIds: [label], maxResults, q: options.q, ...page });
    ids = [...new Set((list.data.messages ?? []).map((message) => message.threadId).filter((id): id is string => Boolean(id)))];
    nextPageToken = list.data.nextPageToken ?? null;
  } else {
    const list = await gmail.users.threads.list({ userId: "me", labelIds: [label], maxResults, ...page });
    ids = (list.data.threads ?? []).map((thread) => thread.id).filter((id): id is string => Boolean(id));
    nextPageToken = list.data.nextPageToken ?? null;
  }
  const rows = await mapLimited(ids, 8, async (id): Promise<InboxThreadSummary | null> => {
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
        ? [...messages].reverse().find((message) => !isOwnMessage(message))
        : ([...messages].reverse().find((message) => (message.labelIds ?? []).includes(label)) ?? latest);
    // Nothing from anyone else: the thread is only your own mail, so not an Inbox row.
    if (folder === "inbox" && !shown) return null;
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
  const threads = rows.filter((row): row is InboxThreadSummary => row !== null);
  return { threads, nextPageToken };
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

const CALENDAR_MAX_BYTES = 256 * 1024;

/** The iCalendar text of a message (text/calendar part or .ics file), or "". */
async function readCalendarText(gmail: gmail_v1.Gmail, message: gmail_v1.Schema$Message): Promise<string> {
  const parts: gmail_v1.Schema$MessagePart[] = [];
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    parts.push(part);
    part.parts?.forEach(walk);
  };
  if (message.payload) walk(message.payload);
  const isIcs = (part: gmail_v1.Schema$MessagePart) =>
    part.mimeType === "application/ics" || /\.ics$/i.test(part.filename ?? "");
  // Prefer the inline text/calendar part; it carries the METHOD.
  const part = parts.find((p) => p.mimeType === "text/calendar") ?? parts.find(isIcs);
  if (!part?.body || (part.body.size ?? 0) > CALENDAR_MAX_BYTES) return "";
  let data = part.body.data ?? "";
  if (!data && part.body.attachmentId && message.id) {
    const attachment = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: message.id,
      id: part.body.attachmentId,
    });
    data = attachment.data.data ?? "";
  }
  return data ? Buffer.from(data, "base64url").toString("utf-8") : "";
}

/** Thread messages plus each one's iCalendar text ("" when it has none). For the reading pane. */
export async function getThreadMessagesWithCalendar(
  accessToken: string,
  threadId: string,
): Promise<Array<GmailFullMessage & { calendarIcs: string }>> {
  const gmail = gmailApi(accessToken);
  const res = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  return Promise.all(
    (res.data.messages ?? []).map(async (message) => ({
      ...parseGmailFullMessage(message),
      calendarIcs: await readCalendarText(gmail, message).catch(() => ""),
    })),
  );
}

/** One message plus its iCalendar text ("" when it has none). */
export async function getMessageWithCalendar(
  accessToken: string,
  messageId: string,
): Promise<GmailFullMessage & { calendarIcs: string }> {
  const gmail = gmailApi(accessToken);
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  return { ...parseGmailFullMessage(res.data), calendarIcs: await readCalendarText(gmail, res.data) };
}

/** Send a prebuilt base64url MIME message (calendar RSVPs). Needs gmail.compose. */
export async function sendRawMessage(accessToken: string, raw: string, threadId?: string): Promise<string> {
  const gmail = gmailApi(accessToken);
  const res = await gmail.users.messages.send({ userId: "me", requestBody: threadId ? { raw, threadId } : { raw } });
  return res.data.id ?? "";
}

/**
 * The message exactly as Gmail stores it (RFC 822), for an .eml download.
 * Returns null when it is bigger than maxBytes (checked before downloading it).
 */
export async function getRawMessage(accessToken: string, messageId: string, maxBytes: number): Promise<Buffer | null> {
  const gmail = gmailApi(accessToken);
  const size = await gmail.users.messages.get({ userId: "me", id: messageId, format: "minimal" });
  if ((size.data.sizeEstimate ?? 0) > maxBytes) return null;
  const res = await gmail.users.messages.get({ userId: "me", id: messageId, format: "raw" });
  const raw = Buffer.from(res.data.raw ?? "", "base64url");
  return raw.length > maxBytes ? null : raw;
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

export interface ThreadReplyHeader {
  messageId: string;
  from: string;
  /** Gmail internalDate in ms since the epoch (0 if missing). */
  internalDate: number;
  labelIds: string[];
  autoSubmitted?: string;
  precedence?: string;
  listId?: string;
  listUnsubscribe?: string;
}

/**
 * Just enough of every message in a thread to tell whether someone replied
 * (follow-up reminders): sender, time and bulk/auto headers, no bodies.
 * A thread Gmail no longer has (404) returns [].
 */
export async function getThreadReplyHeaders(accessToken: string, threadId: string): Promise<ThreadReplyHeader[]> {
  const gmail = gmailApi(accessToken);
  const res = await gmail.users.threads
    .get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["From", "Auto-Submitted", "Precedence", "List-Id", "List-Unsubscribe"],
    })
    .catch((err: unknown) => {
      const status = Number((err as { code?: number; status?: number }).code ?? (err as { status?: number }).status ?? 0);
      if (status === 404) return null;
      throw err;
    });
  if (!res) return [];
  return (res.data.messages ?? []).map((message) => {
    const headers = message.payload?.headers;
    return {
      messageId: message.id ?? "",
      from: readGmailHeader(headers, "From"),
      internalDate: Number(message.internalDate ?? 0) || 0,
      labelIds: message.labelIds ?? [],
      autoSubmitted: readGmailHeader(headers, "Auto-Submitted"),
      precedence: readGmailHeader(headers, "Precedence"),
      listId: readGmailHeader(headers, "List-Id"),
      listUnsubscribe: readGmailHeader(headers, "List-Unsubscribe"),
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

/** Message ids matching a Gmail search, newest first, up to `maxIds`. */
export async function listMessageIdsMatching(accessToken: string, q: string, maxIds: number): Promise<string[]> {
  const gmail = gmailApi(accessToken);
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q,
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
