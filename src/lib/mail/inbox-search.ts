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

/**
 * What the search box looks in, picked next to it:
 *  - "all": the person (sender in the Inbox, recipients in Sent / Drafts),
 *    the subject and the email's text.
 *  - "person": only the person's name or address (part of a name matches
 *    through the matched addresses, as above).
 *  - "subject": only words in the subject line.
 *  - "body": words in the email's text. Gmail has no body-only search, so
 *    this is its plain word search (which also covers the subject), without
 *    the extra name/address matches.
 */
export const MAIL_SEARCH_SCOPES = ["all", "person", "subject", "body"] as const;
export type MailSearchScope = (typeof MAIL_SEARCH_SCOPES)[number];

/** The `scope` request parameter; anything else (or nothing) is "all". */
export function parseSearchScope(param: string | null | undefined): MailSearchScope {
  return MAIL_SEARCH_SCOPES.find((scope) => scope === param) ?? "all";
}

/**
 * Gmail search for the Mail search box in any folder, limited to `scope`.
 * Hand-written Gmail syntax is passed through unchanged, whatever the scope.
 * In the Inbox the person is the sender (`from:`); in Sent and Drafts it is
 * who the email went to (`to:` / `cc:` / `bcc:`). Sent and Drafts searched
 * with "all" stay plain Gmail text plus the recipient match.
 */
export function mailSearchQuery(
  raw: string,
  options: { folder: string; scope?: MailSearchScope; senderAddresses?: readonly string[] },
): string {
  const terms = raw.trim().replace(/\s+/g, " ");
  if (!terms || GMAIL_SYNTAX.test(terms)) return terms;
  const scope = options.scope ?? "all";
  const group = terms.includes(" ") ? `(${terms})` : terms;
  if (scope === "subject") return `subject:${group}`;
  if (scope === "body") return group;
  const inbox = options.folder === "inbox";
  const people = parseSearchSenders((options.senderAddresses ?? []).join(",")).filter((address) => address !== terms.toLowerCase());
  const personFields = inbox ? ["from"] : ["to", "cc", "bcc"];
  const personParts = [
    ...personFields.map((field) => `${field}:${group}`),
    ...people.flatMap((address) => (inbox ? [`from:${address}`] : [`to:${address}`, `cc:${address}`])),
  ];
  if (scope === "person") return `{${personParts.join(" ")}}`;
  if (inbox) return inboxSearchQuery(raw, options.senderAddresses ?? []);
  return `{${group} ${personParts.join(" ")}}`;
}
