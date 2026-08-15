import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  LANDING_SCHEMA_VERSION,
  corsHeaders,
  getSigningSecret,
  isContentFieldKey,
  isValidPropertyKey,
  jsonError,
  resolveAllowedOrigin,
  signAssignmentToken,
} from "@/lib/landing-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/landing/v1/manifest?property_key=...&route=...
 *
 * Serves the experiment definition, allowlisted copy, and a signed assignment
 * token to a client landing page.
 *
 * Auth model: `property_key` is public and identifies only. The gate is the
 * request Origin matching the property's allowlist, so a scraped key from page
 * source cannot be replayed from an attacker-controlled site.
 *
 * The landing SDK treats any failure here as "use local defaults", so every
 * error path returns quickly rather than degrading page render.
 */

interface VariantRow {
  variantId?: string | null;
  label?: string | null;
  weight?: number | null;
  contentProfileId?: string | null;
}

interface ContentProfileRow {
  profileId?: string | null;
  fields?: { key?: string | null; value?: string | null }[] | null;
}

export async function OPTIONS(req: NextRequest) {
  // Checked before anything touches the database. An unconfigured deployment
  // cannot serve this route at all, so opening a connection first only risks
  // blocking on a database that may be locked or unreachable, and a preflight
  // that hangs silently kills every sendBeacon the page tries to send.
  if (!getSigningSecret()) return new NextResponse(null, { status: 204 });

  const propertyKey = req.nextUrl.searchParams.get("property_key");
  if (!isValidPropertyKey(propertyKey)) return new NextResponse(null, { status: 204 });

  const property = await findProperty(propertyKey);
  if (!property) return new NextResponse(null, { status: 204 });

  const origin = resolveAllowedOrigin(req, property.origins);
  if (!origin) return new NextResponse(null, { status: 204 });

  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest) {
  const secret = getSigningSecret();
  if (!secret) {
    // Fail closed: without a signing secret we would be minting forgeable tokens.
    console.error("[landing/manifest] LANDING_TOKEN_SECRET missing or too short");
    return jsonError(503, "Landing service not configured");
  }

  const propertyKey = req.nextUrl.searchParams.get("property_key");
  if (!isValidPropertyKey(propertyKey)) return jsonError(400, "Invalid property_key");

  const property = await findProperty(propertyKey);
  if (!property) return jsonError(404, "Unknown property");

  const origin = resolveAllowedOrigin(req, property.origins);
  if (!origin) return jsonError(403, "Origin not allowed");

  const headers = corsHeaders(origin);

  const experiment = property.experiment;
  if (!experiment || experiment.status !== "running") {
    // No live experiment: the page keeps its built-in default variant and copy.
    return NextResponse.json(
      { schema_version: LANDING_SCHEMA_VERSION, experiment: null },
      { headers }
    );
  }

  const variants = (Array.isArray(experiment.variants) ? experiment.variants : [])
    .map((row: VariantRow) => ({
      id: typeof row.variantId === "string" ? row.variantId : "",
      weight: Number(row.weight ?? 0),
      contentProfileId:
        typeof row.contentProfileId === "string" && row.contentProfileId ? row.contentProfileId : "default",
    }))
    .filter((row) => /^[a-z0-9_-]{1,40}$/i.test(row.id) && Number.isFinite(row.weight) && row.weight >= 0);

  if (variants.length < 2) {
    return NextResponse.json(
      { schema_version: LANDING_SCHEMA_VERSION, experiment: null },
      { headers }
    );
  }

  const allocationVersion = String(experiment.allocationVersion ?? "1");
  const experimentId = String(experiment.experimentId ?? "");

  // Every profile is served, not just the default, and the SDK applies the one
  // belonging to the variant it assigned. That is what makes the assignment
  // real: if only the default were sent, each visitor would be labelled with a
  // variant while being shown identical copy, and the comparison would be
  // measuring nothing.
  //
  // Assignment still happens locally and deterministically, so the manifest is
  // identical for every visitor and stays edge-cacheable.
  const profiles = Array.isArray(experiment.contentProfiles) ? experiment.contentProfiles : [];

  function readFields(row: ContentProfileRow | null): Record<string, string> {
    const fields: Record<string, string> = {};
    if (!row || !Array.isArray(row.fields)) return fields;
    for (const entry of row.fields) {
      if (!isContentFieldKey(entry?.key)) continue;
      if (typeof entry?.value !== "string") continue;
      fields[entry.key] = entry.value.slice(0, 300);
    }
    return fields;
  }

  const defaultProfile =
    profiles.find((row: ContentProfileRow) => row.profileId === "default") ?? profiles[0] ?? null;
  const fields = readFields(defaultProfile);

  const contentProfiles: Record<string, { fields: Record<string, string> }> = {};
  for (const row of profiles) {
    const id = typeof row?.profileId === "string" ? row.profileId : "";
    if (!isContentFieldKey(id)) continue;
    contentProfiles[id] = { fields: readFields(row) };
  }

  const assignmentToken = signAssignmentToken(
    { propertyKey, experimentId, allocationVersion, issuedAt: Date.now() },
    secret
  );

  return NextResponse.json(
    {
      schema_version: LANDING_SCHEMA_VERSION,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      experiment: {
        id: experimentId,
        allocation_version: allocationVersion,
        variants: variants.map((row) => ({
          id: row.id,
          weight: row.weight,
          content_profile_id: row.contentProfileId,
        })),
      },
      // Kept for clients that only understand a single profile.
      content_profile: {
        id: typeof defaultProfile?.profileId === "string" ? defaultProfile.profileId : "default",
        fields,
      },
      content_profiles: contentProfiles,
      assignment_token: assignmentToken,
    },
    { headers }
  );
}

async function findProperty(propertyKey: string) {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "landing-properties",
    where: { propertyKey: { equals: propertyKey }, status: { equals: "active" } },
    depth: 1,
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  const origins = (Array.isArray(doc.allowedOrigins) ? doc.allowedOrigins : [])
    .map((row: { origin?: string | null }) => (typeof row?.origin === "string" ? row.origin.trim() : ""))
    .filter(Boolean);

  const experiment =
    doc.activeExperiment && typeof doc.activeExperiment === "object" ? doc.activeExperiment : null;

  return { doc, origins, experiment: experiment as Record<string, unknown> | null };
}
