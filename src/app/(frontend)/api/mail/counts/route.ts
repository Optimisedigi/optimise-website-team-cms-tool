import { NextRequest, NextResponse } from "next/server";
import { getFolderCounts } from "@/lib/mail/gmail-mail";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * GET /api/mail/counts
 * Badge numbers for the Mail tabs: unread Inbox threads and Drafts. Sent is
 * not counted. Two Gmail label lookups; no message content is read.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;
  try {
    return NextResponse.json(await getFolderCounts(token.accessToken));
  } catch (err) {
    return gmailErrorResponse(err, "Could not load the mail counts.");
  }
}
