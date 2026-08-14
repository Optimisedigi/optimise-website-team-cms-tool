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
  verifyAssignmentToken,
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

export async function OPTIONS(req: NextRequest) {
  const body = req.nextUrl.searchParams.get("property_key");
  if (!isValidPropertyKey(body)) return new NextResponse(null, { status: 204 });
  const property = await findProperty(body);
  if (!property) return new NextResponse(null, { status: 204 });
  const origin = resolveAllowedOrigin(req, property.origins);
  if (!origin) return new NextResponse(null, { status: 204 });
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

  // Experiment context comes from the signed token, never from the event body,
  // so a caller cannot attribute their traffic to an arbitrary variant.
  const assignment = verifyAssignmentToken(batch.assignment_token, secret, propertyKey);

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
          variantId: assignment ? boundedString(event.variant_id, 40) : undefined,
          allocationVersion: assignment?.allocationVersion,
          contentProfileId: boundedString(event.content_profile_id, 80),
          route: boundedString(event.route, 200),
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

async function findProperty(propertyKey: string) {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "landing-properties",
    where: { propertyKey: { equals: propertyKey }, status: { equals: "active" } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;

  const origins = (Array.isArray(doc.allowedOrigins) ? doc.allowedOrigins : [])
    .map((row: { origin?: string | null }) => (typeof row?.origin === "string" ? row.origin.trim() : ""))
    .filter(Boolean);

  const clientId = typeof doc.client === "object" && doc.client ? doc.client.id : doc.client;

  return { id: doc.id, clientId, origins };
}
