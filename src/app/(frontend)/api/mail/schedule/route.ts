import { NextRequest, NextResponse } from "next/server";
import { parseScheduleRequest, type ScheduleRequestBody } from "@/lib/mail/schedule-request";
import { deleteDraft } from "@/lib/mail/gmail-mail";
import {
  countScheduledEmails,
  createScheduledEmail,
  listScheduledEmails,
  scheduleDb,
} from "@/lib/mail/scheduled";
import { readJson, requireMailUser } from "@/lib/mail/route-helpers";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";

const MAX_QUEUED = 100;

/** GET /api/mail/schedule: the user's queued emails, soonest first (no bodies). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const items = await listScheduledEmails(scheduleDb(ctx.payload), ctx.user.id);
  return NextResponse.json({ items });
}

/**
 * POST /api/mail/schedule
 * Body: the /api/mail/send body plus { scheduledFor: ISO time }.
 *
 * Validates exactly like Send, then queues the email; nothing is sent now.
 * The cron (/api/mail/schedule/tick) sends it at `scheduledFor`. When the
 * email was opened from a Gmail draft, that draft is removed (as Gmail does
 * for scheduled mail); the email itself lives in the queue.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson<ScheduleRequestBody>(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const parsed = parseScheduleRequest(body, new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { to, cc, subject, replyToMessageId, draftId, scheduledFor, content } = parsed.value;
  if (!scheduledFor) return NextResponse.json({ error: "Choose a time to send." }, { status: 400 });

  const token = await getValidGmailToken(ctx.user.id);
  if (!token.ok) {
    return NextResponse.json(
      { error: "gmail-not-connected", reason: token.reason, connectUrl: "/api/gmail/connect" },
      { status: 403 },
    );
  }

  const db = scheduleDb(ctx.payload);
  if ((await countScheduledEmails(db, ctx.user.id)) >= MAX_QUEUED) {
    return NextResponse.json({ error: `You can have up to ${MAX_QUEUED} scheduled emails at once.` }, { status: 400 });
  }

  const id = await createScheduledEmail(db, { ownerId: ctx.user.id, to, cc, subject, replyToMessageId, scheduledFor, content });

  let draftNote: string | null = null;
  if (draftId) {
    try {
      await deleteDraft(token.accessToken, draftId);
    } catch {
      draftNote = "Scheduled, but the old Gmail draft could not be removed. Delete it from Drafts.";
    }
  }
  return NextResponse.json({ id, scheduledFor: scheduledFor.toISOString(), draftNote });
}
