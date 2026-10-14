import type { Payload } from "payload";
import {
  buildClientDomainIndex,
  matchMessageToClient,
  messageDirection,
  type ClientDomainIndex,
  type MatchableClient,
} from "./client-matching";
import {
  GmailHistoryExpiredError,
  getFullMessage,
  getMailboxProfile,
  getMessageHeaders,
  gmailMessageLink,
  isSyncableLabelSet,
  listAddedMessageIdsSince,
  listRecentMessageIds,
  mapLimited,
} from "./gmail-mail";
import type { GmailFullMessage } from "@/lib/gmail-search";

/**
 * Deterministic storage + sync for client emails. No model calls here, ever:
 * matching and storing are plain code (see client-matching.ts).
 */

export const INITIAL_SYNC_DAYS = 14;
export const INITIAL_SYNC_MAX = 200;
export const MAX_BODY_STORED = 100_000;

type PayloadLike = Pick<Payload, "find" | "create" | "update">;

export interface ClientEmailInput {
  gmailMessageId: string;
  gmailThreadId: string;
  clientId: number;
  ownerId: number;
  direction: "inbound" | "outbound";
  matchedBy: "auto" | "manual";
  matchedOn: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  body: string;
  gmailLink: string;
}

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unique|already exists|duplicate/i.test(message);
}

/** Ids from `ids` that already have a client-emails row. */
export async function findStoredMessageIds(payload: PayloadLike, ids: string[]): Promise<Set<string>> {
  const stored = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await payload.find({
      collection: "client-emails",
      where: { gmailMessageId: { in: chunk } },
      limit: chunk.length,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { gmailMessageId: true },
    } as never);
    for (const doc of (res as { docs: Array<{ gmailMessageId?: string }> }).docs) {
      if (doc.gmailMessageId) stored.add(doc.gmailMessageId);
    }
  }
  return stored;
}

/**
 * Save one email against a client. Deduped by Gmail message id: an existing
 * row is returned untouched, and a concurrent insert that trips the unique
 * index is treated as "already stored".
 */
export async function storeClientEmail(
  payload: PayloadLike,
  input: ClientEmailInput,
): Promise<{ created: boolean; id: number | null }> {
  const existing = await payload.find({
    collection: "client-emails",
    where: { gmailMessageId: { equals: input.gmailMessageId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never);
  const found = (existing as { docs: Array<{ id: number }> }).docs[0];
  if (found) return { created: false, id: found.id };

  try {
    const doc = await payload.create({
      collection: "client-emails",
      overrideAccess: true,
      data: {
        gmailMessageId: input.gmailMessageId,
        gmailThreadId: input.gmailThreadId,
        client: input.clientId,
        owner: input.ownerId,
        direction: input.direction,
        matchedBy: input.matchedBy,
        matchedOn: input.matchedOn,
        from: input.from,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        date: input.date || null,
        body: input.body.slice(0, MAX_BODY_STORED),
        gmailLink: input.gmailLink,
      },
    } as never);
    return { created: true, id: (doc as { id: number }).id };
  } catch (err) {
    if (isUniqueViolation(err)) return { created: false, id: null };
    throw err;
  }
}

export async function loadClientDomainIndex(payload: PayloadLike, ownAddresses: string[]): Promise<ClientDomainIndex> {
  const res = await payload.find({
    collection: "clients",
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { name: true, websiteUrl: true, contactEmail: true, additionalContacts: true, isActive: true },
  } as never);
  return buildClientDomainIndex((res as { docs: MatchableClient[] }).docs, { ownAddresses });
}

export function toClientEmailInput(args: {
  message: GmailFullMessage;
  clientId: number;
  ownerId: number;
  matchedBy: "auto" | "manual";
  matchedOn: string;
  ownAddresses: string[];
  gmailAccount: string;
}): ClientEmailInput {
  const { message } = args;
  return {
    gmailMessageId: message.messageId,
    gmailThreadId: message.threadId,
    clientId: args.clientId,
    ownerId: args.ownerId,
    direction: messageDirection(message.from, args.ownAddresses),
    matchedBy: args.matchedBy,
    matchedOn: args.matchedOn,
    from: message.from,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    date: message.date,
    body: message.body,
    gmailLink: gmailMessageLink(message.messageId, args.gmailAccount),
  };
}

export interface SyncDeps {
  getMailboxProfile: typeof getMailboxProfile;
  listAddedMessageIdsSince: typeof listAddedMessageIdsSince;
  listRecentMessageIds: typeof listRecentMessageIds;
  getMessageHeaders: typeof getMessageHeaders;
  getFullMessage: typeof getFullMessage;
}

const defaultDeps: SyncDeps = {
  getMailboxProfile,
  listAddedMessageIdsSince,
  listRecentMessageIds,
  getMessageHeaders,
  getFullMessage,
};

export interface SyncResult {
  mode: "incremental" | "initial" | "history-expired";
  checked: number;
  stored: number;
  alreadyStored: number;
  unmatched: number;
}

/**
 * Pull new mail since the last sync and store client-matched messages.
 * Uses Gmail history (incremental) when a cursor exists; otherwise the last
 * INITIAL_SYNC_DAYS days. The cursor only moves forward after a clean run.
 */
export async function syncMailbox(args: {
  payload: PayloadLike;
  userId: number;
  accessToken: string;
  userEmail?: string;
  deps?: Partial<SyncDeps>;
}): Promise<SyncResult> {
  const deps = { ...defaultDeps, ...args.deps };
  const { payload, userId, accessToken } = args;

  const stateRes = await payload.find({
    collection: "mail-sync-states",
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  } as never);
  const state = (stateRes as { docs: Array<{ id: number; historyId?: string | null }> }).docs[0];

  try {
    // Read the cursor before listing, so nothing that arrives mid-sync is skipped next time.
    const profile = await deps.getMailboxProfile(accessToken);
    const ownAddresses = [profile.emailAddress, args.userEmail ?? ""].filter(Boolean);

    let mode: SyncResult["mode"] = "initial";
    let ids: string[];
    if (state?.historyId) {
      try {
        ids = await deps.listAddedMessageIdsSince(accessToken, state.historyId);
        mode = "incremental";
      } catch (err) {
        if (!(err instanceof GmailHistoryExpiredError)) throw err;
        ids = await deps.listRecentMessageIds(accessToken, INITIAL_SYNC_DAYS, INITIAL_SYNC_MAX);
        mode = "history-expired";
      }
    } else {
      ids = await deps.listRecentMessageIds(accessToken, INITIAL_SYNC_DAYS, INITIAL_SYNC_MAX);
    }

    const uniqueIds = [...new Set(ids)];
    const already = await findStoredMessageIds(payload, uniqueIds);
    const fresh = uniqueIds.filter((id) => !already.has(id));

    let stored = 0;
    let unmatched = 0;
    if (fresh.length > 0) {
      const index = await loadClientDomainIndex(payload, ownAddresses);
      const headers = await deps.getMessageHeaders(accessToken, fresh);
      const matched = headers
        .filter((header) => isSyncableLabelSet(header.labelIds))
        .map((header) => ({ header, match: matchMessageToClient(index, header) }));
      unmatched = matched.filter((entry) => !entry.match).length;

      const results = await mapLimited(
        matched.filter((entry) => entry.match),
        4,
        async ({ header, match }) => {
          const message = await deps.getFullMessage(accessToken, header.messageId);
          return storeClientEmail(
            payload,
            toClientEmailInput({
              message,
              clientId: match!.clientId,
              ownerId: userId,
              matchedBy: "auto",
              matchedOn: match!.matchedOn,
              ownAddresses,
              gmailAccount: profile.emailAddress,
            }),
          );
        },
      );
      stored = results.filter((result) => result.created).length;
    }

    const stateData = {
      user: userId,
      gmailAddress: profile.emailAddress,
      historyId: profile.historyId,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    };
    if (state) {
      await payload.update({ collection: "mail-sync-states", id: state.id, overrideAccess: true, data: stateData } as never);
    } else {
      await payload.create({ collection: "mail-sync-states", overrideAccess: true, data: stateData } as never);
    }

    return { mode, checked: uniqueIds.length, stored, alreadyStored: already.size, unmatched };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "Sync failed";
    if (state) {
      await payload
        .update({ collection: "mail-sync-states", id: state.id, overrideAccess: true, data: { lastError: message } } as never)
        .catch(() => undefined);
    }
    throw err;
  }
}
