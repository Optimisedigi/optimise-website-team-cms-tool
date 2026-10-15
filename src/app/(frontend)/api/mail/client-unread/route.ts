import { NextRequest, NextResponse } from "next/server";
import { listInboxThreads } from "@/lib/mail/gmail-mail";
import { clientUnreadQuery, loadClientSenders, unreadClientThreads } from "@/lib/mail/client-senders";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * GET /api/mail/client-unread
 *
 * Powers the dashboard's "Unread client emails" panel. Reads the signed-in
 * user's own Gmail inbox live (metadata only) and returns unread threads whose
 * sender is one of the client senders they starred in Mail. Non-client and
 * read mail is never returned. With no client senders, Gmail is not queried.
 * No model calls, nothing stored, nothing changed in Gmail.
 */

const GMAIL_PAGE_SIZE = 25;
const MAX_EMAILS_RETURNED = 8;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;

  const clientSenders = await loadClientSenders(ctx.payload, ctx.user.id);
  const q = clientUnreadQuery(clientSenders);
  if (!q) {
    return NextResponse.json({ account: token.email, clientSenderCount: 0, emails: [], more: false });
  }

  try {
    const { threads, nextPageToken } = await listInboxThreads(token.accessToken, { q, maxResults: GMAIL_PAGE_SIZE });
    const matches = unreadClientThreads(threads, clientSenders);
    return NextResponse.json({
      account: token.email,
      clientSenderCount: clientSenders.length,
      more: matches.length > MAX_EMAILS_RETURNED || Boolean(nextPageToken),
      emails: matches.slice(0, MAX_EMAILS_RETURNED).map((thread) => ({
        threadId: thread.threadId,
        from: thread.from,
        subject: thread.subject,
        date: thread.date,
        messageCount: thread.messageCount,
      })),
    });
  } catch (err) {
    return gmailErrorResponse(err, "Could not load unread client emails from Gmail.");
  }
}
