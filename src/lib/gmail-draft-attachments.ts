import type { GmailDraftAttachment } from "@/lib/gmail-service";

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

export function parseGmailDraftAttachments(value: unknown):
  | { ok: true; attachments: GmailDraftAttachment[] }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, attachments: [] };
  if (!Array.isArray(value)) return { ok: false, error: "attachments must be an array." };
  if (value.length > MAX_ATTACHMENT_COUNT) {
    return { ok: false, error: `Attach up to ${MAX_ATTACHMENT_COUNT} images.` };
  }

  const attachments: GmailDraftAttachment[] = [];
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
      mimeType: mediaType as GmailDraftAttachment["mimeType"],
      content,
    });
  }
  return { ok: true, attachments };
}
