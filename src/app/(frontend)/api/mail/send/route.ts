import { NextRequest, NextResponse } from "next/server";
import { sendGmailMessage } from "@/lib/gmail-service";
import { markdownLiteToHtml } from "@/lib/email-draft-markdown";
import { buildGmailReplyContext } from "@/lib/gmail-reply-context";
import { deleteDraft, getFullMessage } from "@/lib/mail/gmail-mail";
import { matchMessageToClient } from "@/lib/mail/client-matching";
import { loadClientDomainIndex, storeClientEmail, toClientEmailInput } from "@/lib/mail/store";
import { gmailErrorResponse, parseGmailId, readJson, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * POST /api/mail/send
 * Body: { to, cc?, subject, body, replyToMessageId?, draftId? }
 *
 * Sends mail. Only reachable from the Send button: the user's edited text
 * is sent as-is (the model never calls this route). For replies, thread id
 * and In-Reply-To come from the original message fetched server-side.
 * The sent message is matched and stored straight away if it is to a client.
 * When the email was opened from a Gmail draft, that draft is deleted after
 * sending so it does not linger in Drafts.
 */
const HEADER_MAX = 2000;

function cleanHeader(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim().slice(0, HEADER_MAX) : "";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = await readJson<{ to?: unknown; cc?: unknown; subject?: unknown; body?: unknown; replyToMessageId?: unknown; draftId?: unknown }>(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "The email body is empty." }, { status: 400 });
  const hasReply = typeof body.replyToMessageId === "string" && body.replyToMessageId !== "";
  const replyToMessageId = hasReply ? parseGmailId(body.replyToMessageId) : null;
  if (hasReply && !replyToMessageId) return NextResponse.json({ error: "Invalid reply message id." }, { status: 400 });
  const hasDraft = typeof body.draftId === "string" && body.draftId !== "";
  const draftId = hasDraft ? parseGmailId(body.draftId) : null;
  if (hasDraft && !draftId) return NextResponse.json({ error: "Invalid draft id." }, { status: 400 });

  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;

  let reply: ReturnType<typeof buildGmailReplyContext> | undefined;
  if (replyToMessageId) {
    try {
      reply = buildGmailReplyContext(await getFullMessage(token.accessToken, replyToMessageId));
    } catch (err) {
      return gmailErrorResponse(err, "Could not load the email you are replying to.");
    }
  }

  const to = cleanHeader(body.to) || reply?.to || "";
  if (!/@/.test(to)) return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });
  const subject = cleanHeader(body.subject) || reply?.subject || "";

  let sent;
  try {
    sent = await sendGmailMessage(token.accessToken, {
      to,
      cc: cleanHeader(body.cc) || undefined,
      subject,
      htmlBody: markdownLiteToHtml(text),
      ...(reply?.threadId ? { threadId: reply.threadId } : {}),
      ...(reply?.inReplyTo ? { inReplyTo: reply.inReplyTo } : {}),
    });
  } catch (err) {
    return gmailErrorResponse(err, "Gmail could not send the email.");
  }

  let draftNote: string | null = null;
  if (draftId) {
    try {
      await deleteDraft(token.accessToken, draftId);
    } catch {
      draftNote = "Sent, but the old Gmail draft could not be removed. Delete it from Drafts.";
    }
  }

  // Link the sent email to its client now rather than waiting for the next sync.
  let storedClient: { id: number; name: string } | null = null;
  try {
    const ownAddresses = [token.email, token.userEmail].filter(Boolean);
    const message = await getFullMessage(token.accessToken, sent.messageId);
    const match = matchMessageToClient(await loadClientDomainIndex(ctx.payload, ownAddresses), message);
    if (match) {
      await storeClientEmail(
        ctx.payload,
        toClientEmailInput({
          message,
          clientId: match.clientId,
          ownerId: ctx.user.id,
          matchedBy: "auto",
          matchedOn: match.matchedOn,
          ownAddresses,
          gmailAccount: token.email,
        }),
      );
      storedClient = { id: match.clientId, name: match.clientName };
    }
  } catch {
    // Sent fine; the next sync will link it.
  }

  return NextResponse.json({ messageId: sent.messageId, threadId: sent.threadId, client: storedClient, draftNote });
}
