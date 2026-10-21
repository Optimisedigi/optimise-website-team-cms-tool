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
 *
 * Gmail only matches whole words, so part of a name ("rebe") finds nothing
 * from "rebekah@inthepicture.com.au". The Mail page fills that gap: it matches
 * the typed text against the people in your mail (start of the address, the
 * domain, or any word of the name) and passes their addresses as
 * `senderAddresses`, which are added as more `from:` matches.
 */

/** Most extra sender addresses one search adds. */
export const MAX_SEARCH_SENDERS = 10;

const ADDRESS_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/**
 * The `senders` request parameter: comma-separated addresses. Anything that is
 * not a plain address is dropped (so nothing else reaches the Gmail search),
 * duplicates are removed, and at most MAX_SEARCH_SENDERS are kept.
 */
export function parseSearchSenders(param: string | null | undefined): string[] {
  if (!param) return [];
  const out: string[] = [];
  for (const part of param.split(",")) {
    const address = part.trim().toLowerCase();
    if (address.length > 254 || !ADDRESS_RE.test(address) || out.includes(address)) continue;
    out.push(address);
    if (out.length >= MAX_SEARCH_SENDERS) break;
  }
  return out;
}

const GMAIL_SYNTAX = /[:"(){}]|(?:^|\s)[-+]|(?:^|\s)(?:OR|AND)(?:\s|$)/;

export function inboxSearchQuery(raw: string, senderAddresses: readonly string[] = []): string {
  const terms = raw.trim().replace(/\s+/g, " ");
  if (!terms || GMAIL_SYNTAX.test(terms)) return terms;
  // Several words stay one AND group on both sides, as the free text was before.
  const group = terms.includes(" ") ? `(${terms})` : terms;
  const extra = parseSearchSenders(senderAddresses.join(","))
    .filter((address) => address !== terms.toLowerCase())
    .map((address) => ` from:${address}`)
    .join("");
  return `{${group} from:${group}${extra}}`;
}
