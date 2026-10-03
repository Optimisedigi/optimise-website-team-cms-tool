import type { Option } from 'payload'

export type NormalizedOption = { label: string; value: string }

/** Turn Payload select `options` into plain {label, value} pairs (static labels only). */
export function normalizeOptions(options: readonly Option[] | undefined): NormalizedOption[] {
  if (!Array.isArray(options)) return []
  return options.map((option): NormalizedOption => {
    if (typeof option === 'string') return { label: option, value: option }
    const raw: unknown = option.label
    let label = option.value
    if (typeof raw === 'string') label = raw
    else if (raw && typeof raw === 'object' && !('$$typeof' in raw)) {
      const record = raw as Record<string, unknown>
      const first = record.en ?? Object.values(record)[0]
      if (typeof first === 'string') label = first
    }
    return { label, value: option.value }
  })
}

/** Resolve a field config label to a string, falling back when it is not static. */
export function staticLabel(label: unknown, fallback: string): string {
  if (typeof label === 'string' && label.trim()) return label
  if (label && typeof label === 'object' && !('$$typeof' in label)) {
    const record = label as Record<string, unknown>
    const first = record.en ?? Object.values(record)[0]
    if (typeof first === 'string' && first.trim()) return first
  }
  return fallback
}
