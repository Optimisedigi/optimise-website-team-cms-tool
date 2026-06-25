/**
 * Shared NKL-routing resolution for the match-type-violation approve flows.
 *
 * Both the single and bulk approve routes need to decide *which* negative
 * keyword list a violation's negative lands in. This centralises the three
 * supported modes so the routes stay thin and consistent:
 *   - `existing` (or the legacy `assignedListId`): assign to a chosen list.
 *   - `auto` (default): match an ad-group list via {@link pickAdGroupList};
 *     create a new ad-group-scoped list when none matches.
 */
import type { getPayload } from "payload";
import { pickAdGroupList, type RoutableNkl } from "@/lib/nkl-routing";

type Payload = Awaited<ReturnType<typeof getPayload>>;

export type Routing =
  | { mode: "auto" }
  | { mode: "existing"; listId: string | number };

export interface RoutingCandidate {
  client: number | string | { id: number | string };
  adGroupName?: string | null;
  campaignName?: string | null;
}

export interface ResolvedTarget {
  listId: string | number;
  created: boolean;
}

function clientIdOf(client: RoutingCandidate["client"]): number | string {
  return typeof client === "object" ? (client as { id: number | string }).id : client;
}

/**
 * Coerce an all-digit string id to a number. The Match Type Variance UI sends
 * the chosen list id as a `<select>` value (always a string), but the
 * `assignedListId` relationship update validates its type and rejects a string
 * against an integer-keyed collection ("The following field is invalid"), which
 * surfaced as an opaque 500 on approve. Numeric strings become numbers; genuine
 * non-numeric ids are returned untouched.
 */
function normalizeListId(id: string | number): string | number {
  if (typeof id === "number") return id;
  return /^\d+$/.test(id) ? Number(id) : id;
}

/**
 * Resolve the destination NKL id for a candidate. An explicit `existing` mode
 * or a legacy `assignedListId` wins; otherwise `auto` matches an ad-group list
 * for the candidate's ad group/campaign, creating a new ad-group-scoped list
 * (source `match_type`) when nothing matches.
 */
export async function resolveTargetList(
  payload: Payload,
  opts: {
    candidate: RoutingCandidate;
    routing?: Routing | null;
    assignedListId?: string | number | null;
  },
): Promise<ResolvedTarget> {
  const { candidate, routing, assignedListId } = opts;
  const clientId = clientIdOf(candidate.client);

  if (routing?.mode === "existing" && routing.listId) {
    return { listId: normalizeListId(routing.listId), created: false };
  }
  if (assignedListId && (!routing || routing.mode !== "auto")) {
    return { listId: normalizeListId(assignedListId), created: false };
  }

  // auto mode — find a matching ad-group list, else create one.
  const lists = (await (payload.find as any)({
    collection: "negative-keyword-lists",
    where: { client: { equals: clientId } },
    depth: 0,
    limit: 500,
    overrideAccess: true,
  })) as { docs: RoutableNkl[] };

  const picked = pickAdGroupList(lists.docs ?? [], {
    adGroupName: candidate.adGroupName,
    campaignName: candidate.campaignName,
  });
  if (picked) return { listId: picked.id, created: false };

  const adGroupName =
    String(candidate.adGroupName ?? "").trim() ||
    String(candidate.campaignName ?? "").trim() ||
    "Match Type Negatives";

  const listName = `[OD] ${adGroupName} NKL`;

  const createdList = (await (payload.create as any)({
    collection: "negative-keyword-lists",
    data: {
      client: clientId,
      name: listName,
      scope: "ad_group",
      adGroupName,
      campaignRegex: adGroupName,
      source: "match_type",
      isActive: true,
    },
    overrideAccess: true,
  })) as { id: string | number };

  const listId = typeof createdList.id === "object" ? (createdList.id as any).id : createdList.id;
  return { listId, created: true };
}

/** Parse an untrusted `routing` body into a typed value (or null). */
export function parseRouting(raw: unknown): Routing | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { mode?: unknown; listId?: unknown };
  if (r.mode === "auto") return { mode: "auto" };
  if (r.mode === "existing" && (typeof r.listId === "string" || typeof r.listId === "number")) {
    return { mode: "existing", listId: r.listId };
  }
  return null;
}
