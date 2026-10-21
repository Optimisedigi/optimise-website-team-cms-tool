/**
 * Gmail search for the Mail Inbox search box. Client-safe: string work only.
 *
 * The box used to send its text to Gmail as plain free text. Gmail matches
 * that against its word index (subject, body), which does not reliably cover
 * the sender's address, so typing "jo@client.com" or "client.com" missed that
 * sender's mail. Plain text is now sent as the same free-text search OR a
 * `from:` match on the same words, so the sender's address (whole or part)
 * and display name match as well as the subject, which matches as before.
 *
 * Text that already uses Gmail search syntax (an operator such as `from:` or
 * `subject:`, quotes, groups, OR/AND, or a leading `-`/`+`) is passed through
 * unchanged, so hand-written Gmail searches behave as they did.
 */

const GMAIL_SYNTAX = /[:"(){}]|(?:^|\s)[-+]|(?:^|\s)(?:OR|AND)(?:\s|$)/;

export function inboxSearchQuery(raw: string): string {
  const terms = raw.trim().replace(/\s+/g, " ");
  if (!terms || GMAIL_SYNTAX.test(terms)) return terms;
  // Several words stay one AND group on both sides, as the free text was before.
  const group = terms.includes(" ") ? `(${terms})` : terms;
  return `{${group} from:${group}}`;
}
