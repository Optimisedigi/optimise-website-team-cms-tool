export const MAX_NKL_TARGETS = 3

export function nklIdString(value: unknown): string | null {
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return id == null || id === '' ? null : String(id)
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id && id !== 'undefined' ? id : null
  }
  return null
}

export function parseAppliedNklIds(value: unknown, fallback?: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((id) => nklIdString(id)).filter((id): id is string => Boolean(id))
    : typeof value === 'string'
      ? value.split(',').map((id) => nklIdString(id)).filter((id): id is string => Boolean(id))
      : []
  const fallbackId = nklIdString(fallback)
  const source = fallbackId ? [fallbackId, ...raw] : raw
  const unique: string[] = []
  const seen = new Set<string>()
  for (const id of source) {
    if (seen.has(id)) continue
    seen.add(id)
    unique.push(id)
    if (unique.length >= MAX_NKL_TARGETS) break
  }
  return unique
}

export function serializeAppliedNklIds(ids: string[]): string {
  return parseAppliedNklIds(ids).join(',')
}

export function toggleAppliedNklId(current: string[], nklId: string | number, checked: boolean): string[] {
  const id = nklIdString(nklId)
  if (!id) return parseAppliedNklIds(current)
  const next = parseAppliedNklIds(current).filter((existing) => existing !== id)
  if (checked) {
    if (next.length >= MAX_NKL_TARGETS) return parseAppliedNklIds(current)
    next.push(id)
  }
  return next
}
