/**
 * Legacy CMS-bound Client Discovery Briefing route — now a 308 redirect to
 * the canonical `/client/<slug>/discovery/<paddedId>` or
 * `/client-proposal/<slug>/discovery/<paddedId>` URL.
 *
 * Kept so older admin-panel links and bookmarks (`/discovery/client/3`,
 * `/discovery/proposal/12`) keep resolving. The redirect looks up the parent
 * slug + linked briefing id, then bounces.
 */

import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  canonicalDiscoveryUrl,
  padBriefingId,
  type DiscoveryScope,
} from "@/lib/discovery-briefing/route-utils";

export const dynamic = "force-dynamic";

type ParamsShape = Promise<{ scope: string; id: string }>;

function parseParams(scope: string, id: string):
  | {
      ok: true;
      scope: DiscoveryScope;
      id: number;
      relationField: "client" | "clientProposal";
      collection: "clients" | "client-proposals";
    }
  | { ok: false } {
  if (scope !== "client" && scope !== "proposal") return { ok: false };
  if (!/^\d+$/.test(id)) return { ok: false };
  const numeric = parseInt(id, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return { ok: false };
  return {
    ok: true,
    scope,
    id: numeric,
    relationField: scope === "client" ? "client" : "clientProposal",
    collection: scope === "client" ? "clients" : "client-proposals",
  };
}

export default async function LegacyDiscoveryBriefingRedirect({
  params,
}: {
  params: ParamsShape;
}) {
  const { scope: rawScope, id: rawId } = await params;
  const parsed = parseParams(rawScope, rawId);
  if (!parsed.ok) notFound();

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  let parent: any = null;
  try {
    parent = await (payload.findByID as any)({
      collection: parsed.collection,
      id: parsed.id,
      depth: 0,
      overrideAccess: true,
    });
  } catch {
    parent = null;
  }
  if (!parent || typeof parent.slug !== "string" || !parent.slug) {
    notFound();
  }

  let briefingId: number | null = null;
  try {
    const found = await (payload.find as any)({
      collection: "client-discovery-briefings",
      where: { [parsed.relationField]: { equals: parsed.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const doc = found.docs?.[0];
    if (doc?.id != null) briefingId = Number(doc.id);
  } catch {
    briefingId = null;
  }

  redirect(
    canonicalDiscoveryUrl(parsed.scope, parent.slug, padBriefingId(briefingId)),
  );
}
