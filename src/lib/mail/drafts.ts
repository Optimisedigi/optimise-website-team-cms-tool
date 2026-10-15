/**
 * Pure helpers for opening Gmail drafts in the CMS Mail view. Client-safe:
 * no Gmail API calls, no server imports.
 *
 * OptiMate saves drafts to Gmail and returns a Gmail link
 * (`https://mail.google.com/mail/u/0/#drafts/<messageId>`). The chat UIs
 * rewrite that link to `/admin/mail?draft=<messageId>` so the draft opens in
 * the CMS compose window instead of Gmail.
 */

const GMAIL_ID_RE = /^[A-Za-z0-9_-]{1,256}$/;

export const MAIL_DRAFT_QUERY_PARAM = "draft";

export function isGmailId(value: string): boolean {
  return GMAIL_ID_RE.test(value);
}

/** CMS Mail path that opens the given Gmail draft message in the compose window. */
export function cmsMailDraftPath(messageId: string): string {
  return `/admin/mail?${MAIL_DRAFT_QUERY_PARAM}=${encodeURIComponent(messageId)}`;
}

/**
 * Turn a Gmail draft link (`https://mail.google.com/...#drafts/<id>`) into the
 * CMS Mail path. Returns null for anything else, including look-alike hosts.
 */
export function cmsMailDraftPathFromGmailUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "mail.google.com") return null;
  const match = url.hash.match(/^#drafts\/([^/?#]+)$/);
  const messageId = match?.[1];
  return messageId && isGmailId(messageId) ? cmsMailDraftPath(messageId) : null;
}

/**
 * Convert a draft's HTML (as written by createGmailDraft) back to the plain
 * text the compose window edits. List items keep a "- " bullet so they turn
 * back into a list when the body is rendered again on send.
 */
export function draftHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const collapse = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * Remove the Gmail signature from the end of a draft's text so the compose
 * window shows only the message. The signature is shown separately and added
 * back by the server when the email is sent or saved.
 */
export function stripTrailingSignature(bodyText: string, signatureHtml: string): string {
  const signature = collapse(draftHtmlToText(signatureHtml));
  if (!signature) return bodyText;
  const lines = bodyText.split("\n");
  for (let start = lines.length - 1; start >= 0; start--) {
    const tail = collapse(lines.slice(start).join(" "));
    if (tail === signature) return lines.slice(0, start).join("\n").trimEnd();
    if (tail.length > signature.length) break;
  }
  return bodyText;
}
