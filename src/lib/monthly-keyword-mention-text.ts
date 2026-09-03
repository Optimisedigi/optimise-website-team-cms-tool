export type MentionTeammate = { id: string; label: string }

export const MAX_MENTION_TAGS = 20
export const MAX_MENTION_SUGGESTIONS = 6

export function parseTaggedUserIds(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.map((id) => String(id))
    : typeof value === 'string'
      ? value.split(',')
      : []
  const unique: string[] = []
  const seen = new Set<string>()
  for (const id of raw) {
    const trimmed = id.trim()
    if (!trimmed || trimmed === 'undefined' || seen.has(trimmed)) continue
    seen.add(trimmed)
    unique.push(trimmed)
    if (unique.length >= MAX_MENTION_TAGS) break
  }
  return unique
}

export function mentionTokenAt(value: string, caret: number): { start: number; query: string } | null {
  const upToCaret = value.slice(0, Math.max(0, caret))
  const match = upToCaret.match(/@([\p{L}\p{N}_.-]*)$/u)
  if (!match) return null
  return { start: Math.max(0, caret - match[0].length), query: match[1] ?? '' }
}

export function filterMentionSuggestions(teammates: MentionTeammate[], query: string): MentionTeammate[] {
  const needle = query.toLowerCase()
  return teammates.filter((mate) => mate.label.toLowerCase().startsWith(needle)).slice(0, MAX_MENTION_SUGGESTIONS)
}

export function insertMention(value: string, caret: number, start: number, label: string): { next: string; caret: number } {
  const insert = `@${label} `
  const next = `${value.slice(0, start)}${insert}${value.slice(caret)}`
  return { next, caret: start + insert.length }
}
