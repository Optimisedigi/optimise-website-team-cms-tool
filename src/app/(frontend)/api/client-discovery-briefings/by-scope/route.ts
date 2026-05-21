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
    if (!doc) {
      return NextResponse.json({
        id: null,
        data: defaultDiscoveryBriefingState(),
        markdown: null,
        scope: parsed.scope,
        scopeId: parsed.id,
        parentSlug,
        briefingIdPadded: padBriefingId(null),
      });
    }
    return NextResponse.json({
      id: doc.id,
      data: (doc.data as DiscoveryBriefingState | undefined) ?? defaultDiscoveryBriefingState(),
      markdown: typeof doc.markdown === "string" ? doc.markdown : null,
      scope: parsed.scope,
      scopeId: parsed.id,
      parentSlug,
      briefingIdPadded: padBriefingId(doc.id ?? null),
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

export async function PUT(req: NextRequest) {
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

  const data = (body as { data: DiscoveryBriefingState }).data;

  try {
    const existing = await findBriefingByScope(payload, parsed.relationField, parsed.id);

    let saved: any;
    if (existing) {
      saved = await (payload.update as any)({
        collection: "client-discovery-briefings",
        id: existing.id,
        data: { data },
        depth: 0,
        overrideAccess: true,
      });
    } else {
      saved = await (payload.create as any)({
        collection: "client-discovery-briefings",
        data: {
          data,
          [parsed.relationField]: parsed.id,
        },
        depth: 0,
        overrideAccess: true,
      });
    }

    const parentSlug = await loadParentSlug(payload, parsed.scope, parsed.id);

    return NextResponse.json({
      id: saved.id,
      data: (saved.data as DiscoveryBriefingState | undefined) ?? data,
      markdown: typeof saved.markdown === "string" ? saved.markdown : null,
      scope: parsed.scope,
      scopeId: parsed.id,
      parentSlug,
      briefingIdPadded: padBriefingId(saved.id ?? null),
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
