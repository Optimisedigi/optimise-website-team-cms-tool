/**
 * Recipient autocomplete for the compose window (To, Cc, Bcc). Client-safe:
 * no server imports. The contact list itself is built on the server from the
 * user's own sent and received mail (see contacts.ts); this file only matches
 * what is typed against it and edits the field text.
 */

export interface MailContact {
  /** Lowercased email address; always shown so the person's real address is visible. */
  email: string;
  /** Display name from the email headers, or "" when none was given. */
  name: string;
}

/** Suggestions only start once this many letters are typed. */
export const CONTACT_MIN_QUERY = 2;
export const CONTACT_MAX_SUGGESTIONS = 6;

/** The recipient being typed: the comma/semicolon separated part around the caret. */
export interface RecipientToken {
  start: number;
  end: number;
  text: string;
}

export function recipientTokenAt(value: string, caret: number): RecipientToken {
  const at = Math.max(0, Math.min(caret, value.length));
  const before = value.slice(0, at);
  const start = Math.max(before.lastIndexOf(","), before.lastIndexOf(";")) + 1;
  const rest = value.slice(at);
  const nextSep = rest.search(/[,;]/);
  const end = nextSep === -1 ? value.length : at + nextSep;
  return { start, end, text: value.slice(start, end).trim() };
}

/** Lowercased addresses already in a recipient field. */
export function addressesIn(value: string): Set<string> {
  return new Set((value.match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((a) => a.toLowerCase()));
}

/**
 * Contacts matching what is typed, in the server's ranking (people you email
 * most first). A contact matches when the text starts its address, the part
 * after the @, its name, or any word of its name. Fewer than
 * CONTACT_MIN_QUERY letters, or text that is already a full address, gives
 * no suggestions. Addresses already in the field are left out.
 */
export function matchMailContacts(
  contacts: readonly MailContact[],
  typed: string,
  exclude: ReadonlySet<string> = new Set(),
  limit = CONTACT_MAX_SUGGESTIONS,
): MailContact[] {
  const query = typed.trim().toLowerCase().replace(/^["'<]+/, "");
  if (query.length < CONTACT_MIN_QUERY) return [];
  const out: MailContact[] = [];
  for (const contact of contacts) {
    if (exclude.has(contact.email)) continue;
    if (contact.email === query) return [];
    const domain = contact.email.split("@")[1] ?? "";
    const name = contact.name.toLowerCase();
    const hit =
      contact.email.startsWith(query) ||
      domain.startsWith(query) ||
      name.startsWith(query) ||
      name.split(/[\s.,'"()-]+/).some((word) => word.startsWith(query));
    if (hit) out.push(contact);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Field text with the recipient being typed replaced by `email`, followed by
 * ", " so the next address can be typed straight away, plus the new caret.
 */
export function applyRecipient(value: string, token: RecipientToken, email: string): { value: string; caret: number } {
  const head = value.slice(0, token.start).replace(/\s*$/, "");
  const tail = value.slice(token.end).replace(/^[\s,;]*/, "");
  const prefix = head ? `${head} ` : "";
  const inserted = `${prefix}${email}, `;
  return { value: inserted + tail, caret: inserted.length };
}
