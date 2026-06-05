import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Brevo transactional delivery webhook for meeting-scheduler invites.
 *
 * Brevo POSTs one event per delivery state change (delivered, soft_bounce,
 * hard_bounce, blocked, spam, ...). Each invite is sent with a tag of the form
 * `msched:<schedulerId>:<attendeeToken>` so we can match the event back to the
 * exact attendee row and update its `deliveryStatus`.
 *
 * SECURITY: the Notify URL must include `?secret=<BREVO_WEBHOOK_SECRET>`.
 * Brevo can't send custom auth headers, so a URL secret is the supported guard.
 *
 * Always returns 200 for accepted-but-unmatched events so Brevo doesn't retry
 * storm; only a bad/missing secret returns 401.
 */

// Brevo `event` (snake_case in the posted payload) → our stored status.
const EVENT_STATUS_MAP: Record<string, string> = {
  delivered: "delivered",
  soft_bounce: "soft_bounce",
  hard_bounce: "hard_bounce",
  blocked: "blocked",
  spam: "spam",
  invalid_email: "invalid_email",
  deferred: "deferred",
  error: "error",
};

function extractTokenFromTags(body: Record<string, unknown>): string | null {
  // Brevo echoes tags as `tags` (array) and/or `tag` (string).
  const candidates: string[] = [];
  if (Array.isArray(body.tags)) {
    for (const t of body.tags) if (typeof t === "string") candidates.push(t);
  }
  if (typeof body.tag === "string") candidates.push(body.tag);

  for (const tag of candidates) {
    const match = /^msched:[^:]+:(.+)$/.exec(tag);
    if (match) return match[1];
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expectedSecret = process.env.BREVO_WEBHOOK_SECRET;
  if (!expectedSecret) {
    // Misconfigured server — refuse rather than accept unauthenticated events.
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event : "";
  const status = EVENT_STATUS_MAP[event];
  // Ignore engagement events (opened/clicked/sent/request/...) — we only track
  // delivery outcomes. Acknowledge so Brevo stops sending.
  if (!status) {
    return NextResponse.json({ ok: true, ignored: event || "unknown" });
  }

  const token = extractTokenFromTags(body);
  if (!token) {
    return NextResponse.json({ ok: true, matched: false, reason: "no tag" });
  }

  const payload = await getPayload({ config: await config });

  const result = await payload.find({
    collection: "meeting-schedulers" as never,
    where: { "attendees.token": { equals: token } } as never,
    limit: 1,
    overrideAccess: true,
  });
  const doc = result.docs[0] as { id: string | number; attendees?: unknown[] } | undefined;
  if (!doc || !Array.isArray(doc.attendees)) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const now = new Date().toISOString();
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim()
      : null;

  const updatedAttendees = doc.attendees.map((a) => {
    const attendee = a as Record<string, unknown>;
    if (attendee.token !== token) return attendee;
    return {
      ...attendee,
      deliveryStatus: status,
      deliveryDetail: reason ?? attendee.deliveryDetail ?? null,
      deliveryUpdatedAt: now,
    };
  });

  try {
    await payload.update({
      collection: "meeting-schedulers" as never,
      id: doc.id,
      data: { attendees: updatedAttendees } as never,
      overrideAccess: true,
    });
  } catch (err) {
    console.error("[brevo-webhook] update failed:", err);
    // Acknowledge anyway — retries would hit the same failure.
    return NextResponse.json({ ok: true, matched: true, updated: false });
  }

  return NextResponse.json({ ok: true, matched: true, updated: true, status });
}
