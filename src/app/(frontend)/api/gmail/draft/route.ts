import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { createGmailDraft, getPrimaryGmailSignature } from "@/lib/gmail-service";
import { fetchMessageBody } from "@/lib/gmail-search";
import { buildGmailReplyContext, parseGmailMessageId, type GmailReplyContext } from "@/lib/gmail-reply-context";
import { parseGmailDraftAttachments } from "@/lib/gmail-draft-attachments";
import { markdownLiteToHtml } from "@/lib/email-draft-markdown";
import {
  extractEmailHeaders,
  stripAgentSignOff,
} from "@/lib/gmail-draft-parsing";
import { findDraftIdByMessageId, getFullMessage, getThreadMessages } from "@/lib/mail/gmail-mail";
import { draftHtmlToText, stripTrailingSignature } from "@/lib/mail/drafts";
import { gmailErrorResponse, parseGmailId, requireGmailToken, requireMailUser } from "@/lib/mail/route-helpers";

/**
 * POST /api/gmail/draft
 *
 * Drops an OptiMate chat reply (or any text the user picks) into the
 * logged-in user's own Gmail Drafts. New drafts may leave the recipient empty;
 * replies retain their thread recipient. We create drafts but never send mail.
 *
 * Body: { subject?: string, body: string, to?: string, attachments?: ImageAttachment[], replyToMessageId?: string, draftId?: string }
 *  - draftId: update this existing draft in place instead of creating a new one.
 *  - replyToMessageId: Gmail message id of an email the user attached in the
 *    chat. The server fetches its headers and saves the draft as a threaded
 *    reply (recipient, Re: subject, threadId, In-Reply-To all pinned).
 *  - body is treated as markdown-lite; we render a minimal HTML version
 *    so paragraphs and bullets survive in Gmail's compose pane.
 *  - to defaults to "" (empty recipient field) so Gmail forces the user
 *    to pick someone before sending.
 */

interface DraftBody {
  subject?: unknown;
  body?: unknown;
  to?: unknown;
  /** Gmail thread id for in-thread replies. */
  threadId?: unknown;
  /** RFC 822 Message-ID of the message being replied to. */
  inReplyTo?: unknown;
  /** Gmail message id to reply to; resolved server-side into reply headers. */
  replyToMessageId?: unknown;
  /** Existing Gmail draft id to update in place (Mail view "Save as draft"). */
  draftId?: unknown;
  attachments?: unknown;
}

/**
 * GET /api/gmail/draft?messageId=<draft message id>
 *
 * Loads one of the user's Gmail drafts for the CMS Mail compose window, so
 * drafts OptiMate saved open in the CMS instead of Gmail. The body comes back
 * as plain text without the Gmail signature (the compose window shows the
 * signature separately and the server adds it again on send/save). For a
 * reply draft, `replyTo` is the latest non-draft message in its thread.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = await requireMailUser(req);
  if (ctx instanceof NextResponse) return ctx;
  const messageId = parseGmailId(req.nextUrl.searchParams.get("messageId"));
  if (!messageId) return NextResponse.json({ error: "Invalid draft message id." }, { status: 400 });
  const token = await requireGmailToken(ctx.user.id);
  if (token instanceof NextResponse) return token;

  try {
    const message = await getFullMessage(token.accessToken, messageId);
    if (!message.labelIds.includes("DRAFT")) {
      return NextResponse.json({ error: "This draft has already been sent or discarded." }, { status: 404 });
    }
    const [draftId, signature, thread] = await Promise.all([
      findDraftIdByMessageId(token.accessToken, messageId),
      getPrimaryGmailSignature(token.accessToken).catch(() => ""),
      message.threadId ? getThreadMessages(token.accessToken, message.threadId) : Promise.resolve([]),
    ]);
    if (!draftId) {
      return NextResponse.json({ error: "This draft has already been sent or discarded." }, { status: 404 });
    }
    const text = message.bodyHtml ? draftHtmlToText(message.bodyHtml) : message.body;
    const original = [...thread].reverse().find((entry) => !entry.labelIds.includes("DRAFT"));
    return NextResponse.json({
      draftId,
      messageId,
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      body: stripTrailingSignature(text, signature),
      threadId: original ? message.threadId : "",
      replyTo: original
        ? { messageId: original.messageId, from: original.from, subject: original.subject }
        : null,
    });
  } catch (err) {
    return gmailErrorResponse(err, "Could not load the Gmail draft.");
  }
}



export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in." },
      { status: 401 },
    );
  }

  let body: DraftBody;
  try {
    body = (await req.json()) as DraftBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawText = typeof body.body === "string" ? body.body.trim() : "";
  if (!rawText) {
    return NextResponse.json(
      { error: "body is required and must be non-empty." },
      { status: 400 },
    );
  }

  const attachmentResult = parseGmailDraftAttachments(body.attachments);
  if (!attachmentResult.ok) {
    return NextResponse.json({ error: attachmentResult.error }, { status: 400 });
  }

  // OptiMate drafts often start with a `Subject:` / `To:` header block when
  // the user asks for an email. Hoist those into the Gmail draft fields so
  // they don't end up rendered as text in the message body. Server-supplied
  // subject/to win over what the agent wrote (the caller may have stronger
  // context). After header extraction we also strip the agent's habitual
  // "Want me to tweak the tone…" sign-off so the email reads cleanly.
  const headers = extractEmailHeaders(rawText);
  const cleanedBody = stripAgentSignOff(headers.body).trim();
  const text = cleanedBody || headers.body.trim() || rawText;

  const clientSubject = typeof body.subject === "string" ? body.subject.trim() : "";
  const clientTo = typeof body.to === "string" ? body.to.trim() : "";
  // Precedence: explicit client subject → parsed Subject: header → empty
  // (Gmail compose pane shows an empty subject line, which is honest).
  const hasReplyToMessageId = typeof body.replyToMessageId === "string" && body.replyToMessageId.trim() !== "";
  const replyToMessageId = hasReplyToMessageId ? parseGmailMessageId(body.replyToMessageId) : null;
  if (hasReplyToMessageId && !replyToMessageId) {
    return NextResponse.json({ error: "replyToMessageId is invalid." }, { status: 400 });
  }

  const hasDraftId = typeof body.draftId === "string" && body.draftId.trim() !== "";
  const draftId = hasDraftId ? parseGmailId(body.draftId) : null;
  if (hasDraftId && !draftId) {
    return NextResponse.json({ error: "draftId is invalid." }, { status: 400 });
  }

  const tokenResult = await getValidGmailToken(user.id);
  if (!tokenResult.ok) {
    return NextResponse.json(
      { error: "gmail-not-connected", reason: tokenResult.reason },
      { status: 403 },
    );
  }

  let reply: GmailReplyContext | undefined;
  if (replyToMessageId) {
    try {
      reply = buildGmailReplyContext(await fetchMessageBody(tokenResult.accessToken, replyToMessageId));
    } catch (err) {
      const e = err as { message?: string };
      return NextResponse.json(
        { error: `Could not load the email to reply to: ${e.message ?? "Gmail fetch failed"}` },
        { status: 502 },
      );
    }
  }

  // A reply's recipient/subject/thread come from the original email so Gmail
  // threads it (it requires threadId, In-Reply-To and a matching Re: subject).
  const subject = reply?.subject || clientSubject || headers.subject || "";
  const to = reply?.to || clientTo || headers.to || "";
  const threadId = reply ? (reply.threadId ?? "") : typeof body.threadId === "string" ? body.threadId.trim() : "";
  const inReplyTo = reply ? (reply.inReplyTo ?? "") : typeof body.inReplyTo === "string" ? body.inReplyTo.trim() : "";

  try {
    const html = markdownLiteToHtml(text);
    const result = await createGmailDraft(tokenResult.accessToken, {
      to,
      subject,
      htmlBody: html,
      ...(threadId ? { threadId } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(draftId ? { draftId } : {}),
      ...(attachmentResult.attachments.length > 0
        ? { attachments: attachmentResult.attachments }
        : {}),
    });
    return NextResponse.json({
      draftId: result.draftId,
      messageId: result.messageId,
      // Direct deep-link into the draft. Gmail accepts the message id here.
      gmailUrl: `https://mail.google.com/mail/u/0/#drafts/${result.messageId}`,
    });
  } catch (err) {
    const e = err as { code?: number; status?: number; message?: string };
    const status = e.code ?? e.status ?? 0;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        {
          error: "scope-insufficient",
          reason:
            "Gmail returned insufficient permissions. Reconnect Gmail to grant compose and settings/signature access.",
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: e.message ?? "Gmail draft creation failed." },
      { status: 500 },
    );
  }
}
