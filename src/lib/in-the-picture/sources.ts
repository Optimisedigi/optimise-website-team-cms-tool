export type Source = { title: string; url: string }

export const MAX_SOURCES = 30
export const MAX_SOURCE_TITLE = 300

const sourcesHeading = /^#{2,3}\s+(?:sources|references)\s*:?\s*$/i

/**
 * One source line: an optional list marker, then `[Title](url)` or a bare
 * http(s) URL. Null when the line is anything else. The URL is not validated here.
 */
export function sourceLine(line: string): Source | null {
  const text = line.trim().replace(/^(?:[-*+]|\d+\.)\s+/, '')
  const link = /^\[([^\]]+)\]\(\s*(\S+?)\s*\)\.?$/.exec(text)
  if (link?.[1] && link[2]) return { title: link[1].trim(), url: link[2] }
  if (/^https?:\/\/\S+$/i.test(text)) return { title: text, url: text }
  return null
}

/**
 * Splits a final "## Sources" (or "## References") section off Markdown when
 * every line under it is a source link. Null when there is no such section, so
 * a section with other content stays in the article body untouched.
 */
export function splitTrailingSources(markdown: string): { body: string; sourceLines: string[] } | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let heading = -1
  lines.forEach((line, index) => {
    if (sourcesHeading.test(line.trim())) heading = index
  })
  if (heading < 0) return null
  const after = lines.slice(heading + 1).map((line) => line.trim()).filter(Boolean)
  if (!after.length || !after.every((line) => sourceLine(line))) return null
  return { body: lines.slice(0, heading).join('\n').trimEnd(), sourceLines: after }
}

/** Source lines from both lists, keeping the first of any repeated URL. */
export function mergeSourceLines(...lists: string[][]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const line of lists.flat()) {
    const source = sourceLine(line)
    const key = source ? source.url : line.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(line.trim())
  }
  return merged
}

const faqHeading = /^##\s+(?:faqs?|frequently\s+asked\s+questions)\b.*$/i

/**
 * Separates the first "## FAQ" / "## FAQs" / "## Frequently asked questions"
 * section (up to the next H2) from the rest of the Markdown. Lines are blanked
 * rather than removed, so line numbers in conversion errors still match the editor.
 */
export function splitFaqSection(markdown: string): { body: string; faq: string } | null {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((line) => faqHeading.test(line.trim()))
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && !/^##\s/.test(lines[end]?.trim() ?? '')) end++
  if (!lines.slice(start + 1, end).some((line) => line.trim())) return null
  const inFaq = (index: number) => index >= start && index < end
  return {
    body: lines.map((line, index) => (inFaq(index) ? '' : line)).join('\n'),
    faq: lines.map((line, index) => (inFaq(index) ? line : '')).join('\n'),
  }
}
