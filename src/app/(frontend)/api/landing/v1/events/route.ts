import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  LANDING_EVENT_TYPES,
  LANDING_SCHEMA_VERSION,
  MAX_EVENTS_PER_BATCH,
  boundedString,
  corsHeaders,
  getSigningSecret,
  isValidPropertyKey,
  jsonError,
  parseEventTimestamp,
  readBoundedJson,
  resolveAllowedOrigin,
  sanitiseAttribution,
  sanitiseProperties,
} from "@/lib/landing-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/landing/v1/events
 *
 * Ingests consent-gated landing behaviour events.
 *
 * Every field is re-derived or bounded here rather than trusted: the batch's
 * property comes from a server lookup, the client/tenant comes from that
 * property record (never the payload), and experiment context is taken from the
 * HMAC assignment token this server minted. A landing page therefore cannot
 * write events into another client's tenant or forge an experiment result.
 *
 * Not stored: raw IP, user agent, form values, free text.
 */

const MAX_EVENT_TYPES = new Set<string>(LANDING_EVENT_TYPES);

/**
 * CORS preflight for the event POST.
 *
 * A preflight carries no body and no query string, so the property cannot be
 * identified here. Answering it by property key meant returning no CORS headers,
 * which made the browser block every real POST while sendBeacon still reported
 * success — events disappeared with nothing logged on either side.
 *
 * The origin is instead checked against every active property. That is the same
 * allowlist the POST itself enforces, so this reveals nothing extra: it only
 * confirms an origin that is already permitted to send.
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return new NextResponse(null, { status: 204 });

  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "landing-properties",
    where: { status: { equals: "active" }, "allowedOrigins.origin": { equals: origin } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });

  if (!result.docs.length) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const secret = getSigningSecret();
  if (!secret) {
    console.error("[landing/events] LANDING_TOKEN_SECRET missing or too short");
    return jsonError(503, "Landing service not configured");
  }

  const body = await readBoundedJson(req);
  if (!body || typeof body !== "object") return jsonError(400, "Invalid payload");

  const batch = body as Record<string, unknown>;
  if (batch.schema_version !== LANDING_SCHEMA_VERSION) return jsonError(400, "Unsupported schema_version");

  const propertyKey = batch.property_key;
  if (!isValidPropertyKey(propertyKey)) return jsonError(400, "Invalid property_key");

  const property = await findProperty(propertyKey);
  if (!property) return jsonError(404, "Unknown property");

  // Origin allowlist is the actual authorisation gate; the public key is not.
  const origin = resolveAllowedOrigin(req, property.origins);
  if (!origin) return jsonError(403, "Origin not allowed");
  const headers = corsHeaders(origin);

  const events = batch.events;
  if (!Array.isArray(events) || events.length === 0) return jsonError(400, "No events");
  if (events.length > MAX_EVENTS_PER_BATCH) return jsonError(413, "Batch too large");

  // Experiment context is read from the property's own experiment record, never
  // from the request. A caller therefore cannot invent an experiment or claim an
  // allocation version, and the definition cannot drift out of date the way a
  // token minted at build time would.
  //
  // The variant is the one thing only the client knows, because assignment
  // happens in the browser. It is accepted, but only when it names a variant
  // this experiment actually configures, so unrecognised labels are dropped
  // instead of quietly creating a phantom arm in the results.
  const assignment = property.experiment;

  const payload = await getPayload({ config });
  const now = Date.now();
  const receivedAt = new Date(now).toISOString();

  let accepted = 0;
  let rejected = 0;

  for (const raw of events) {
    if (!raw || typeof raw !== "object") {
      rejected += 1;
      continue;
    }
    const event = raw as Record<string, unknown>;

    const eventId = boundedString(event.event_id, 80);
    const eventType = typeof event.type === "string" ? event.type : "";
    const occurredAt = parseEventTimestamp(event.timestamp, now);
    const sessionId = boundedString(event.session_id, 80);
    const pageViewId = boundedString(event.page_view_id, 80);

    if (!eventId || !MAX_EVENT_TYPES.has(eventType) || !occurredAt || !sessionId || !pageViewId) {
      rejected += 1;
      continue;
    }

    try {
      // event_id is unique in the collection, so a retried batch is idempotent:
      // the duplicate create throws and is counted as accepted, not an error.
      await payload.create({
        collection: "landing-events",
        overrideAccess: true,
        data: {
          eventId,
          property: property.id,
          client: property.clientId,
          eventType: eventType as (typeof LANDING_EVENT_TYPES)[number],
          occurredAt: occurredAt.toISOString(),
          receivedAt,
          sessionId,
          pageViewId,
          visitorId: boundedString(event.visitor_id, 80),
          experimentId: assignment?.experimentId,
          variantId: variantFor(assignment, event.variant_id),
          allocationVersion: assignment?.allocationVersion,
          contentProfileId: boundedString(event.content_profile_id, 80),
          route: boundedString(event.route, 200),
          pageId: boundedString(event.page_id, 60),
          // Uppercased so "au" and "AU" cannot appear as two separate markets.
          market: boundedString(event.market, 12)?.toUpperCase(),
          referrerClass: boundedString(event.referrer_class, 40),
          deviceClass: boundedString(event.device_class, 40),
          attribution: sanitiseAttribution(event.attribution),
          properties: sanitiseProperties(event.properties),
        },
      });
      accepted += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique|duplicate/i.test(message)) {
        accepted += 1;
      } else {
        console.error("[landing/events] write failed:", message.slice(0, 200));
        rejected += 1;
      }
    }
  }

  return NextResponse.json({ accepted, rejected }, { status: 202, headers });
}

interface ExperimentContext {
  experimentId: string;
  allocationVersion: string;
  variantIds: string[];
}

/**
 * Accept a client-reported variant only when the experiment configures it.
 * An unrecognised label would otherwise appear in the dashboard as a third arm
 * that nobody ran.
 */
function variantFor(assignment: ExperimentContext | null, raw: unknown): string | undefined {
  if (!assignment) return undefined;
  const variant = boundedString(raw, 40);
  if (!variant || !assignment.variantIds.includes(variant)) return undefined;
  return variant;
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

  const clientId = typeof doc.client === "object" && doc.client ? doc.client.id : doc.client;

  const raw =
    doc.activeExperiment && typeof doc.activeExperiment === "object" ? doc.activeExperiment : null;
  const experiment: ExperimentContext | null =
    raw && raw.status === "running"
      ? {
          experimentId: String(raw.experimentId ?? ""),
          allocationVersion: String(raw.allocationVersion ?? "1"),
          variantIds: (Array.isArray(raw.variants) ? raw.variants : [])
            .map((row: { variantId?: string | null }) =>
              typeof row?.variantId === "string" ? row.variantId : ""
            )
            .filter(Boolean),
        }
      : null;

  return { id: doc.id, clientId, origins, experiment };
}
