import { NextRequest, NextResponse } from "next/server";
import { listInboxThreads } from "@/lib/mail/gmail-mail";
import { matchMessageToClient } from "@/lib/mail/client-matching";
import { loadClientDomainIndex } from "@/lib/mail/store";
import { hiddenSendersQuery, loadHiddenSenders } from "@/lib/mail/hidden-senders";
import { loadClientSenders } from "@/lib/mail/client-senders";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * GET /api/mail/inbox?pageToken=&q=
 *
 * Inbox thread list for the Mail view, read live from Gmail (metadata only).
 * Each row carries a deterministic client match from headers. No model calls.
 * The user's hidden senders are excluded via the Gmail search itself, so
 * paging and search keep working (view-only; nothing changes in Gmail).
 * The starred client senders (dashboard panel filter) are returned too.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;

  const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
  const search = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const [hiddenSenders, clientSenders] = await Promise.all([
    loadHiddenSenders(ctx.payload, ctx.user.id),
    loadClientSenders(ctx.payload, ctx.user.id),
  ]);
  const q = [search, hiddenSendersQuery(hiddenSenders)].filter(Boolean).join(" ") || undefined;

  try {
    const [{ threads, nextPageToken }, index] = await Promise.all([
      listInboxThreads(token.accessToken, { pageToken, q }),
      loadClientDomainIndex(ctx.payload, [token.email, token.userEmail].filter(Boolean)),
    ]);
    return NextResponse.json({
      account: token.email,
      hiddenSenders,
      clientSenders,
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
