import { createHmac, timingSafeEqual } from 'node:crypto'
import { websiteUrl } from './config'

/**
 * Signed, short-lived website preview links for In The Picture posts.
 *
 * The CMS admin mints `/preview/cms-article/<postId>?exp=&sig=` on the website.
 * The website forwards exp/sig to `GET /api/content-sync/article-preview` here,
 * which re-verifies them before returning the draft article. The website holds
 * no new secret: only this CMS can mint or verify a link.
 */
export const PREVIEW_TTL_SECONDS = 15 * 60

/** Domain-separated from PAYLOAD_SECRET so it can't be confused with Payload's own tokens. */
function previewKey(): Buffer | null {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret || secret.length < 16) return null
  return createHmac('sha256', secret).update('in-the-picture-article-preview:v1').digest()
}

function signature(key: Buffer, postId: number, exp: number): string {
  return createHmac('sha256', key).update(`${postId}.${exp}`).digest('base64url')
}

export function validPostId(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string' || !/^[1-9]\d{0,15}$/.test(text)) return null
  const id = Number(text)
  return Number.isSafeInteger(id) ? id : null
}

/** Null when no signing secret is configured (fail closed). */
export function signPreview(postId: number, nowMs = Date.now()): { exp: number; sig: string } | null {
  const key = previewKey()
  if (!key) return null
  const exp = Math.floor(nowMs / 1000) + PREVIEW_TTL_SECONDS
  return { exp, sig: signature(key, postId, exp) }
}

/** True only for an unexpired link this CMS signed for exactly this post. */
export function verifyPreview(postId: number, exp: unknown, sig: unknown, nowMs = Date.now()): boolean {
  const key = previewKey()
  if (!key || typeof exp !== 'string' || !/^\d{1,12}$/.test(exp) || typeof sig !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(sig)) return false
  const expiry = Number(exp)
  const now = Math.floor(nowMs / 1000)
  // Reject expired links and any expiry further out than this CMS ever issues.
  if (expiry < now || expiry > now + PREVIEW_TTL_SECONDS + 60) return false
  const expected = Buffer.from(signature(key, postId, expiry))
  const supplied = Buffer.from(sig)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

/** The website preview URL for a signed link, or null when the website origin isn't configured. */
export function previewUrl(postId: number, signed: { exp: number; sig: string }): URL | null {
  const url = websiteUrl(`/preview/cms-article/${postId}`)
  if (!url) return null
  url.searchParams.set('exp', String(signed.exp))
  url.searchParams.set('sig', signed.sig)
  return url
}
