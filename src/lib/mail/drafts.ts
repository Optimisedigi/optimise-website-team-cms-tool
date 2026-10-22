/**
 * Pure helpers for opening Gmail drafts in the CMS Mail view. Client-safe:
 * no Gmail API calls, no server imports.
 *
 * OptiMate saves drafts to Gmail and returns a Gmail link
 * (`https://mail.google.com/mail/u/0/#drafts/<messageId>`). The chat UIs
 * rewrite that link to `/admin/mail?draft=<messageId>` so the draft opens in
 * the CMS compose window instead of Gmail.
 */

import { MAIL_ACCOUNT_QUERY_PARAM } from "./accounts-shared";

const GMAIL_ID_RE = /^[A-Za-z0-9_-]{1,256}$/;

export const MAIL_DRAFT_QUERY_PARAM = "draft";
/** `/admin/mail?thread=<gmail thread id>` opens that thread in the reading pane. */
export const MAIL_THREAD_QUERY_PARAM = "thread";

/** CMS Mail path that opens the given Gmail thread (in `account`, when it is an extra Gmail account). */
export function cmsMailThreadPath(threadId: string, account?: string | null): string {
  const path = `/admin/mail?${MAIL_THREAD_QUERY_PARAM}=${encodeURIComponent(threadId)}`;
  return account ? `${path}&${MAIL_ACCOUNT_QUERY_PARAM}=${encodeURIComponent(account)}` : path;
}

export function isGmailId(value: string): boolean {
  return GMAIL_ID_RE.test(value);
}

/** Window event the open Mail page listens for: `detail.url` is a `/admin/mail?...` link. */
export const MAIL_OPEN_LINK_EVENT = "od:mail-open-link";

const MAIL_PATH = "/admin/mail";

/**
 * Open a CMS Mail link (`?thread=` / `?draft=`, optionally `&account=`).
 * Mail reads those params when it loads, so a router push to the page you are
 * already on would change nothing: when Mail is open, the open page is told
 * directly instead. Returns true when the open Mail page handled it (no
 * navigation happens), false when `push` was called.
 */
export function openCmsMailLink(url: string, push: (url: string) => void): boolean {
  const onMail = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === MAIL_PATH;
  if (onMail && (url === MAIL_PATH || url.startsWith(`${MAIL_PATH}?`))) {
    window.dispatchEvent(new CustomEvent(MAIL_OPEN_LINK_EVENT, { detail: { url } }));
    return true;
  }
  push(url);
  return false;
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
