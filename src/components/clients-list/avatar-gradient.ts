/**
 * Avatar colour + initial helpers for the Clients list view.
 *
 * The prototype (`mockups/2-clients-collapsed.html`) renders a circular avatar
 * with the client's first initial over a per-client gradient. Production rows
 * have a stable, unique numeric `id`, so we assign each client a distinct
 * gradient by indexing a fixed palette with that id — two clients within one
 * palette cycle never share a colour. Names are only used as a fallback when no
 * id is available (e.g. a brand-new unsaved row).
 */

/**
 * Palette of distinct gradient endpoints. Each entry is a [from, to] hue pair.
 * 24 visually-separated colours so a real agency's client list cycles only
 * after 24 clients — well beyond typical counts, and even then the repeat is
 * the most-separated colour rather than an adjacent near-duplicate.
 */
const GRADIENT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['#2c97c9', '#1f7fad'], // cyan-blue
  ['#E67E22', '#cf6f1c'], // orange
  ['#6366f1', '#4f46e5'], // indigo
  ['#16a34a', '#12823b'], // green
  ['#dc2626', '#b91c1c'], // red
  ['#0891b2', '#067a96'], // teal
  ['#7c3aed', '#6d28d9'], // violet
  ['#db2777', '#be185d'], // pink
  ['#ca8a04', '#a16207'], // amber
  ['#0d9488', '#0f766e'], // emerald-teal
  ['#2563eb', '#1d4ed8'], // blue
  ['#9333ea', '#7e22ce'], // purple
  ['#e11d48', '#be123c'], // rose
  ['#65a30d', '#4d7c0f'], // lime
  ['#0284c7', '#0369a1'], // sky
  ['#c026d3', '#a21caf'], // fuchsia
  ['#ea580c', '#c2410c'], // deep orange
  ['#059669', '#047857'], // emerald
  ['#4f46e5', '#4338ca'], // royal indigo
  ['#d97706', '#b45309'], // dark amber
  ['#0e7490', '#155e75'], // dark cyan
  ['#7e22ce', '#6b21a8'], // dark purple
  ['#15803d', '#166534'], // forest
  ['#b91c1c', '#991b1b'], // crimson
] as const

/** Number of distinct colours available before the palette repeats. */
export const AVATAR_PALETTE_SIZE = GRADIENT_PAIRS.length

function gradientFromIndex(index: number): string {
  const safe = ((index % AVATAR_PALETTE_SIZE) + AVATAR_PALETTE_SIZE) % AVATAR_PALETTE_SIZE
  const pair = GRADIENT_PAIRS[safe] ?? GRADIENT_PAIRS[0]
  return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`
}

/** Stable, non-cryptographic hash (djb2) for the name-based fallback. */
function hashString(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return hash >>> 0
}

/**
 * Distinct gradient for a client, keyed on the unique numeric `id` so no two
 * clients within a palette cycle share a colour. Falls back to a name hash when
 * the id is missing (unsaved rows). The id is mapped directly (`id - 1`) so the
 * first clients get palette entries 0, 1, 2… in order.
 */
export function avatarColor(
  id: number | string | null | undefined,
  name: string | null | undefined,
): string {
  const numericId = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN
  if (Number.isFinite(numericId)) {
    return gradientFromIndex(Math.trunc(numericId) - 1)
  }
  const key = (name ?? '').trim() || '?'
  return gradientFromIndex(hashString(key))
}

/**
 * Name-only gradient fallback. Retained for callers/tests that have no id.
 * Prefer {@link avatarColor} when an id is available.
 */
export function avatarGradient(name: string | null | undefined): string {
  const key = (name ?? '').trim() || '?'
  return gradientFromIndex(hashString(key))
}

/** First non-whitespace character of the name, uppercased; falls back to "?". */
export function avatarInitial(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

type MediaLike = {
  url?: string | null
  alt?: string | null
  sizes?: { thumbnail?: { url?: string | null } | null } | null
} | null | undefined

/**
 * Resolve the best logo image URL from a populated upload value, preferring the
 * generated thumbnail size over the original. Returns "" when no usable URL is
 * present (or the value is just an unpopulated id).
 */
export function logoUrl(logo: MediaLike | number | string): string {
  if (!logo || typeof logo !== 'object') return ''
  const thumb = logo.sizes?.thumbnail?.url
  return (thumb || logo.url || '').trim()
}

/**
 * Reduce a website URL to a bare host (no scheme, no `www.`, no path).
 * Returns "" when the input is empty or unparseable so callers can omit the line.
 */
export function websiteHost(websiteUrl: string | null | undefined): string {
  const raw = (websiteUrl ?? '').trim()
  if (!raw) return ''
  try {
    const href = raw.startsWith('http') ? raw : `https://${raw}`
    const { host } = new URL(href)
    return host.replace(/^www\./, '')
  } catch {
    // Not a parseable URL — strip a leading scheme/www and any path manually.
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
  }
}
