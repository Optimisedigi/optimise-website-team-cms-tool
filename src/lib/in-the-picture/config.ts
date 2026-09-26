import { createHash, timingSafeEqual } from 'node:crypto'

/** All machine credentials are single-purpose and never exposed to browsers. */
export function matchesBearer(request: Request, expected: string | undefined): boolean {
  const supplied = request.headers.get('authorization')
  if (!expected || expected.length < 32 || !supplied?.startsWith('Bearer ')) return false
  return timingSafeEqual(
    createHash('sha256').update(supplied.slice(7)).digest(),
    createHash('sha256').update(expected).digest(),
  )
}

export function configuredClientId(): number | null {
  const value = process.env.IN_THE_PICTURE_CLIENT_ID
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function websiteUrl(path: '/api/content-sync/ideas' | '/api/content-sync/articles'): URL | null {
  try {
    const raw = process.env.IN_THE_PICTURE_WEBSITE_ORIGIN
    if (!raw) return null
    const url = new URL(raw)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return null
    return new URL(path, url)
  } catch { return null }
}

export async function boundedJson(request: Request | Response, maxBytes = 500_000): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Invalid JSON')
  let bytes = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new Error('Payload too large')
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } finally { await reader.cancel().catch(() => undefined) }
}
