import { NextRequest, NextResponse } from "next/server";
import { batchModifyMessages } from "@/lib/mail/gmail-mail";
import { gmailErrorResponse, parseGmailId, readJson, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/** Messages per request; the triage panel sends bigger selections in several requests. */
const MAX_TRIAGE_APPLY_IDS = 1000;

const CHANGES = {
  archive: { remove: ["INBOX"] },
  read: { remove: ["UNREAD"] },
} as const;

/**
 * POST /api/mail/triage/apply
 * Body: { messageIds: string[], action: "archive" | "read" }
 *
 * Applies the user's triage choice to the messages they ticked. Archive only
 * removes the INBOX label; nothing is deleted. Needs the gmail.modify scope.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson<{ messageIds?: unknown; action?: unknown }>(req);
  const action = body?.action === "archive" || body?.action === "read" ? body.action : null;
  const raw = Array.isArray(body?.messageIds) ? body.messageIds : null;
  const messageIds = raw ? [...new Set(raw.map(parseGmailId))] : [];
  if (!action || !raw || raw.length === 0 || messageIds.some((id) => id === null)) {
    return NextResponse.json({ error: "messageIds (Gmail ids) and action (archive or read) are required." }, { status: 400 });
  }
  if (messageIds.length > MAX_TRIAGE_APPLY_IDS) {
    return NextResponse.json({ error: `At most ${MAX_TRIAGE_APPLY_IDS} emails per request.` }, { status: 400 });
  }
  const token = await requireGmailToken(ctx.user.id, req);
  if (token instanceof NextResponse) return token;

  try {
    await batchModifyMessages(token.accessToken, messageIds.filter((id): id is string => id !== null), { remove: [...CHANGES[action].remove] });
    return NextResponse.json({ ok: true, count: messageIds.length });
  } catch (err) {
    return gmailErrorResponse(err, "Gmail could not update those emails.");
  }
}
