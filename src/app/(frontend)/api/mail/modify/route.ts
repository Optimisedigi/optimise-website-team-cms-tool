import { NextRequest, NextResponse } from "next/server";
import { mapLimited, modifyThreadLabels } from "@/lib/mail/gmail-mail";
import { gmailErrorResponse, parseGmailId, readJson, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * POST /api/mail/modify
 * Body: { threadId, action: "archive" | "read" | "unread" }
 *    or { threadIds: [...up to 50], action: "read" } (inbox multi-select "Mark as read")
 *
 * Archive only removes the INBOX label; nothing is deleted. Bulk is limited to
 * marking read. Requires the gmail.modify scope.
 */
const CHANGES = {
  archive: { remove: ["INBOX"] },
  read: { remove: ["UNREAD"] },
  unread: { add: ["UNREAD"] },
} as const;

const MAX_BULK_THREADS = 50;

/** 1 to MAX_BULK_THREADS valid Gmail ids, without repeats; null otherwise. */
function cleanThreadIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BULK_THREADS) return null;
  const ids = value.map(parseGmailId);
  if (ids.some((id) => id === null)) return null;
  return [...new Set(ids as string[])];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson<{ threadId?: unknown; threadIds?: unknown; action?: unknown }>(req);
  const action = typeof body?.action === "string" && body.action in CHANGES ? (body.action as keyof typeof CHANGES) : null;
  const bulk = body?.threadIds !== undefined;
  const threadIds = bulk ? cleanThreadIds(body?.threadIds) : null;
  const threadId = bulk ? null : parseGmailId(body?.threadId);
  if (bulk && (!threadIds || action !== "read")) {
    return NextResponse.json({ error: `Send 1 to ${MAX_BULK_THREADS} thread ids with action "read".` }, { status: 400 });
  }
  if (!bulk && (!threadId || !action)) {
    return NextResponse.json({ error: "threadId and action (archive, read, unread) are required." }, { status: 400 });
  }
  const token = await requireGmailToken(ctx.user.id, req);
  if (token instanceof NextResponse) return token;

  try {
    const change = CHANGES[action as keyof typeof CHANGES];
    const labels = {
      add: "add" in change ? [...change.add] : [],
      remove: "remove" in change ? [...change.remove] : [],
    };
    // Gmail has no batch call for threads: a few at a time stays under its rate limit.
    await mapLimited(threadIds ?? [threadId as string], 5, (id) => modifyThreadLabels(token.accessToken, id, labels));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return gmailErrorResponse(err, bulk ? "Gmail could not mark those emails read." : "Gmail could not update that thread.");
  }
}
