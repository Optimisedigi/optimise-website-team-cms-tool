import { NextRequest, NextResponse } from "next/server";
import { parseMailComposeContent } from "@/lib/mail/compose-content";
import { deleteDraft } from "@/lib/mail/gmail-mail";
import {
  countScheduledEmails,
  createScheduledEmail,
  listScheduledEmails,
  parseScheduledFor,
  scheduleDb,
} from "@/lib/mail/scheduled";
import { parseGmailId, readJson, requireMailUser } from "@/lib/mail/route-helpers";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";

const HEADER_MAX = 2000;
const MAX_QUEUED = 100;

function cleanHeader(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim().slice(0, HEADER_MAX) : "";
}

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
  const body = await readJson<{
    to?: unknown;
    cc?: unknown;
    subject?: unknown;
    html?: unknown;
    inlineImages?: unknown;
    attachments?: unknown;
    replyToMessageId?: unknown;
    draftId?: unknown;
    scheduledFor?: unknown;
  }>(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const when = parseScheduledFor(body.scheduledFor, new Date());
  if (!when.ok) return NextResponse.json({ error: when.error }, { status: 400 });

  const content = parseMailComposeContent({ html: body.html, inlineImages: body.inlineImages, attachments: body.attachments });
  if (!content.ok) return NextResponse.json({ error: content.error }, { status: 400 });

  const hasReply = typeof body.replyToMessageId === "string" && body.replyToMessageId !== "";
  const replyToMessageId = hasReply ? parseGmailId(body.replyToMessageId) : null;
  if (hasReply && !replyToMessageId) return NextResponse.json({ error: "Invalid reply message id." }, { status: 400 });
  const hasDraft = typeof body.draftId === "string" && body.draftId !== "";
  const draftId = hasDraft ? parseGmailId(body.draftId) : null;
  if (hasDraft && !draftId) return NextResponse.json({ error: "Invalid draft id." }, { status: 400 });

  const to = cleanHeader(body.to);
  if (!replyToMessageId && !/@/.test(to)) return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });

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

  const id = await createScheduledEmail(db, {
    ownerId: ctx.user.id,
    to,
    cc: cleanHeader(body.cc),
    subject: cleanHeader(body.subject),
    replyToMessageId,
    scheduledFor: when.date,
    content: {
      html: content.value.html,
      inlineImages: body.inlineImages ?? [],
      attachments: body.attachments ?? [],
    },
  });

  let draftNote: string | null = null;
  if (draftId) {
    try {
      await deleteDraft(token.accessToken, draftId);
    } catch {
      draftNote = "Scheduled, but the old Gmail draft could not be removed. Delete it from Drafts.";
    }
  }
  return NextResponse.json({ id, scheduledFor: when.date.toISOString(), draftNote });
}
