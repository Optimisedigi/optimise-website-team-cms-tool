/**
 * Which Gmail account a Mail request is for. Client-safe: no server imports.
 *
 * A Mail user has a main Gmail (on their user record) and can connect more
 * (the mail-accounts collection). The Mail view sends the account it is
 * showing in the MAIL_ACCOUNT_HEADER on every request; no header (or the main
 * address) means the main Gmail, so every other caller (OptiMate, crons) keeps
 * using the main account. The server only ever resolves the header against
 * the logged-in user's own accounts.
 */

export const MAIL_ACCOUNT_HEADER = "x-mail-account";
/** `/admin/mail?account=<email>` opens Mail on that account. */
export const MAIL_ACCOUNT_QUERY_PARAM = "account";
/** Browser storage key older versions used to remember the last account shown in Mail; now only cleared (Mail opens on the main Gmail). */
export const MAIL_ACCOUNT_STORAGE_KEY = "mail-active-account";

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Lowercased address, or "" when empty or not a plain email address. */
export function normaliseMailAccount(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim().toLowerCase();
  return value.length <= 254 && EMAIL_RE.test(value) ? value : "";
}

/** Headers for a Mail request on `account` ("" = the main Gmail, no header). */
export function mailAccountHeaders(account: string | undefined | null): Record<string, string> {
  const clean = normaliseMailAccount(account ?? "");
  return clean ? { [MAIL_ACCOUNT_HEADER]: clean } : {};
}
