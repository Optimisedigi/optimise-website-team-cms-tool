/**
 * Client Discovery Briefing — scope-based GET/PUT API.
 *
 * Lets a caller (the CMS-bound form at /discovery/[scope]/[id], or the
 * round-trip evidence script) load or upsert the briefing tied to a given
 * `client` or `clientProposal` relation, identified by `?scope=&id=`.
 *
 * The ClientDiscoveryBriefings collection's `beforeChange` hook
 * regenerates the canonical `markdown` blob from `data` on every save,
 * so this route only writes `data` (plus the scope relationship on
 * create) and returns whatever the hook produced.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  defaultDiscoveryBriefingState,
  type DiscoveryBriefingState,
} from "@/lib/discovery-briefing/types";
import { padBriefingId } from "@/lib/discovery-briefing/route-utils";

type Scope = "client" | "proposal";

interface DiscoveryActivityEntry {
  id: string;
  savedAt: string;
  savedBy: string;
  changes: string[];
  snapshot: DiscoveryBriefingState;
}

const ACTIVITY_KEY = "_activity";
const MAX_ACTIVITY_ENTRIES = 20;

interface ParsedScope {
  scope: Scope;
  id: number;
  /** Field name on the briefing document that holds this scope's relation. */
  relationField: "client" | "clientProposal";
}

function parseScope(req: NextRequest): ParsedScope | { error: string } {
  const { searchParams } = req.nextUrl;
  const rawScope = (searchParams.get("scope") ?? "").trim();
  const rawId = (searchParams.get("id") ?? "").trim();

  if (rawScope !== "client" && rawScope !== "proposal") {
    return { error: "scope must be 'client' or 'proposal'" };
  }
  if (!rawId || !/^\d+$/.test(rawId)) {
    return { error: "id must be a positive integer" };
  }
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return { error: "id must be a positive integer" };
  }

  return {
    scope: rawScope,
    id,
    relationField: rawScope === "client" ? "client" : "clientProposal",
  };
}

async function findBriefingByScope(
  payload: Awaited<ReturnType<typeof getPayload>>,
  relationField: "client" | "clientProposal",
  id: number,
): Promise<any | null> {
  const result = await (payload.find as any)({
    collection: "client-discovery-briefings",
    where: { [relationField]: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return result.docs?.[0] ?? null;
}

function stripInternalData(data: unknown): DiscoveryBriefingState {
  const base =
    data && typeof data === "object"
      ? ({ ...(data as Record<string, unknown>) } as Record<string, unknown>)
      : (defaultDiscoveryBriefingState() as unknown as Record<string, unknown>);
  delete base[ACTIVITY_KEY];
  return {
    ...defaultDiscoveryBriefingState(),
    ...(base as unknown as DiscoveryBriefingState),
  };
}

function getActivityEntries(data: unknown): DiscoveryActivityEntry[] {
  if (!data || typeof data !== "object") return [];
  const raw = (data as Record<string, unknown>)[ACTIVITY_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is DiscoveryActivityEntry => {
    return (
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as DiscoveryActivityEntry).id === "string" &&
      typeof (entry as DiscoveryActivityEntry).savedAt === "string" &&
      typeof (entry as DiscoveryActivityEntry).savedBy === "string" &&
      Array.isArray((entry as DiscoveryActivityEntry).changes) &&
      !!(entry as DiscoveryActivityEntry).snapshot &&
      typeof (entry as DiscoveryActivityEntry).snapshot === "object"
    );
  });
}

function humanizeFieldName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function summarizeValue(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "empty";
    return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
  }
  if (value && typeof value === "object") return "details updated";
  if (value == null) return "empty";
  return String(value);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function describeChanges(
  previousData: DiscoveryBriefingState,
  nextData: DiscoveryBriefingState,
): string[] {
  const keys = new Set([...Object.keys(previousData), ...Object.keys(nextData)]);
  const changes: string[] = [];
  for (const key of Array.from(keys).sort()) {
    const before = (previousData as unknown as Record<string, unknown>)[key];
    const after = (nextData as unknown as Record<string, unknown>)[key];
    if (stableStringify(before) === stableStringify(after)) continue;
    changes.push(
      `${humanizeFieldName(key)} changed from ${summarizeValue(before)} to ${summarizeValue(after)}`,
    );
  }
  return changes;
}

function actorLabel(user: unknown, requestedLabel: unknown): string {
  if (user && typeof user === "object") {
    const record = user as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const email = typeof record.email === "string" ? record.email.trim() : "";
    if (name && email) return `${name} (${email})`;
    if (email) return email;
    if (name) return name;
  }
  return typeof requestedLabel === "string" && requestedLabel.trim()
    ? requestedLabel.trim().slice(0, 120)
    : "Public link visitor";
}

function withActivity(
  nextData: DiscoveryBriefingState,
  existingData: unknown,
  savedBy: string,
): DiscoveryBriefingState & { [ACTIVITY_KEY]?: DiscoveryActivityEntry[] } {
  const previous = stripInternalData(existingData);
  const changes = describeChanges(previous, nextData);
  const priorActivity = getActivityEntries(existingData);
  if (changes.length === 0) {
    return { ...(nextData as DiscoveryBriefingState), [ACTIVITY_KEY]: priorActivity };
  }
  const savedAt = new Date().toISOString();
  const entry: DiscoveryActivityEntry = {
    id: `${savedAt}-${priorActivity.length + 1}`,
    savedAt,
    savedBy,
    changes: changes.slice(0, 12),
    snapshot: nextData,
  };
  return {
    ...(nextData as DiscoveryBriefingState),
    [ACTIVITY_KEY]: [entry, ...priorActivity].slice(0, MAX_ACTIVITY_ENTRIES),
  };
}

async function loadParentSlug(
  payload: Awaited<ReturnType<typeof getPayload>>,
  scope: Scope,
  id: number,
): Promise<string | null> {
  try {
    const collection = scope === "client" ? "clients" : "client-proposals";
    const parent = await (payload.findByID as any)({
      collection,
      id,
      depth: 0,
      overrideAccess: true,
    });
    return typeof parent?.slug === "string" && parent.slug ? parent.slug : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the PIN to surface as the "share this PIN" hint in the admin
 * panel. Mirrors the lookup used by `resolveScopedBriefing`:
 *   - client scope → `clients.clientPin`
 *   - proposal scope → `client_proposals.proposalPin` falling back to the
 *     linked client's `clientPin` if the proposal has none.
 * Returns an empty string when no PIN is configured.
 */
async function loadParentPin(
  payload: Awaited<ReturnType<typeof getPayload>>,
  scope: Scope,
  id: number,
): Promise<string> {
  try {
    if (scope === "client") {
      const parent = await (payload.findByID as any)({
        collection: "clients",
        id,
        depth: 0,
        overrideAccess: true,
      });
      return typeof parent?.clientPin === "string" ? parent.clientPin : "";
    }
    const parent = await (payload.findByID as any)({
      collection: "client-proposals",
      id,
      depth: 0,
      overrideAccess: true,
    });
    const proposalPin =
      typeof parent?.proposalPin === "string" ? parent.proposalPin : "";
    if (proposalPin) return proposalPin;
    if (parent?.client != null) {
      const linkedId =
        typeof parent.client === "object" ? parent.client.id : parent.client;
      const linkedClient = await (payload.findByID as any)({
        collection: "clients",
        id: linkedId,
        depth: 0,
        overrideAccess: true,
      });
      return typeof linkedClient?.clientPin === "string"
        ? linkedClient.clientPin
        : "";
    }
    return "";
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseScope(req);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const [doc, parentSlug] = await Promise.all([
      findBriefingByScope(payload, parsed.relationField, parsed.id),
      loadParentSlug(payload, parsed.scope, parsed.id),
    ]);
    const parentPin = await loadParentPin(payload, parsed.scope, parsed.id);
    if (!doc) {
      return NextResponse.json({
        id: null,
        data: defaultDiscoveryBriefingState(),
        markdown: null,
        scope: parsed.scope,
        scopeId: parsed.id,
        parentSlug,
        briefingIdPadded: padBriefingId(null),
        requirePin: false,
        hiddenSections: [],
        parentPin,
      });
    }
    const docData = stripInternalData(doc.data);
    return NextResponse.json({
      id: doc.id,
      data: docData,
      markdown: typeof doc.markdown === "string" ? doc.markdown : null,
      scope: parsed.scope,
      scopeId: parsed.id,
      parentSlug,
      briefingIdPadded: padBriefingId(doc.id ?? null),
      requirePin: !!doc.requirePin,
      hiddenSections: Array.isArray(docData.hiddenSections)
        ? docData.hiddenSections
        : [],
      activity: getActivityEntries(doc.data),
      parentPin,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to load discovery briefing",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

/**
 * Partial-update endpoint. Accepts one or both of:
 *   - `{ requirePin: boolean }` — toggles the PIN gate on the briefing.
 *   - `{ hiddenSections: string[] }` — replaces the embedded
 *     `data.hiddenSections` array (the rest of `data` is preserved).
 *
 * Creates the briefing row if it doesn't exist yet so the admin tab can
 * flip toggles before any answers have been saved. The same field is also
 * edited inline from the public form via PUT (full `data`) — callers race
 * naturally; last writer wins, which matches the form's existing autosave
 * semantics.
 */
export async function PATCH(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const savedBy = actorLabel(user, undefined);

  const parsed = parseScope(req);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const requirePinRaw = (body as { requirePin?: unknown } | null)?.requirePin;
  const hiddenSectionsRaw = (body as { hiddenSections?: unknown } | null)
    ?.hiddenSections;

  const hasRequirePin = typeof requirePinRaw === "boolean";
  const hasHiddenSections =
    Array.isArray(hiddenSectionsRaw) &&
    hiddenSectionsRaw.every((v) => typeof v === "string");

  if (!hasRequirePin && !hasHiddenSections) {
    return NextResponse.json(
      {
        error:
          "Body must contain at least one of { requirePin: boolean } or { hiddenSections: string[] }",
      },
      { status: 400 },
    );
  }

  const requirePin = hasRequirePin ? (requirePinRaw as boolean) : undefined;
  const hiddenSections = hasHiddenSections
    ? (hiddenSectionsRaw as string[])
    : undefined;

  try {
    const existing = await findBriefingByScope(
      payload,
      parsed.relationField,
      parsed.id,
    );

    // Build the update payload. When hiddenSections is being changed we
    // merge it into the existing `data` so the rest of the questionnaire
    // state isn't clobbered. When the briefing is being created from scratch
    // we seed `data` with the default state and only overwrite
    // hiddenSections — mirrors the GET fallback shape.
    const updateData: Record<string, unknown> = {};
    if (requirePin !== undefined) {
      updateData.requirePin = requirePin;
    }
    if (hiddenSections !== undefined) {
      const baseData = stripInternalData(existing?.data);
      updateData.data = withActivity(
        { ...baseData, hiddenSections },
        existing?.data,
        savedBy,
      );
    }

    let saved: any;
    if (existing) {
      saved = await (payload.update as any)({
        collection: "client-discovery-briefings",
        id: existing.id,
        data: updateData,
        depth: 0,
        overrideAccess: true,
      });
    } else {
      saved = await (payload.create as any)({
        collection: "client-discovery-briefings",
        data: {
          ...updateData,
          [parsed.relationField]: parsed.id,
        },
        depth: 0,
        overrideAccess: true,
      });
    }

    const parentPin = await loadParentPin(payload, parsed.scope, parsed.id);
    const savedData = stripInternalData(saved.data);
    return NextResponse.json({
      id: saved.id,
      requirePin: !!saved.requirePin,
      hiddenSections: Array.isArray(savedData.hiddenSections)
        ? savedData.hiddenSections
        : [],
      activity: getActivityEntries(saved.data),
      parentPin,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to update discovery briefing",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Saving is intentionally link-accessible: clients do not have CMS accounts,
  // and the public discovery URL is the collaboration token. Auth is still read
  // when present so CMS saves can be attributed to the logged-in user.
  let user: unknown = null;
  try {
    const authResult = await payload.auth({ headers: req.headers });
    user = authResult.user ?? null;
  } catch {
    user = null;
  }

  const parsed = parseScope(req);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { data?: unknown }).data !== "object" ||
    (body as { data?: unknown }).data === null
  ) {
    return NextResponse.json(
      { error: "Body must be { data: DiscoveryBriefingState }" },
      { status: 400 },
    );
  }

  const data = stripInternalData((body as { data: DiscoveryBriefingState }).data);
  const savedBy = actorLabel(user, (body as { savedByLabel?: unknown }).savedByLabel);

  try {
    const existing = await findBriefingByScope(payload, parsed.relationField, parsed.id);
    const dataWithActivity = withActivity(data, existing?.data, savedBy);

    let saved: any;
    if (existing) {
      saved = await (payload.update as any)({
        collection: "client-discovery-briefings",
        id: existing.id,
        data: { data: dataWithActivity },
        depth: 0,
        overrideAccess: true,
      });
    } else {
      saved = await (payload.create as any)({
        collection: "client-discovery-briefings",
        data: {
          data: dataWithActivity,
          [parsed.relationField]: parsed.id,
        },
        depth: 0,
        overrideAccess: true,
      });
    }

    const parentSlug = await loadParentSlug(payload, parsed.scope, parsed.id);
    const savedData = stripInternalData(saved.data ?? dataWithActivity);

    return NextResponse.json({
      id: saved.id,
      data: savedData,
      markdown: typeof saved.markdown === "string" ? saved.markdown : null,
      scope: parsed.scope,
      scopeId: parsed.id,
      parentSlug,
      briefingIdPadded: padBriefingId(saved.id ?? null),
      activity: getActivityEntries(saved.data ?? dataWithActivity),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to save discovery briefing",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
