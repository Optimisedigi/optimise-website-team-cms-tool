/**
 * Utility for uploading screenshot buffers to Vercel Blob storage.
 * Replaces storing base64 strings in SQLite.
 */

import { put } from '@vercel/blob'

export async function uploadScreenshotToBlob(
  imageBuffer: Buffer,
  domain: string,
): Promise<string | null> {
  try {
    const cleanDomain = domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .replace(/[^a-zA-Z0-9.-]/g, '_')

    const timestamp = Date.now()
    const pathname = `screenshots/${cleanDomain}/${timestamp}.png`

    const blob = await put(pathname, imageBuffer, {
      access: 'public',
      contentType: 'image/png',
    })

    return blob.url
  } catch (err) {
    console.error(`[blob-upload] Failed for ${domain}:`, err)
    return null
  }
}
