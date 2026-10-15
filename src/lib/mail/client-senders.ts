import type { Payload } from "payload";
import { extractEmailAddresses, normaliseDomain } from "./client-matching";
import { cleanHiddenSenders, loadSenderListPreference, normaliseHiddenSender } from "./hidden-senders";

/**
 * Per-user "client senders": addresses or domains the user starred in Mail.
 *
 * Only unread inbox emails from these senders appear in the dashboard's
 * "Unread client emails" panel (GET /api/mail/client-unread). The list uses
 * the same entry format and storage as hidden senders: an exact address
 * ("jo@shop.com") or a whole domain ("@shop.com", subdomains included), kept
 * in Payload's per-user preferences under CLIENT_SENDERS_PREF_KEY. No schema
 * change, and nothing changes in Gmail.
 *
 * Client-safe: no server imports beyond types.
 */

export const CLIENT_SENDERS_PREF_KEY = "mail-client-senders";

/** Same normalisation as hidden senders: "Jo <JO@Shop.com>" → "jo@shop.com", "shop.com" → "@shop.com". */
export const normaliseClientSender = normaliseHiddenSender;

/** Clean, dedupe and cap (100) a stored or submitted list. */
export const cleanClientSenders = cleanHiddenSenders;

/**
 * The sender's real address. When the header has `<addr>`, that wins, so an
 * address typed into the display name (`"jo@client.com" <x@evil.com>`) can't
 * pass as a client sender.
 */
function fromAddress(from: string | null | undefined): string | undefined {
  const bracketed = (from ?? "").match(/<([^<>]+)>\s*$/)?.[1];
  return extractEmailAddresses(bracketed ?? from)[0];
}

/** The stored entries that cover this From header (exact address, or its domain / a parent domain). */
export function matchingClientSenderEntries(from: string | null | undefined, list: string[]): string[] {
  const address = fromAddress(from);
  if (!address) return [];
  const domain = normaliseDomain(address);
  return cleanClientSenders(list).filter((entry) =>
    entry.startsWith("@")
      ? domain === entry.slice(1) || domain.endsWith(`.${entry.slice(1)}`)
      : entry === address,
  );
}

/** True when a From header belongs to a starred client address or domain. */
export function isClientSender(from: string | null | undefined, list: string[]): boolean {
  return matchingClientSenderEntries(from, list).length > 0;
}

/**
 * Gmail search for unread mail from any client sender, e.g.
 * `is:unread {from:jo@shop.com from:news.com}` (braces = OR). Entries are
 * normalised first, so they cannot inject other search operators. Returns ""
 * when there are no client senders: callers must not search Gmail then.
 */
export function clientUnreadQuery(list: string[]): string {
  const terms = cleanClientSenders(list).map((entry) => `from:${entry.startsWith("@") ? entry.slice(1) : entry}`);
  return terms.length ? `is:unread {${terms.join(" ")}}` : "";
}

/**
 * The dashboard filter: keep only unread threads whose sender is a client
 * sender. Gmail's `from:` search is looser than this (it also matches display
 * names), so results are always re-checked here.
 */
export function unreadClientThreads<T extends { from: string; unread: boolean }>(threads: T[], list: string[]): T[] {
  const clean = cleanClientSenders(list);
  if (clean.length === 0) return [];
  return threads.filter((thread) => thread.unread && isClientSender(thread.from, clean));
}

/** Read the user's client-senders list (server side). Missing or bad data → []. */
export async function loadClientSenders(payload: Pick<Payload, "find">, userId: number): Promise<string[]> {
  return loadSenderListPreference(payload, userId, CLIENT_SENDERS_PREF_KEY);
}
