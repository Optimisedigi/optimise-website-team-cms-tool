import { NextRequest, NextResponse } from "next/server";
import { listFolderThreads, type InboxThreadSummary } from "@/lib/mail/gmail-mail";
import {
  MAIL_LIST_MAX_GMAIL_CALLS,
  MAIL_LIST_PAGE_SIZE,
  inboxPageToken,
  newThreadsOnly,
  parseInboxPageToken,
  parseMailFolder,
} from "@/lib/mail/folders";
import { matchMessageToClient } from "@/lib/mail/client-matching";
import { loadClientDomainIndex } from "@/lib/mail/store";
import { hiddenSendersQuery, isHiddenSender, loadHiddenSenders } from "@/lib/mail/hidden-senders";
import { inboxSearchQuery, parseSearchSenders } from "@/lib/mail/inbox-search";

/** Your own sent messages never bring a thread into the inbox list. */
const INBOX_EXCLUDE_OWN_MAIL = "-in:sent";
import { loadClientSenders } from "@/lib/mail/client-senders";
import { loadSenderClients } from "@/lib/mail/sender-clients";
import { gmailErrorResponse, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * GET /api/mail/inbox?folder=inbox|sent|drafts&pageToken=&q=
 *
 * Thread list for the Mail view, read live from Gmail (metadata only).
 * `folder` defaults to the inbox. Each row carries a deterministic client
 * match from headers (with the user's own sender → client choices). No model calls.
 *
 * The inbox always lists unread threads first: it pages through the unread
 * threads (`is:unread`), and once they run out the same response continues
 * with the read ones (`-is:unread`), so an old unread email is never stuck
 * below newer read mail on a later page. The page token says which part the
 * next page is in (see parseInboxPageToken).
 *
 * Every page holds MAIL_LIST_PAGE_SIZE threads (unless the folder runs out):
 * Gmail pages by message and a search can return one thread several times,
 * so short pages are topped up with further Gmail pages (bounded).
 *
 * The user's hidden senders are excluded from the inbox via the Gmail search
 * itself, so paging and search keep working (view-only; nothing changes in
 * Gmail). Sent and Drafts are all from the user, so the filter is not applied
 * there. The starred client senders (dashboard panel filter) and the sender →
 * client choices are returned too.
 *
 * Inbox search matches the sender's address as well as the subject (see
 * inboxSearchQuery), plus the addresses in `senders` (people whose name or
 * address starts with the typed text, matched by the Mail page, since Gmail
 * only matches whole words); Sent and Drafts pass the search to Gmail as typed.
 *
 * The inbox lists mail from other people only: its Gmail search leaves out
 * your own sent messages (`-in:sent`, matched per message, so a thread you
 * replied to still lists through the incoming mail), and each row shows the
 * latest incoming message (see listFolderThreads). Your messages stay in Sent.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const token = await requireGmailToken(ctx.user.id, req);
  if (token instanceof NextResponse) return token;

  const folderParam = req.nextUrl.searchParams.get("folder");
  const folder = folderParam === null ? "inbox" : parseMailFolder(folderParam);
  if (!folder) return NextResponse.json({ error: "Invalid folder." }, { status: 400 });
  const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;
  const search = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const searchSenders = parseSearchSenders(req.nextUrl.searchParams.get("senders"));
  const [hiddenSenders, clientSenders, senderClients] = await Promise.all([
    loadHiddenSenders(ctx.payload, ctx.user.id),
    loadClientSenders(ctx.payload, ctx.user.id),
    loadSenderClients(ctx.payload, ctx.user.id),
  ]);
  const join = (...parts: string[]) => parts.filter(Boolean).join(" ") || undefined;

  try {
    const indexLoad = loadClientDomainIndex(ctx.payload, [token.email, token.userEmail].filter(Boolean), { userId: ctx.user.id });
    // Awaited below; this only stops a Gmail failure first leaving it unhandled.
    indexLoad.catch(() => undefined);
    const accessToken = token.accessToken;
    const threads: InboxThreadSummary[] = [];
    const seen = new Set<string>();
    let gmailCalls = 0;
    // Adds threads from `q` (from `startToken`) until the page is full, the
    // query runs out (`token` null) or the Gmail call budget is spent.
    const fill = async (q: string | undefined, startToken: string | undefined): Promise<{ token: string | null; exhausted: boolean }> => {
      let cursor = startToken;
      while (threads.length < MAIL_LIST_PAGE_SIZE && gmailCalls < MAIL_LIST_MAX_GMAIL_CALLS) {
        gmailCalls++;
        const page = await listFolderThreads(accessToken, folder, {
          pageToken: cursor,
          q,
          maxResults: Math.min(50, MAIL_LIST_PAGE_SIZE - threads.length),
        });
        threads.push(...newThreadsOnly(page.threads, seen));
        if (!page.nextPageToken) return { token: null, exhausted: true };
        cursor = page.nextPageToken;
      }
      return { token: cursor ?? null, exhausted: false };
    };
    let nextPageToken: string | null;
    if (folder === "inbox") {
      const base = join(inboxSearchQuery(search, searchSenders), hiddenSendersQuery(hiddenSenders), INBOX_EXCLUDE_OWN_MAIL) ?? "";
      const readQuery = join(base, "-is:unread");
      const page = parseInboxPageToken(pageToken);
      if (page.part === "unread") {
        const unread = await fill(join(base, "is:unread"), page.token);
        if (!unread.exhausted) {
          nextPageToken = inboxPageToken("unread", unread.token);
        } else if (threads.length < MAIL_LIST_PAGE_SIZE && gmailCalls < MAIL_LIST_MAX_GMAIL_CALLS) {
          // Unread threads ran out: carry on with the read ones (from the start) in this same page.
          const read = await fill(readQuery, undefined);
          nextPageToken = read.exhausted ? null : inboxPageToken("read", read.token);
        } else {
          nextPageToken = inboxPageToken("read", null);
        }
      } else {
        const read = await fill(readQuery, page.token);
        nextPageToken = read.exhausted ? null : inboxPageToken("read", read.token);
      }
    } else {
      const result = await fill(join(search), pageToken);
      nextPageToken = result.exhausted ? null : result.token;
    }
    const index = await indexLoad;
    return NextResponse.json({
      account: token.email,
      folder,
      hiddenSenders,
      clientSenders,
      senderClients,
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
