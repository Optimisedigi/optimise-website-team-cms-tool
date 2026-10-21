import { isAutomatedLocalPart, isAutomatedMessage } from "./automated-senders";
import type { MailContact } from "./contacts-shared";

/**
 * Builds the recipient autocomplete list from the user's own Gmail (server
 * only; see /api/mail/contacts). Deterministic: same messages in, same list
 * out. Rules (documented in docs/mail.md):
 *  - Sent mail: everyone you emailed (To, Cc) counts.
 *  - Received mail: the people on it (From, To, Cc) count, unless the email
 *    is marketing or automated: Gmail's Promotions / Social / Updates / Forums
 *    tabs, bulk or auto headers (List-Unsubscribe, Precedence, ...), or a
 *    no-reply style sender.
 *  - Account and marketing mailboxes (no-reply, notifications, billing,
 *    accounts, receipts, newsletter, ...) are never suggested, whatever the
 *    email. Your own addresses are never suggested.
 *  - People you emailed rank above people who only emailed you; then more
 *    emails first; then the most recent; then alphabetical.
 */

export interface ContactSourceMessage {
  /** True for an email you sent (Gmail SENT label). */
  sent: boolean;
  from: string;
  to: string;
  cc: string;
  labelIds: string[];
  autoSubmitted?: string;
  precedence?: string;
  listId?: string;
  listUnsubscribe?: string;
}

/** Gmail tabs that hold marketing and account mail rather than conversations. */
const NON_PERSONAL_CATEGORIES = new Set(["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS", "SPAM", "TRASH"]);

/** Account/marketing mailboxes that are not a person, on top of the no-reply list. */
const ACCOUNT_LOCAL_PART_RE =
  /^(?:accounts?|billing|invoices?|receipts?|statements?|newsletters?|marketing|promo(?:tions)?|news|digest|updates?|security|verify|verification|confirm(?:ation)?|subscriptions?|unsubscribe|reply|donotreply|automated|system|daemon|calendar-notification|drive-shares-dm-noreply)(?:[._+-].*)?$/i;

const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export const MAX_CONTACTS = 500;

/** Splits an address header on commas outside quotes and angle brackets. */
function splitAddressHeader(header: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angle = false;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "<" && !quoted) angle = true;
    else if (ch === ">" && !quoted) angle = false;
    if ((ch === "," || ch === ";") && !quoted && !angle) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** `Jo Smith <jo@x.com>, "Lee, Sam" <sam@y.com>, kim@z.com` → people with names. */
export function parseAddressList(header: string | null | undefined): MailContact[] {
  if (!header) return [];
  const out: MailContact[] = [];
  for (const part of splitAddressHeader(header)) {
    const angled = part.match(/^(.*)<\s*([^<>\s]+)\s*>\s*$/);
    const email = (angled ? angled[2] : part).trim().toLowerCase().replace(/^mailto:/, "");
    if (!EMAIL_RE.test(email) || email.length > 254) continue;
    let name = angled ? (angled[1] ?? "").trim().replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1").trim() : "";
    if (name.toLowerCase() === email || name.includes("@")) name = "";
    out.push({ email, name: name.slice(0, 120) });
  }
  return out;
}

/** True for account / marketing / no-reply mailboxes that should never be suggested. */
export function isNonPersonalAddress(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return isAutomatedLocalPart(email) || ACCOUNT_LOCAL_PART_RE.test(local);
}

function isMarketingOrAutomated(message: ContactSourceMessage): boolean {
  if (message.labelIds.some((label) => NON_PERSONAL_CATEGORIES.has(label))) return true;
  return isAutomatedMessage(message);
}

interface Tally {
  contact: MailContact;
  sentCount: number;
  receivedCount: number;
  /** Index of the newest message the person was on (messages are newest first). */
  firstSeen: number;
}

/**
 * Ranked contacts from `messages`, which must be ordered newest first (Gmail
 * list order). `ownAddresses` are the connected mailbox and the user's login.
 */
export function buildMailContacts(
  messages: readonly ContactSourceMessage[],
  ownAddresses: readonly string[],
  limit = MAX_CONTACTS,
): MailContact[] {
  const own = new Set(ownAddresses.map((address) => address.trim().toLowerCase()).filter(Boolean));
  const tallies = new Map<string, Tally>();
  messages.forEach((message, index) => {
    if (message.labelIds.includes("SPAM") || message.labelIds.includes("TRASH")) return;
    const sent = message.sent || message.labelIds.includes("SENT");
    if (!sent && isMarketingOrAutomated(message)) return;
    const people = sent
      ? [...parseAddressList(message.to), ...parseAddressList(message.cc)]
      : [...parseAddressList(message.from), ...parseAddressList(message.to), ...parseAddressList(message.cc)];
    const seenHere = new Set<string>();
    for (const person of people) {
      if (own.has(person.email) || seenHere.has(person.email) || isNonPersonalAddress(person.email)) continue;
      seenHere.add(person.email);
      const tally = tallies.get(person.email);
      if (!tally) {
        tallies.set(person.email, { contact: { ...person }, sentCount: sent ? 1 : 0, receivedCount: sent ? 0 : 1, firstSeen: index });
        continue;
      }
      if (sent) tally.sentCount++;
      else tally.receivedCount++;
      // Newest first, so the first name seen is the most recent; fill a gap only.
      if (!tally.contact.name && person.name) tally.contact.name = person.name;
    }
  });
  return [...tallies.values()]
    .sort(
      (a, b) =>
        Number(b.sentCount > 0) - Number(a.sentCount > 0) ||
        b.sentCount * 3 + b.receivedCount - (a.sentCount * 3 + a.receivedCount) ||
        a.firstSeen - b.firstSeen ||
        a.contact.email.localeCompare(b.contact.email),
    )
    .slice(0, limit)
    .map((tally) => tally.contact);
}
