import type { AdminMateImageAttachment } from '@/lib/agents/adminmate/image-attachments'
import { fitImageForChat } from './chat-image-fit'

/**
 * Browser-side prep for screenshots attached to AdminMate. Any size can be
 * dropped: large images are shrunk (long edge 1568px, stepped down further if
 * needed) so three of them stay under the server's per-image and total caps.
 */

/** 3 × 990 KB stays under MAX_ADMINMATE_IMAGE_TOTAL_CHARS once base64-encoded. */
const ADMINMATE_IMAGE_FIT = { maxBytes: 990_000, maxEdge: 1568 }

export type PreparedImage = AdminMateImageAttachment & { size: number }

export type PrepareImageResult = { ok: true; value: PreparedImage } | { ok: false; error: string }

export async function prepareAdminMateImage(file: File, name: string): Promise<PrepareImageResult> {
  return fitImageForChat(file, name, ADMINMATE_IMAGE_FIT)
}
