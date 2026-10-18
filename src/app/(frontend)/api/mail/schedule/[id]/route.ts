import { NextRequest, NextResponse } from "next/server";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import {
  cancelScheduledEmail,
  defaultSendDeps,
  parseScheduledFor,
  rescheduleScheduledEmail,
  scheduleDb,
  sendScheduledEmail,
} from "@/lib/mail/scheduled";
import { readJson, requireMailUser } from "@/lib/mail/route-helpers";

function parseId(raw: string): number | null {
  return /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}

const GONE = "This email was already sent, is being sent, or was cancelled.";

/**
 * PATCH /api/mail/schedule/:id
 * Body: { scheduledFor } to move it (also re-queues a failed email), or
 * { action: "send-now" } to send it immediately.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const body = await readJson<{ scheduledFor?: unknown; action?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  if (body.action === "send-now") {
    const outcome = await sendScheduledEmail(ctx.payload, id, defaultSendDeps(getValidGmailToken), {
      ownerId: ctx.user.id,
      onlyDue: false,
    });
    if (outcome.status === "skipped") return NextResponse.json({ error: GONE }, { status: 409 });
    if (outcome.status === "sent") return NextResponse.json({ ok: true, messageId: outcome.messageId });
    return NextResponse.json({ error: outcome.error }, { status: 502 });
  }

  const now = new Date();
  const when = parseScheduledFor(body.scheduledFor, now);
  if (!when.ok) return NextResponse.json({ error: when.error }, { status: 400 });
  const moved = await rescheduleScheduledEmail(scheduleDb(ctx.payload), id, ctx.user.id, when.date, now);
  if (!moved) return NextResponse.json({ error: GONE }, { status: 409 });
  return NextResponse.json({ ok: true, scheduledFor: when.date.toISOString() });
}

/** DELETE /api/mail/schedule/:id: cancel an email that has not started sending. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const removed = await cancelScheduledEmail(scheduleDb(ctx.payload), id, ctx.user.id);
  if (!removed) return NextResponse.json({ error: GONE }, { status: 409 });
  return NextResponse.json({ ok: true });
}
