import {
  ADMINMATE_IMAGE_MEDIA_TYPES,
  MAX_ADMINMATE_IMAGE_BYTES,
  type AdminMateImageAttachment,
  type AdminMateImageMediaType,
} from '@/lib/agents/adminmate/image-attachments'

/**
 * Browser-side prep for screenshots attached to AdminMate: keep small images
 * as-is, downscale large ones so the long edge is at most 1568px (the vision
 * models rescale beyond that anyway) and the upload stays under the server cap.
 */

const MAX_EDGE = 1568
/** Images at or below this size and edge are sent untouched. */
const PASSTHROUGH_BYTES = 1_500_000
const SUPPORTED = new Set<string>(ADMINMATE_IMAGE_MEDIA_TYPES)

export type PreparedImage = AdminMateImageAttachment & { size: number }

export type PrepareImageResult = { ok: true; value: PreparedImage } | { ok: false; error: string }

function readBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

async function downscale(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size <= PASSTHROUGH_BYTES) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    // JPEG has no alpha; paint white so transparent screenshots stay readable.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  } finally {
    bitmap.close()
  }
}

export async function prepareAdminMateImage(file: File, name: string): Promise<PrepareImageResult> {
  if (!SUPPORTED.has(file.type)) {
    return { ok: false, error: `${name} is not a supported image. Use PNG, JPEG, GIF or WebP.` }
  }
  try {
    const resized = await downscale(file)
    const blob = resized ?? file
    if (blob.size > MAX_ADMINMATE_IMAGE_BYTES) {
      return { ok: false, error: `${name} is too large. Use images up to 2 MB.` }
    }
    const mediaType = (resized ? 'image/jpeg' : file.type) as AdminMateImageMediaType
    return { ok: true, value: { name, mediaType, data: await readBase64(blob), size: blob.size } }
  } catch {
    return { ok: false, error: `Could not read ${name}.` }
  }
}
