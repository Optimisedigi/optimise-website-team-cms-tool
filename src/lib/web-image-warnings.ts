/** Blog images above this are flagged for re-upload as a web-optimised file. */
export const MAX_WEB_IMAGE_BYTES = 100 * 1024

export type MediaInfo = { filesize: number | null; mimeType: string | null }

export const formatKb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`

export function oversizeImageWarning(subject: string, info: MediaInfo | null): string | null {
  if (info?.filesize == null || info.filesize <= MAX_WEB_IMAGE_BYTES) return null
  if (info.mimeType && !info.mimeType.startsWith('image/')) return null
  return `${subject} is ${formatKb(info.filesize)}, over the ${formatKb(MAX_WEB_IMAGE_BYTES)} limit for web images. Compress it (for example WebP or JPEG about 1600 px wide, using squoosh.app) and re-upload it so the page loads quickly.`
}

export function readMediaInfo(value: unknown): MediaInfo | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { filesize?: unknown; mimeType?: unknown }
  if (typeof record.filesize !== 'number') return null
  return { filesize: record.filesize, mimeType: typeof record.mimeType === 'string' ? record.mimeType : null }
}

export type MarkdownImage = { line: number; alt: string; url: string; filename: string | null }

/**
 * The Media `filename` behind a CMS image URL: `/api/media/file/<name>` on any
 * origin, or a Vercel Blob public URL. Null for other external images.
 */
export function mediaFilenameFromUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url, 'https://cms.invalid')
  } catch {
    return null
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  const last = segments.at(-1)
  if (!last) return null
  const fromMedia = segments.length === 4 && segments[0] === 'api' && segments[1] === 'media' && segments[2] === 'file'
  const fromBlob = parsed.hostname.endsWith('.public.blob.vercel-storage.com') && segments.length === 1
  if (!fromMedia && !fromBlob) return null
  try {
    return decodeURIComponent(last)
  } catch {
    return null
  }
}

/** Every `![alt](url)` image in Markdown, with its 1-based line number. */
export function markdownImages(markdown: string): MarkdownImage[] {
  const images: MarkdownImage[] = []
  markdown.replace(/\r\n/g, '\n').split('\n').forEach((text, index) => {
    for (const match of text.matchAll(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g)) {
      const url = match[2] ?? ''
      images.push({ line: index + 1, alt: match[1] ?? '', url, filename: mediaFilenameFromUrl(url) })
    }
  })
  return images
}
