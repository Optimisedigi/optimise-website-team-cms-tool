/**
 * Deterministic email → client matching for the Mail view.
 *
 * No model is involved: a message belongs to a client when one of its
 * addresses resolves against the client's own domains or contact addresses.
 *
 * Rules (documented in docs/mail.md):
 *  1. Client domains come from the client's Website URL (www. stripped) plus
 *     the domains of the client's main contact email and additional contacts.
 *     That is how one client can own several domains.
 *  2. Shared mailbox providers (gmail.com, outlook.com, bigpond.com, ...) are
 *     never treated as a client domain. Contacts on those providers match by
 *     their exact address only.
 *  3. Subdomains roll up to the client domain: someone@mail.inthepicture.com.au
 *     matches inthepicture.com.au. Never the reverse. The longest (most
 *     specific) client domain wins.
 *  4. If two clients claim the same domain, active clients win over inactive
 *     ones; if still tied the message stays unmatched for manual assignment.
 *  5. Our own addresses (the connected mailbox's domain and the agency
 *     domain) are ignored, so an outgoing email matches on its recipients.
 *  6. Addresses are tried in order: From, then To, then Cc. Exact address
 *     matches beat domain matches.
 */

export interface MatchableClient {
  id: number;
  name?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  additionalContacts?: Array<{ email?: string | null } | null> | null;
  isActive?: boolean | null;
}

export interface ClientMatch {
  clientId: number;
  clientName: string;
  /** The domain or exact address that produced the match. */
  matchedOn: string;
  matchType: "domain" | "address";
}

export interface ClientDomainIndex {
  domains: Map<string, Array<{ id: number; name: string; active: boolean }>>;
  addresses: Map<string, Array<{ id: number; name: string; active: boolean }>>;
  ignoredDomains: Set<string>;
}

export const AGENCY_DOMAINS = ["optimisedigital.online"] as const;

export const SHARED_MAILBOX_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.com.au", "hotmail.com", "hotmail.com.au",
  "live.com", "live.com.au", "msn.com", "yahoo.com", "yahoo.com.au", "ymail.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com",
  "fastmail.com", "bigpond.com", "bigpond.net.au", "bigpond.com.au", "optusnet.com.au",
  "tpg.com.au", "iinet.net.au", "internode.on.net", "westnet.com.au", "dodo.com.au",
]);

/** Lowercase host from a URL, bare host or email domain; strips www., port, path. */
export function normaliseDomain(input: string | null | undefined): string {
  if (!input) return "";
  let value = input.trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.replace(/^[^@]*@/, "");
  value = value.replace(/:\d+$/, "").replace(/\.+$/, "");
  value = value.replace(/^www\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) return "";
  return value;
}

const ADDRESS_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Every email address in a header value such as `"Jo" <jo@x.com>, sam@y.com`. */
export function extractEmailAddresses(header: string | null | undefined): string[] {
  if (!header) return [];
  const found = header.match(ADDRESS_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const address = raw.toLowerCase();
    if (seen.has(address)) continue;
    seen.add(address);
    out.push(address);
  }
  return out;
}

function addTo(
  map: Map<string, Array<{ id: number; name: string; active: boolean }>>,
  key: string,
  entry: { id: number; name: string; active: boolean },
): void {
  const list = map.get(key) ?? [];
  if (!list.some((existing) => existing.id === entry.id)) list.push(entry);
  map.set(key, list);
}

export function buildClientDomainIndex(
  clients: MatchableClient[],
  options: { ownAddresses?: string[] } = {},
): ClientDomainIndex {
  const ignoredDomains = new Set<string>(AGENCY_DOMAINS);
  for (const address of options.ownAddresses ?? []) {
    const domain = normaliseDomain(address);
    if (domain && !SHARED_MAILBOX_DOMAINS.has(domain)) ignoredDomains.add(domain);
  }

  const index: ClientDomainIndex = { domains: new Map(), addresses: new Map(), ignoredDomains };

  for (const client of clients) {
    if (typeof client.id !== "number") continue;
    const entry = { id: client.id, name: client.name ?? `Client ${client.id}`, active: client.isActive !== false };

    const website = normaliseDomain(client.websiteUrl);
    if (website && !SHARED_MAILBOX_DOMAINS.has(website) && !ignoredDomains.has(website)) {
      addTo(index.domains, website, entry);
    }

    const contactAddresses = [
      client.contactEmail,
      ...(client.additionalContacts ?? []).map((contact) => contact?.email),
    ];
    for (const raw of contactAddresses) {
      const address = extractEmailAddresses(raw ?? "")[0];
      if (!address) continue;
      const domain = normaliseDomain(address);
      if (!domain || ignoredDomains.has(domain)) continue;
      addTo(index.addresses, address, entry);
      if (!SHARED_MAILBOX_DOMAINS.has(domain)) addTo(index.domains, domain, entry);
    }
  }

  return index;
}

function pickOne(
  candidates: Array<{ id: number; name: string; active: boolean }> | undefined,
): { id: number; name: string } | null {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  const active = candidates.filter((candidate) => candidate.active);
  if (active.length === 1) return active[0]!;
  return null; // ambiguous: leave for manual assignment
}

/** Resolve one address to a client, or null. */
export function matchAddress(index: ClientDomainIndex, address: string): ClientMatch | null {
  const lower = address.trim().toLowerCase();
  const domain = normaliseDomain(lower);
  if (!domain) return null;
  if ([...index.ignoredDomains].some((ignored) => domain === ignored || domain.endsWith(`.${ignored}`))) {
    return null;
  }

  const exact = pickOne(index.addresses.get(lower));
  if (exact) return { clientId: exact.id, clientName: exact.name, matchedOn: lower, matchType: "address" };
  if (SHARED_MAILBOX_DOMAINS.has(domain)) return null;

  // Walk from the full domain up to its parents: mail.a.com.au → a.com.au → com.au.
  // The first (longest) client domain hit wins.
  const labels = domain.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    const hits = index.domains.get(candidate);
    if (!hits) continue;
    const chosen = pickOne(hits);
    return chosen
      ? { clientId: chosen.id, clientName: chosen.name, matchedOn: candidate, matchType: "domain" }
      : null;
  }
  return null;
}

export interface MatchableMessage {
  from?: string | null;
  to?: string | null;
  cc?: string | null;
}

/** Match a message by From, then To, then Cc. Returns null when nothing matches. */
export function matchMessageToClient(index: ClientDomainIndex, message: MatchableMessage): ClientMatch | null {
  const ordered = [
    ...extractEmailAddresses(message.from),
    ...extractEmailAddresses(message.to),
    ...extractEmailAddresses(message.cc),
  ];
  for (const address of ordered) {
    const match = matchAddress(index, address);
    if (match) return match;
  }
  return null;
}

/** "outbound" when the sender is one of our own addresses, else "inbound". */
export function messageDirection(
  from: string | null | undefined,
  ownAddresses: string[],
): "inbound" | "outbound" {
  const sender = extractEmailAddresses(from)[0];
  if (!sender) return "inbound";
  const own = new Set(ownAddresses.map((address) => address.trim().toLowerCase()).filter(Boolean));
  return own.has(sender) ? "outbound" : "inbound";
}
