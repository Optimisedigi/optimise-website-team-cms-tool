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
/** `/admin/mail?thread=<gmail thread id>` opens that thread in the reading pane. */
export const MAIL_THREAD_QUERY_PARAM = "thread";

/** CMS Mail path that opens the given Gmail thread. */
export function cmsMailThreadPath(threadId: string): string {
  return `/admin/mail?${MAIL_THREAD_QUERY_PARAM}=${encodeURIComponent(threadId)}`;
}

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
