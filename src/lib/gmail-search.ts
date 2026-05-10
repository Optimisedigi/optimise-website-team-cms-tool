import { google, type gmail_v1 } from "googleapis";

/**
 * Gmail inbox search + message body fetch for the OptiMate launcher's
 * "attach email" feature. Read-only operations on top of the same per-user
 * OAuth tokens used by gmail-service.ts.
 *
 * Requires the `gmail.readonly` scope. Users connected under the previous
 * (compose-only) scope set must reconnect via /api/gmail/connect before
 * calls here will succeed; Gmail returns 403 insufficientPermissions until
 * they do.
 */

export interface GmailSearchResult {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  date: string; // ISO 8601, parsed from the Date header (best-effort)
  snippet: string;
}

export interface GmailMessageBody {
  messageId: string;
  subject: string;
  from: string;
  to: string;
  date: string; // ISO 8601 (best-effort)
  body: string; // plain text
}

function gmailClient(accessToken: string): gmail_v1.Gmail {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) return "";
  const lower = name.toLowerCase();
  const found = headers.find((h) => (h.name ?? "").toLowerCase() === lower);
  return found?.value ?? "";
}

function parseDateHeader(value: string): string {
  if (!value) return "";
  const t = Date.parse(value);
  if (Number.isNaN(t)) return value; // fall back to raw header
  return new Date(t).toISOString();
}

/**
 * Search the authenticated user's inbox using Gmail's search syntax (the
 * same syntax shown in the search bar at mail.google.com). Returns
 * lightweight metadata for each match.
 */
export async function searchInbox(
  accessToken: string,
  q: string,
  maxResults = 20,
): Promise<{ results: GmailSearchResult[] }> {
  const gmail = gmailClient(accessToken);
  const cap = Math.min(Math.max(1, maxResults), 50);

  const list = await gmail.users.messages.list({
    userId: "me",
    q,
    maxResults: cap,
  });

  const ids = (list.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return { results: [] };

  // Fetch metadata-only for each id in parallel. Gmail charges ~5 quota
  // units per metadata get; with cap=50 that's 250 units per search.
  const messages = await Promise.all(
    ids.map((id) =>
      gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      }),
    ),
  );

  const results: GmailSearchResult[] = messages.map((res) => {
    const msg = res.data;
    const headers = msg.payload?.headers;
    return {
      messageId: msg.id ?? "",
      threadId: msg.threadId ?? "",
      subject: getHeader(headers, "Subject"),
      from: getHeader(headers, "From"),
      date: parseDateHeader(getHeader(headers, "Date")),
      snippet: msg.snippet ?? "",
    };
  });

  return { results };
}

/**
 * Recursively walk message parts collecting bodies of the requested mime
 * type. Returns the concatenated decoded text.
 */
function collectBodyByMime(
  part: gmail_v1.Schema$MessagePart | undefined,
  mime: string,
): string {
  if (!part) return "";
  const out: string[] = [];

  const walk = (p: gmail_v1.Schema$MessagePart) => {
    if (p.mimeType === mime && p.body?.data) {
      const decoded = Buffer.from(p.body.data, "base64url").toString("utf-8");
      out.push(decoded);
    }
    if (p.parts) p.parts.forEach(walk);
  };
  walk(part);
  return out.join("\n");
}

/**
 * Naive HTML→text fallback for emails that lack a text/plain part. Removes
 * scripts/styles, replaces block tags with newlines, strips remaining tags,
 * decodes the most common entities, and collapses whitespace.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Fetch the full message body for one Gmail message id. Prefers the
 * text/plain part; falls back to a stripped text/html. Attachments are
 * ignored.
 */
export async function fetchMessageBody(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageBody> {
  const gmail = gmailClient(accessToken);
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  const msg = res.data;
  const headers = msg.payload?.headers;

  let body = collectBodyByMime(msg.payload, "text/plain").trim();
  if (!body) {
    const html = collectBodyByMime(msg.payload, "text/html");
    if (html) body = htmlToText(html);
  }
  // Last-ditch: top-level body when there are no parts.
  if (!body && msg.payload?.body?.data) {
    body = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
  }

  return {
    messageId: msg.id ?? messageId,
    subject: getHeader(headers, "Subject"),
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    date: parseDateHeader(getHeader(headers, "Date")),
    body,
  };
}
