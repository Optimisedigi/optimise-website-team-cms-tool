import type { Payload } from "payload";
import { extractEmailAddresses, normaliseDomain, SHARED_MAILBOX_DOMAINS, type SenderClientOverride } from "./client-matching";
import { normaliseHiddenSender } from "./hidden-senders";

/**
 * Per-user "this sender belongs to that client" choices (the Client control
 * in Mail's reading pane). Automatic matching (client-matching.ts) picks a
 * client from website and contact domains; when it picks the wrong one, or
 * none, the user can choose the client for an address ("jo@x.com") or a
 * whole domain ("@x.com", subdomains included), or "No client" (clientId
 * null). The choice decides the list pill, which client new emails are
 * saved to, and Use client data. Stored in Payload's per-user preferences
 * under SENDER_CLIENTS_PREF_KEY, like hidden and client senders.
 *
 * Client-safe: no server imports beyond types.
 */

export const SENDER_CLIENTS_PREF_KEY = "mail-sender-clients";
export const MAX_SENDER_CLIENTS = 200;

/**
 * "Jo <JO@x.com>" → "jo@x.com"; "x.com" / "@x.com" → "@x.com". A whole
 * shared provider (gmail.com, outlook.com, ...) is never one client, so those
 * domains are refused (an exact address on them is fine).
 */
export function normaliseSenderEntry(raw: string | null | undefined): string | null {
  const entry = normaliseHiddenSender(raw);
  if (!entry) return null;
  if (entry.startsWith("@") && SHARED_MAILBOX_DOMAINS.has(entry.slice(1))) return null;
  return entry;
}

/** Clean, dedupe (latest choice per sender wins) and cap a stored or submitted list. */
export function cleanSenderClients(raw: unknown): SenderClientOverride[] {
  if (!Array.isArray(raw)) return [];
  const bySender = new Map<string, SenderClientOverride>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const sender = normaliseSenderEntry(typeof (item as { sender?: unknown }).sender === "string" ? (item as { sender: string }).sender : "");
    const rawId = (item as { clientId?: unknown }).clientId;
    const clientId = rawId === null ? null : typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    if (!sender || clientId === undefined) continue;
    bySender.delete(sender);
    bySender.set(sender, { sender, clientId });
  }
  return [...bySender.values()].slice(-MAX_SENDER_CLIENTS);
}

/** The saved choice that applies to this From header (exact address first, then the closest domain), if any. */
export function senderClientFor(from: string | null | undefined, list: SenderClientOverride[]): SenderClientOverride | undefined {
  const bracketed = (from ?? "").match(/<([^<>]+)>\s*$/)?.[1];
  const address = extractEmailAddresses(bracketed ?? from)[0];
  if (!address) return undefined;
  const exact = list.find((entry) => entry.sender === address);
  if (exact) return exact;
  const labels = normaliseDomain(address).split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const found = list.find((entry) => entry.sender === `@${labels.slice(i).join(".")}`);
    if (found) return found;
  }
  return undefined;
}

/** `list` with `sender` set to `clientId` (a client id, or null for "No client"), or removed when `clientId` is undefined. */
export function withSenderClient(list: SenderClientOverride[], sender: string, clientId: number | null | undefined): SenderClientOverride[] {
  const rest = list.filter((entry) => entry.sender !== sender);
  return clientId === undefined ? rest : cleanSenderClients([...rest, { sender, clientId }]);
}

type PreferencePayload = Pick<Payload, "find" | "create" | "update">;

async function findPreference(payload: Pick<Payload, "find">, userId: number) {
  const res = await payload.find({
    collection: "payload-preferences",
    where: {
      and: [
        { key: { equals: SENDER_CLIENTS_PREF_KEY } },
        { "user.value": { equals: userId } },
        { "user.relationTo": { equals: "users" } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never);
  return (res as unknown as { docs: Array<{ id: number | string; value?: { entries?: unknown } | null }> }).docs[0] ?? null;
}

/** Read the user's sender → client choices (server side). Missing or bad data → []. */
export async function loadSenderClients(payload: Pick<Payload, "find">, userId: number): Promise<SenderClientOverride[]> {
  try {
    return cleanSenderClients((await findPreference(payload, userId))?.value?.entries);
  } catch {
    return [];
  }
}

export async function saveSenderClients(payload: PreferencePayload, userId: number, list: SenderClientOverride[]): Promise<void> {
  const value = { entries: cleanSenderClients(list) };
  const existing = await findPreference(payload, userId);
  if (existing) {
    await payload.update({ collection: "payload-preferences", id: existing.id, overrideAccess: true, data: { value } } as never);
    return;
  }
  await payload.create({
    collection: "payload-preferences",
    overrideAccess: true,
    data: { key: SENDER_CLIENTS_PREF_KEY, user: { relationTo: "users", value: userId }, value },
  } as never);
}
