import { NextRequest, NextResponse } from "next/server";
import { parseMailComposeContent } from "@/lib/mail/compose-content";
import { deleteDraft } from "@/lib/mail/gmail-mail";
import { deliverMail } from "@/lib/mail/deliver";
import { gmailErrorResponse, parseGmailId, readJson, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * POST /api/mail/send
 * Body: { to, cc?, bcc?, subject, html, inlineImages?, attachments?, replyToMessageId?, draftId? }
 *
 * Sends mail. Only reachable from the Send button: the user's edited HTML
 * is sent as-is after validation (the model never calls this route). Inline
 * images arrive as cid: references with their data; attachments total ≤ 3 MB. For replies, thread id
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
  const body = await readJson<{
    to?: unknown;
    cc?: unknown;
    bcc?: unknown;
    subject?: unknown;
    html?: unknown;
    inlineImages?: unknown;
    attachments?: unknown;
    replyToMessageId?: unknown;
    draftId?: unknown;
  }>(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const content = parseMailComposeContent({ html: body.html, inlineImages: body.inlineImages, attachments: body.attachments });
  if (!content.ok) return NextResponse.json({ error: content.error }, { status: 400 });
  const hasReply = typeof body.replyToMessageId === "string" && body.replyToMessageId !== "";
  const replyToMessageId = hasReply ? parseGmailId(body.replyToMessageId) : null;
  if (hasReply && !replyToMessageId) return NextResponse.json({ error: "Invalid reply message id." }, { status: 400 });
  const hasDraft = typeof body.draftId === "string" && body.draftId !== "";
  const draftId = hasDraft ? parseGmailId(body.draftId) : null;
  if (hasDraft && !draftId) return NextResponse.json({ error: "Invalid draft id." }, { status: 400 });

  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;

  const result = await deliverMail({
    payload: ctx.payload,
    ownerId: ctx.user.id,
    token,
    to: cleanHeader(body.to),
    cc: cleanHeader(body.cc),
    bcc: cleanHeader(body.bcc),
    subject: cleanHeader(body.subject),
    content: content.value,
    replyToMessageId,
  });
  if (!result.ok) {
    if (result.stage === "recipient") return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });
    return gmailErrorResponse(
      result.error,
      result.stage === "reply" ? "Could not load the email you are replying to." : "Gmail could not send the email.",
    );
  }

  let draftNote: string | null = null;
  if (draftId) {
    try {
      await deleteDraft(token.accessToken, draftId);
    } catch {
      draftNote = "Sent, but the old Gmail draft could not be removed. Delete it from Drafts.";
    }
  }

  return NextResponse.json({ messageId: result.messageId, threadId: result.threadId, client: result.client, draftNote });
}
