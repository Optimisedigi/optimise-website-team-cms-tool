const WORDS_PER_MINUTE = 200

/** "N min read" for the given text, or null when it has no words. */
export function readingTimeFromText(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  if (!words) return null
  return `${Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))} min read`
}

/** Concatenated text of a Lexical rich-text value; unknown shapes yield ''. */
export function lexicalPlainText(value: unknown): string {
  const parts: string[] = []
  const stack: unknown[] = [value]
  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (Array.isArray(node)) {
      stack.push(...node)
      continue
    }
    const record = node as { text?: unknown; root?: unknown; children?: unknown }
    if (typeof record.text === 'string') parts.push(record.text)
    if (record.root) stack.push(record.root)
    if (Array.isArray(record.children)) stack.push(...record.children)
  }
  return parts.join(' ')
}

/** Reading time from the Markdown body when present, otherwise from rich text. */
export function estimatedReadingTime(markdown: unknown, richText: unknown): string | null {
  if (typeof markdown === 'string' && markdown.trim()) return readingTimeFromText(markdown)
  return readingTimeFromText(lexicalPlainText(richText))
}
