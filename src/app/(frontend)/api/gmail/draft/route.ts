import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { createGmailDraft } from "@/lib/gmail-service";
import {
  extractEmailHeaders,
  stripAgentSignOff,
} from "@/lib/gmail-draft-parsing";

/**
 * POST /api/gmail/draft
 *
 * Drops an OptiMate chat reply (or any text the user picks) into the
 * logged-in user's own Gmail Drafts. The draft has no recipient set so the
 * user has to pick one in Gmail before sending \u2014 we never send mail.
 *
 * Body: { subject?: string, body: string, to?: string }
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
}

/**
 * Minimal markdown-lite \u2192 HTML for chat replies. Handles the subset OptiMate
 * actually emits: paragraphs, **bold**, `code`, bullet lists (- item),
 * numbered lists. Anything else passes through escaped. Keeps the output
 * narrow and predictable so Gmail's compose pane renders it cleanly.
 */
function markdownLiteToHtml(input: string): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formatInline = (s: string): string =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /`([^`]+)`/g,
        '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-family:ui-monospace,Menlo,Consolas,monospace;">$1</code>',
      );

  const lines = input.split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    const numberedMatch = line.match(/^\d+\.\s+(.+)/);

    if (bulletMatch) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${formatInline(bulletMatch[1])}</li>`);
    } else if (numberedMatch) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${formatInline(numberedMatch[1])}</li>`);
    } else if (line.trim() === "") {
      closeList();
      // Don't emit empty paragraphs; just let the next block start a fresh one.
    } else {
      closeList();
      out.push(`<p>${formatInline(line)}</p>`);
    }
  }
  closeList();

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">${out.join(
    "",
  )}</div>`;
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
