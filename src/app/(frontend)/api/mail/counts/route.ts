import { NextRequest, NextResponse } from "next/server";
import { getFolderCounts } from "@/lib/mail/gmail-mail";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";
import { countScheduledEmails, scheduleDb } from "@/lib/mail/scheduled";

/**
 * GET /api/mail/counts
 * Badge numbers for the Mail tabs: unread Inbox threads, Drafts, and emails
 * waiting in the Scheduled queue. Sent is not counted. Two Gmail label
 * lookups and one count query; no message content is read.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;
  try {
    const [folders, scheduled] = await Promise.all([
      getFolderCounts(token.accessToken),
      countScheduledEmails(scheduleDb(ctx.payload), ctx.user.id),
    ]);
    return NextResponse.json({ ...folders, scheduled });
  } catch (err) {
    return gmailErrorResponse(err, "Could not load the mail counts.");
  }
}
