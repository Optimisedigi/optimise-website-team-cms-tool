/**
 * Shared helpers for the scoped discovery briefing routes.
 *
 * The canonical URLs are:
 *   /client/<slug>/discovery/<paddedId>
 *   /client-proposal/<slug>/discovery/<paddedId>
 *
 * `<paddedId>` is the briefing record's numeric id zero-padded to at least
 * three digits (so freshly-minted briefings are `001`, `002`, … and the
 * "not yet created" placeholder is `000`). The legacy
 * `/discovery/<scope>/<id>` route is a 308 redirect to the canonical shape.
 */

import { getPayload } from "payload";
import {
  defaultDiscoveryBriefingState,
  type DiscoveryBriefingState,
} from "./types";

export type DiscoveryScope = "client" | "proposal";

/** Zero-pad to three digits. `null`/invalid → "000" sentinel for "not yet created". */
export function padBriefingId(id: number | null | undefined): string {
  if (id == null) return "000";
  const n = Number(id);
  if (!Number.isFinite(n) || n < 0) return "000";
  return String(Math.floor(n)).padStart(3, "0");
}

/**
 * Parse a padded briefing id back to a number. Returns `null` if the input
 * isn't 3-or-more digits or is otherwise invalid.
 */
export function parseBriefingId(raw: string): number | null {
  if (!/^\d{3,}$/.test(raw)) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

interface ResolveArgs {
  payload: Awaited<ReturnType<typeof getPayload>>;
  scope: DiscoveryScope;
  slug: string;
  briefingId: string;
}

/** A single slide deck on the parent record, exposed to the form. */
export interface AvailableDeck {
  /** Deck slug (route segment under /partners/<client>/<slug>/). */
  slug: string;
  /** Human-readable deck title. */
  title: string;
  /** Absolute or relative deck URL as stored on the parent. */
  url: string;
}

interface ResolveResultOk {
  ok: true;
  /** The parent Client or ClientProposal doc (depth=0). */
  parent: any;
  /** The matched briefing doc, or `null` when none has been persisted yet. */
  briefing: any | null;
  /** Initial state to hydrate the form with (default state merged over the doc). */
  initialState: DiscoveryBriefingState;
  /** Padded id reflecting the actual briefing id, or "000" pre-create. */
  paddedBriefingId: string;
  /** Canonical URL for this briefing (slug-correct + padded id). */
  canonicalUrl: string;
  scopeLabel: string;
  /** Slide decks declared on the parent (`presentations[]`) with a non-empty slug. */
  availableDecks: AvailableDeck[];
}

interface ResolveResultRedirect {
  ok: false;
  kind: "redirect";
  to: string;
}

interface ResolveResultNotFound {
  ok: false;
  kind: "notFound";
}

export type ResolveResult =
  | ResolveResultOk
  | ResolveResultRedirect
  | ResolveResultNotFound;

const SCOPE_PATH: Record<DiscoveryScope, string> = {
  client: "client",
  proposal: "client-proposal",
};

const SCOPE_RELATION: Record<DiscoveryScope, "client" | "clientProposal"> = {
  client: "client",
  proposal: "clientProposal",
};

const SCOPE_COLLECTION: Record<DiscoveryScope, "clients" | "client-proposals"> =
  {
    client: "clients",
    proposal: "client-proposals",
  };

/** Build the canonical URL for a given scope/slug/padded-id. */
export function canonicalDiscoveryUrl(
  scope: DiscoveryScope,
  slug: string,
  paddedBriefingId: string,
): string {
  return `/${SCOPE_PATH[scope]}/${slug}/discovery/${paddedBriefingId}`;
}

/**
 * Look up the parent record by slug, then locate (or default) the briefing.
 *
 * Returns:
 *   - `{ ok: true, ... }` on success (with `briefing: null` for the
 *     pre-create case).
 *   - `{ ok: false, kind: "redirect", to }` when the slug is wrong but a
 *     parent does exist for that scope+id (callers issue a 308).
 *   - `{ ok: false, kind: "notFound" }` when the parent cannot be located.
 */
export async function resolveScopedBriefing(
  args: ResolveArgs,
): Promise<ResolveResult> {
  const { payload, scope, slug, briefingId } = args;
  const collection = SCOPE_COLLECTION[scope];
  const relation = SCOPE_RELATION[scope];

  // Find the parent by slug. We accept the canonical slug only — if the
  // caller passed a stale or mismatched slug we'll redirect them below.
  let parent: any = null;
  try {
    const found = await (payload.find as any)({
      collection,
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    parent = found.docs?.[0] ?? null;
  } catch {
    parent = null;
  }
  if (!parent) {
    return { ok: false, kind: "notFound" };
  }

  // Resolve the briefing by parent relation.
  let briefing: any = null;
  try {
    const found = await (payload.find as any)({
      collection: "client-discovery-briefings",
      where: { [relation]: { equals: parent.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    briefing = found.docs?.[0] ?? null;
  } catch {
    briefing = null;
  }

  // The padded id we expect in the URL.
  const expectedPadded = padBriefingId(briefing?.id ?? null);
  const canonicalUrl = canonicalDiscoveryUrl(scope, parent.slug ?? slug, expectedPadded);

  // If the URL's briefing id doesn't match the actual briefing id, redirect.
  // "000" is the legitimate pre-create placeholder.
  if (briefingId !== expectedPadded) {
    // Allow "000" iff there's no briefing yet — handled by equality check above.
    return { ok: false, kind: "redirect", to: canonicalUrl };
  }

  // Build the initial state. Pre-fill businessName from the parent if the
  // saved state doesn't already have one — the form no longer exposes that
  // field, so we keep the markdown header sensible.
  const parentBusinessName: string =
    (typeof parent.businessName === "string" && parent.businessName) ||
    (typeof parent.tradingName === "string" && parent.tradingName) ||
    (typeof parent.name === "string" && parent.name) ||
    (typeof parent.title === "string" && parent.title) ||
    "";
  const parentWebsite: string =
    (typeof parent.websiteUrl === "string" && parent.websiteUrl) || "";

  let initialState: DiscoveryBriefingState = defaultDiscoveryBriefingState();
  if (briefing?.data && typeof briefing.data === "object") {
    initialState = {
      ...defaultDiscoveryBriefingState(),
      ...(briefing.data as DiscoveryBriefingState),
    };
  }
  if (!initialState.businessName && parentBusinessName) {
    initialState.businessName = parentBusinessName;
  }
  if (!initialState.websiteUrl && parentWebsite) {
    initialState.websiteUrl = parentWebsite;
  }

  const scopeLabel =
    (typeof parent.businessName === "string" && parent.businessName) ||
    (typeof parent.name === "string" && parent.name) ||
    (typeof parent.title === "string" && parent.title) ||
    "Discovery Briefing";

  const availableDecks: AvailableDeck[] = Array.isArray(parent.presentations)
    ? parent.presentations
        .map((p: Record<string, unknown>): AvailableDeck | null => {
          const slug = typeof p.deckSlug === "string" ? p.deckSlug.trim() : "";
          if (!slug) return null;
          const title = typeof p.title === "string" ? p.title : slug;
          const url = typeof p.deckUrl === "string" ? p.deckUrl : "";
          return { slug, title, url };
        })
        .filter((d: AvailableDeck | null): d is AvailableDeck => d !== null)
    : [];

  return {
    ok: true,
    parent,
    briefing,
    initialState,
    paddedBriefingId: expectedPadded,
    canonicalUrl,
    scopeLabel,
    availableDecks,
  };
}
