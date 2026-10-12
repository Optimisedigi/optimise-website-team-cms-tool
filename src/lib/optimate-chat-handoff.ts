/**
 * One-time handoff of a live chat into a popped-out OptiMate window.
 *
 * AdminMate and InvoiceMate keep their conversation only in memory, so a new
 * window would otherwise open blank. The launcher stashes a snapshot in
 * localStorage (shared by same-origin windows) under a random id, passes the
 * id in the popout URL, and the new window takes it exactly once: the entry
 * is deleted on read and expires quickly so chat content doesn't linger.
 */

import type { MutableRefObject } from "react";

export type HandoffAgent = "adminmate" | "invoices";

/** Set by a chat component so the launcher's pop-out button can snapshot it. */
export type ChatHandoffRef = MutableRefObject<(() => unknown) | null>;

const KEY_PREFIX = "optimate:handoff:";
/** Long enough for a slow popup to load; short enough not to linger. */
export const HANDOFF_TTL_MS = 2 * 60 * 1000;
/** Keep well under the ~5MB localStorage quota. */
const MAX_HANDOFF_BYTES = 1_000_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

interface StoredHandoff {
  agent: HandoffAgent;
  createdAt: number;
  snapshot: unknown;
}

function isHandoffId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

/** Remove expired or unreadable handoff entries left by abandoned popups. */
function pruneExpired(storage: StorageLike, now: number): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key?.startsWith(KEY_PREFIX)) keys.push(key);
  }
  for (const key of keys.sort()) {
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "null") as Partial<StoredHandoff> | null;
      if (!parsed || typeof parsed.createdAt !== "number" || now - parsed.createdAt > HANDOFF_TTL_MS) {
        storage.removeItem(key);
      }
    } catch {
      storage.removeItem(key);
    }
  }
}

/** Stash a snapshot; returns the handoff id, or null if it couldn't be stored. */
export function stashChatHandoff(args: {
  storage: StorageLike;
  agent: HandoffAgent;
  snapshot: unknown;
  id: string;
  now: number;
}): string | null {
  if (!isHandoffId(args.id)) return null;
  try {
    pruneExpired(args.storage, args.now);
    const value = JSON.stringify({ agent: args.agent, createdAt: args.now, snapshot: args.snapshot } satisfies StoredHandoff);
    if (value.length > MAX_HANDOFF_BYTES) return null;
    args.storage.setItem(`${KEY_PREFIX}${args.id}`, value);
    return args.id;
  } catch {
    // Quota exceeded / storage disabled: the popout just opens a fresh chat.
    return null;
  }
}

/** Read and delete a snapshot. Returns null if missing, expired or for another agent. */
export function takeChatHandoff(args: {
  storage: StorageLike;
  agent: HandoffAgent;
  id: string;
  now: number;
}): unknown {
  if (!isHandoffId(args.id)) return null;
  const key = `${KEY_PREFIX}${args.id}`;
  try {
    const raw = args.storage.getItem(key);
    args.storage.removeItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredHandoff>;
    if (parsed.agent !== args.agent) return null;
    if (typeof parsed.createdAt !== "number" || args.now - parsed.createdAt > HANDOFF_TTL_MS) return null;
    return parsed.snapshot ?? null;
  } catch {
    return null;
  }
}

/** Validated chat text messages from an untrusted snapshot. */
export function readHandoffMessages(
  snapshot: unknown,
  allowedRoles: ReadonlyArray<string>,
): Array<{ role: string; content: string; raw: Record<string, unknown> }> {
  if (!snapshot || typeof snapshot !== "object") return [];
  const messages = (snapshot as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    if (typeof raw.role !== "string" || !allowedRoles.includes(raw.role)) return [];
    if (typeof raw.content !== "string") return [];
    return [{ role: raw.role, content: raw.content, raw }];
  });
}

export function readHandoffString(snapshot: unknown, field: string): string {
  if (!snapshot || typeof snapshot !== "object") return "";
  const value = (snapshot as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}
