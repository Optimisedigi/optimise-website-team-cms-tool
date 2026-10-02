/**
 * Plan allowances are authored as free text in Hosting Billing Settings. Admins
 * write them either as one line with "•" separators or as one item per line,
 * often ending with a "Not included: …" sentence. Split that text into parts
 * the payment page can render as a real list.
 */
export type HostingAllowance = Readonly<{
  intro: string | null
  items: readonly string[]
  exclusions: string | null
}>

const EXCLUSIONS_LABEL = /\b(not included|exclusions|excludes)\s*:/i
const BULLET_SEPARATOR = /[•\u2022\u25CF\u25AA]|\r?\n\s*(?:[-*]\s+)?/

export function parseHostingAllowance(text: string | null | undefined): HostingAllowance {
  const source = (text ?? '').trim()
  const exclusionsAt = source.search(EXCLUSIONS_LABEL)
  const included = (exclusionsAt === -1 ? source : source.slice(0, exclusionsAt)).trim()
  const exclusions = exclusionsAt === -1 ? null : source.slice(exclusionsAt).trim() || null

  const usesBulletGlyph = /[•\u2022\u25CF\u25AA]/.test(included)
  const parts = included.split(BULLET_SEPARATOR).map((part) => part.replace(/^[-*]\s+/, '').trim())

  // Text before the first bullet glyph is a lead-in sentence, not a list item.
  const intro = usesBulletGlyph && parts[0] ? parts[0] : null
  const items = (usesBulletGlyph ? parts.slice(1) : parts).filter(Boolean)

  if (items.length === 1 && !usesBulletGlyph) {
    return { intro: items[0] ?? null, items: [], exclusions }
  }
  return { intro, items, exclusions }
}
