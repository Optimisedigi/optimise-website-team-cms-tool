import type { MailContact } from "./contacts-shared";

/**
 * Keeps the Mail search box's people list (/api/mail/contacts: who you email
 * and who emails you) in this browser's localStorage, one entry per Gmail
 * account. Building that list reads hundreds of Gmail messages (several
 * seconds), so the search box uses the saved copy straight away and the page
 * refreshes it in the background. Only names and addresses are kept, never
 * email content, and a copy older than MAX_AGE_MS is not used.
 */

export interface MailPeople {
  contacts: MailContact[];
  senders: MailContact[];
}

const PREFIX = "mail-search-people:";
export const PEOPLE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
/** Keep the saved copy small. */
const MAX_PEOPLE = 1000;

function key(account: string): string {
  return PREFIX + (account.trim().toLowerCase() || "main");
}

function cleanList(value: unknown): MailContact[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((c): c is MailContact => typeof (c as MailContact)?.email === "string" && typeof (c as MailContact)?.name === "string")
    .slice(0, MAX_PEOPLE)
    .map((c) => ({ email: c.email, name: c.name }));
}

/** The saved people for this account ('' = main Gmail), or null when none or too old. */
export function loadSavedPeople(storage: Storage | null, account: string, now: number): MailPeople | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key(account));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; contacts?: unknown; senders?: unknown };
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > PEOPLE_MAX_AGE_MS || parsed.savedAt > now) {
      storage.removeItem(key(account));
      return null;
    }
    return { contacts: cleanList(parsed.contacts), senders: cleanList(parsed.senders) };
  } catch {
    return null;
  }
}

/** Save the people for this account. Never throws (storage full or blocked). */
export function savePeople(storage: Storage | null, account: string, people: MailPeople, now: number): void {
  if (!storage) return;
  try {
    storage.setItem(
      key(account),
      JSON.stringify({ savedAt: now, contacts: cleanList(people.contacts), senders: cleanList(people.senders) }),
    );
  } catch {
    // Nothing more to do: the list just loads from Gmail next time.
  }
}
