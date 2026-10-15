import { formatGmailDraftHtml } from "@/lib/gmail-service";
import { sanitizeEmailHtml } from "@/lib/mail/email-html";
import type { MessageContentParts } from "@/lib/mail/gmail-mail";

/**
 * Turns a saved Gmail draft back into what the Mail compose window edits:
 * body HTML without the Gmail signature (the window previews it and the
 * server appends it again on send/save), inline images as data: URLs the
 * editor can show, and attachments as files.
 */

const DRAFT_WRAPPER_RE = /^<div data-optimate-gmail-draft-font="true" style="[^"]*">([\s\S]*)<\/div>$/;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface EditableDraftFile {
  name: string;
  mediaType: string;
  data: string;
}

export interface EditableDraft {
  html: string;
  attachments: EditableDraftFile[];
}

function unwrap(html: string): string {
  return html.trim().match(DRAFT_WRAPPER_RE)?.[1] ?? html.trim();
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Remove the signature that createGmailDraft appended. Drafts are saved as
 * formatGmailDraftHtml(body + signature), so the signature is matched in the
 * same normalised form (and raw, for drafts written elsewhere).
 */
export function stripAppendedSignature(html: string, signatureHtml: string): string {
  const body = unwrap(html);
  const signature = signatureHtml.trim();
  if (!signature) return body;
  const candidates = [unwrap(formatGmailDraftHtml(signature)), signature];
  for (const candidate of candidates) {
    const trimmed = body.trimEnd();
    if (candidate && trimmed.endsWith(candidate)) {
      return trimmed.slice(0, trimmed.length - candidate.length).replace(/(?:\s*<br\s*\/?>)+\s*$/i, "").trimEnd();
    }
  }
  return body;
}

export function buildEditableDraft(parts: MessageContentParts, signatureHtml: string): EditableDraft {
  const source = parts.html || escapeHtml(parts.text).replace(/\r?\n/g, "<br>");
  // Sanitise before the image data goes in: sanitizeEmailHtml caps the length.
  let html = sanitizeEmailHtml(stripAppendedSignature(source, signatureHtml));

  const attachments: EditableDraftFile[] = parts.attachments.map((file) => ({
    name: file.filename,
    mediaType: file.mimeType,
    data: file.data,
  }));
  for (const image of parts.inline) {
    const reference = `cid:${image.contentId}`;
    if (IMAGE_TYPES.has(image.mimeType) && image.contentId && html.includes(reference)) {
      html = html.split(reference).join(`data:${image.mimeType};base64,${image.data}`);
    } else {
      attachments.push({ name: image.filename, mediaType: image.mimeType, data: image.data });
    }
  }
  return { html, attachments };
}
