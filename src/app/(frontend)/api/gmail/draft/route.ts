import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { createGmailDraft } from "@/lib/gmail-service";
import { parseGmailDraftAttachments } from "@/lib/gmail-draft-attachments";
import { markdownLiteToHtml } from "@/lib/email-draft-markdown";
import {
  extractEmailHeaders,
  stripAgentSignOff,
} from "@/lib/gmail-draft-parsing";

/**
 * POST /api/gmail/draft
 *
 * Drops an OptiMate chat reply (or any text the user picks) into the
 * logged-in user's own Gmail Drafts. New drafts may leave the recipient empty;
 * replies retain their thread recipient. We create drafts but never send mail.
 *
 * Body: { subject?: string, body: string, to?: string, attachments?: ImageAttachment[] }
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
  attachments?: unknown;
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
  const subject = clientSubject || headers.subject || "";
  const to = clientTo || headers.to || "";
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  const inReplyTo = typeof body.inReplyTo === "string" ? body.inReplyTo.trim() : "";

  const tokenResult = await getValidGmailToken(user.id);
  if (!tokenResult.ok) {
    return NextResponse.json(
      { error: "gmail-not-connected", reason: tokenResult.reason },
      { status: 403 },
    );
  }

  try {
    const html = markdownLiteToHtml(text);
    const result = await createGmailDraft(tokenResult.accessToken, {
      to,
      subject,
      htmlBody: html,
      ...(threadId ? { threadId } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
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
