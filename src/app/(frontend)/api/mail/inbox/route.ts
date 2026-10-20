import { NextRequest, NextResponse } from "next/server";
import { listFolderThreads } from "@/lib/mail/gmail-mail";
import { parseMailFolder } from "@/lib/mail/folders";
import { matchMessageToClient } from "@/lib/mail/client-matching";
import { loadClientDomainIndex } from "@/lib/mail/store";
import { hiddenSendersQuery, isHiddenSender, loadHiddenSenders } from "@/lib/mail/hidden-senders";
import { loadClientSenders } from "@/lib/mail/client-senders";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * GET /api/mail/inbox?folder=inbox|sent|drafts&pageToken=&q=
 *
 * Thread list for the Mail view, read live from Gmail (metadata only).
 * `folder` defaults to the inbox. Each row carries a deterministic client
 * match from headers. No model calls.
 * The user's hidden senders are excluded from the inbox via the Gmail search
 * itself, so paging and search keep working (view-only; nothing changes in
 * Gmail). Sent and Drafts are all from the user, so the filter is not applied
 * there. The starred client senders (dashboard panel filter) are returned too.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;

  const folderParam = req.nextUrl.searchParams.get("folder");
  const folder = folderParam === null ? "inbox" : parseMailFolder(folderParam);
  if (!folder) return NextResponse.json({ error: "Invalid folder." }, { status: 400 });
  const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
  const search = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const [hiddenSenders, clientSenders] = await Promise.all([
    loadHiddenSenders(ctx.payload, ctx.user.id),
    loadClientSenders(ctx.payload, ctx.user.id),
  ]);
  const q = [search, folder === "inbox" ? hiddenSendersQuery(hiddenSenders) : ""].filter(Boolean).join(" ") || undefined;

  try {
    const [{ threads, nextPageToken }, index] = await Promise.all([
      listFolderThreads(token.accessToken, folder, { pageToken, q }),
      loadClientDomainIndex(ctx.payload, [token.email, token.userEmail].filter(Boolean)),
    ]);
    return NextResponse.json({
      account: token.email,
      folder,
      hiddenSenders,
      clientSenders,
      nextPageToken,
      // A thread with older mail from others still matches the search, so drop
      // rows whose shown (latest) message is from a hidden sender.
      threads: threads
        .filter((thread) => folder !== "inbox" || !isHiddenSender(thread.from, hiddenSenders))
        .map((thread) => {
          const match = matchMessageToClient(index, thread);
          return { ...thread, client: match ? { id: match.clientId, name: match.clientName } : null };
        }),
    });
  } catch (err) {
    return gmailErrorResponse(err, `Could not load ${folder === "inbox" ? "the inbox" : folder} from Gmail.`);
  }
}
