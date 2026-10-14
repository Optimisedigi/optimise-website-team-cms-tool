import { NextRequest, NextResponse } from "next/server";
import { listInboxThreads } from "@/lib/mail/gmail-mail";
import { matchMessageToClient } from "@/lib/mail/client-matching";
import { loadClientDomainIndex } from "@/lib/mail/store";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * GET /api/mail/inbox?pageToken=&q=
 *
 * Inbox thread list for the Mail view, read live from Gmail (metadata only).
 * Each row carries a deterministic client match from headers. No model calls.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;

  const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200) || undefined;

  try {
    const [{ threads, nextPageToken }, index] = await Promise.all([
      listInboxThreads(token.accessToken, { pageToken, q }),
      loadClientDomainIndex(ctx.payload, [token.email, token.userEmail].filter(Boolean)),
    ]);
    return NextResponse.json({
      account: token.email,
      nextPageToken,
      threads: threads.map((thread) => {
        const match = matchMessageToClient(index, thread);
        return { ...thread, client: match ? { id: match.clientId, name: match.clientName } : null };
      }),
    });
  } catch (err) {
    return gmailErrorResponse(err, "Could not load the inbox from Gmail.");
  }
}
