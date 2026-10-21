import { NextRequest, NextResponse } from "next/server";
import { modifyThreadLabels } from "@/lib/mail/gmail-mail";
import { gmailErrorResponse, parseGmailId, readJson, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * POST /api/mail/modify
 * Body: { threadId, action: "archive" | "read" | "unread" }
 *
 * One thread at a time (no bulk actions). Archive only removes the INBOX
 * label; nothing is deleted. Requires the gmail.modify scope.
 */
const CHANGES = {
  archive: { remove: ["INBOX"] },
  read: { remove: ["UNREAD"] },
  unread: { add: ["UNREAD"] },
} as const;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson<{ threadId?: unknown; action?: unknown }>(req);
  const threadId = parseGmailId(body?.threadId);
  const action = typeof body?.action === "string" && body.action in CHANGES ? (body.action as keyof typeof CHANGES) : null;
  if (!threadId || !action) {
    return NextResponse.json({ error: "threadId and action (archive, read, unread) are required." }, { status: 400 });
  }
  const token = await requireGmailToken(ctx.user.id, req);
  if (token instanceof NextResponse) return token;

  try {
    const change = CHANGES[action];
    await modifyThreadLabels(token.accessToken, threadId, {
      add: "add" in change ? [...change.add] : [],
      remove: "remove" in change ? [...change.remove] : [],
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return gmailErrorResponse(err, "Gmail could not update that thread.");
  }
}
