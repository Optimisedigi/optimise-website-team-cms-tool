/**
 * Screenshots/images the admin attaches to an AdminMate message. The browser
 * downsizes them before upload; this re-checks everything server-side because
 * the request body is untrusted.
 */

export const ADMINMATE_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const
export type AdminMateImageMediaType = (typeof ADMINMATE_IMAGE_MEDIA_TYPES)[number]

export interface AdminMateImageAttachment {
  name: string
  mediaType: AdminMateImageMediaType
  /** Raw base64, no `data:` prefix. */
  data: string
}

export const MAX_ADMINMATE_IMAGES = 3
/** Per-image decoded size cap. */
export const MAX_ADMINMATE_IMAGE_BYTES = 2 * 1024 * 1024
/** Total base64 across all images; keeps the request under Vercel's 4.5 MB body limit. */
export const MAX_ADMINMATE_IMAGE_TOTAL_CHARS = 4_000_000

const MEDIA_TYPES = new Set<string>(ADMINMATE_IMAGE_MEDIA_TYPES)
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** Leading bytes of the first 12 decoded bytes, keyed by declared type. */
function matchesSignature(mediaType: AdminMateImageMediaType, base64: string): boolean {
  let head: number[]
  try {
    head = Array.from(atob(base64.slice(0, 16)), (char) => char.charCodeAt(0))
  } catch {
    return false
  }
  const starts = (bytes: number[], offset = 0) =>
    bytes.every((byte, index) => head[offset + index] === byte)
  switch (mediaType) {
    case 'image/png':
      return starts([0x89, 0x50, 0x4e, 0x47])
    case 'image/jpeg':
      return starts([0xff, 0xd8, 0xff])
    case 'image/gif':
      return starts([0x47, 0x49, 0x46, 0x38])
    case 'image/webp':
      return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)
  }
}

export type ParseImagesResult =
  { ok: true; value: AdminMateImageAttachment[] } | { ok: false; error: string }

export function parseAdminMateImageAttachments(input: unknown): ParseImagesResult {
  if (input === undefined || input === null) return { ok: true, value: [] }
  if (!Array.isArray(input)) return { ok: false, error: 'imageAttachments must be an array' }
  if (input.length > MAX_ADMINMATE_IMAGES) {
    return { ok: false, error: `Attach up to ${MAX_ADMINMATE_IMAGES} images per message` }
  }
  const value: AdminMateImageAttachment[] = []
  let totalChars = 0
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: 'Each image attachment must be an object' }
    }
    const item = raw as Record<string, unknown>
    if (typeof item.mediaType !== 'string' || !MEDIA_TYPES.has(item.mediaType)) {
      return { ok: false, error: 'Unsupported image type. Use PNG, JPEG, GIF or WebP.' }
    }
    if (
      typeof item.data !== 'string' ||
      item.data.length === 0 ||
      item.data.length % 4 !== 0 ||
      !BASE64.test(item.data)
    ) {
      return { ok: false, error: 'Image attachment data must be base64' }
    }
    if (!matchesSignature(item.mediaType as AdminMateImageMediaType, item.data)) {
      return {
        ok: false,
        error: 'Image data does not match its declared type. Use PNG, JPEG, GIF or WebP.',
      }
    }
    if (Math.floor((item.data.length * 3) / 4) > MAX_ADMINMATE_IMAGE_BYTES) {
      return { ok: false, error: 'Each image must be 2 MB or smaller' }
    }
    totalChars += item.data.length
    if (totalChars > MAX_ADMINMATE_IMAGE_TOTAL_CHARS) {
      return { ok: false, error: 'Attached images are too large in total' }
    }
    const name =
      typeof item.name === 'string'
        ? item.name
            .replace(/[\r\n]+/g, ' ')
            .trim()
            .slice(0, 120)
        : ''
    value.push({
      name: name || 'image',
      mediaType: item.mediaType as AdminMateImageMediaType,
      data: item.data,
    })
  }
  return { ok: true, value }
}
