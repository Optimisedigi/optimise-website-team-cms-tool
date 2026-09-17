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

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_ATTACHMENT_COUNT = 3;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;
const MAX_TOTAL_ATTACHMENT_BASE64_LENGTH = Math.ceil(MAX_TOTAL_ATTACHMENT_BYTES / 3) * 4;

interface DraftAttachmentInput {
  name?: unknown;
  mediaType?: unknown;
  data?: unknown;
}

type ValidAttachment = {
  filename: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  content: Buffer;
};

function hasExpectedImageSignature(content: Buffer, mediaType: string): boolean {
  if (mediaType === "image/png") {
    return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mediaType === "image/jpeg") {
    return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  }
  if (mediaType === "image/gif") {
    const signature = content.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (mediaType === "image/webp") {
    return content.length >= 12
      && content.subarray(0, 4).toString("ascii") === "RIFF"
      && content.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function parseDraftAttachments(value: unknown):
  | { ok: true; attachments: ValidAttachment[] }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, attachments: [] };
  if (!Array.isArray(value)) return { ok: false, error: "attachments must be an array." };
  if (value.length > MAX_ATTACHMENT_COUNT) {
    return { ok: false, error: `Attach up to ${MAX_ATTACHMENT_COUNT} images.` };
  }

  const attachments: ValidAttachment[] = [];
  let totalBytes = 0;
  let totalBase64Length = 0;
  for (const raw of value as DraftAttachmentInput[]) {
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    const mediaType = typeof raw?.mediaType === "string" ? raw.mediaType : "";
    const data = typeof raw?.data === "string" ? raw.data : "";
    if (!name || name.length > 180 || /[\r\n\0]/.test(name)) {
      return { ok: false, error: "Each attachment needs a valid filename up to 180 characters." };
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(mediaType)) {
      return { ok: false, error: "Attachments must be PNG, JPEG, GIF, or WebP images." };
    }
    if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
      return { ok: false, error: `Attachment ${name} is not valid base64 data.` };
    }
    if (data.length > MAX_ATTACHMENT_BASE64_LENGTH) {
      return { ok: false, error: `${name} is too large. Use images up to 3 MB.` };
    }
    totalBase64Length += data.length;
    if (totalBase64Length > MAX_TOTAL_ATTACHMENT_BASE64_LENGTH) {
      return { ok: false, error: "Attachments can total up to 3 MB per draft." };
    }

    const content = Buffer.from(data, "base64");
    if (content.toString("base64") !== data) {
      return { ok: false, error: `Attachment ${name} is not valid base64 data.` };
    }
    if (!hasExpectedImageSignature(content, mediaType)) {
      return { ok: false, error: `${name} does not contain a valid ${mediaType.replace("image/", "").toUpperCase()} image.` };
    }
    if (content.length > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `${name} is too large. Use images up to 3 MB.` };
    }
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return { ok: false, error: "Attachments can total up to 3 MB per draft." };
    }

    attachments.push({
      filename: name,
      mimeType: mediaType as ValidAttachment["mimeType"],
      content,
    });
  }
  return { ok: true, attachments };
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

  const attachmentResult = parseDraftAttachments(body.attachments);
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
