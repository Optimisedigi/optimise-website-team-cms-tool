import { APIError } from 'payload'
import type { BlogPost, Media } from '@/payload-types'
import { configuredClientId } from './config'
import { MAX_SOURCES, MAX_SOURCE_TITLE, mergeSourceLines, type Source, sourceLine, splitFaqSection, splitTrailingSources } from './sources'

/**
 * A problem the editor can fix in the post. Thrown as a public 400 so the admin
 * toast shows this message; a plain Error becomes Payload's generic
 * "Something went wrong." and the save is rolled back with no explanation.
 */
export function editorError(message: string): APIError<null> {
  return new APIError(message, 400, null, true)
}
const snippet = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}...` : text).trim()

export type Inline = { text: string; bold?: boolean; italic?: boolean; link?: string }
export type Block = { type: 'heading'; level: 2 | 3; children: Inline[] } | { type: 'paragraph' | 'quote'; children: Inline[] } | { type: 'list'; ordered: boolean; items: Inline[][] } | { type: 'table'; header: Inline[][]; rows: Inline[][][] } | { type: 'image'; src: string; alt: string; caption?: string; width?: number; height?: number }
const categories = ['tax-tips', 'business-handbook', 'contractor-handbook']
const services = ['accounting', 'taxation', 'tax-advisory', 'superfunds', 'business-accounting', 'business-advice', 'virtual-fractional-cfo', 'income-averaging', 'property-service', 'finance-financial-planning', 'creative-tax-deductions', 'entertainment-industry-accounting']

function mediaUrl(raw: string): string {
  const origin = process.env.CONTENT_CMS_PUBLIC_ORIGIN
  if (!origin) throw new Error('Public CMS media origin is not configured')
  const base = new URL(origin)
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.username || base.password || base.search || base.hash) throw new Error('Invalid public CMS media origin')
  const url = new URL(raw, base)
  if (url.origin !== base.origin || url.protocol !== 'https:' || url.username || url.password || !url.pathname.startsWith('/api/media/file/')) throw editorError('Image must use a public CMS media URL (Blob requires an explicitly reviewed website allowlist)')
  return url.toString()
}
function image(value: unknown, alt: string): Extract<Block, { type: 'image' }> {
  if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string' || !alt?.trim() || alt.length > 500) throw editorError('Image URL and descriptive alt (max 500 characters) are required')
  const media = value as Media
  if (media.mimeType && !media.mimeType.startsWith('image/')) throw editorError('Video cannot be published as an image')
  if ((media.width && media.width > 8192) || (media.height && media.height > 8192)) throw editorError('Image dimensions exceed website limit')
  return { type: 'image', src: mediaUrl(value.url), alt: alt.trim(), ...(media.width ? { width: media.width } : {}), ...(media.height ? { height: media.height } : {}) }
}
function validLink(link: string): string {
  const invalid = () => editorError(`Invalid link "${snippet(link)}". Use a full https:// address or a /path on the site.`)
  if (link.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(link)) throw invalid()
  if (link.startsWith('/') && !link.startsWith('//')) return link
  let url: URL
  try {
    url = new URL(link)
  } catch {
    throw invalid()
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw invalid()
  return url.toString()
}
type Node = { type?: unknown; text?: unknown; format?: unknown; tag?: unknown; listType?: unknown; children?: unknown; fields?: unknown; value?: unknown; url?: unknown; root?: unknown; alt?: unknown }
function asNode(value: unknown): Node {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid rich text node')
  return value as Node
}
function children(value: unknown): Node[] {
  if (!Array.isArray(value)) throw new Error('Invalid rich text children')
  return value.map(asNode)
}
function inlines(nodes: Node[], link?: string): Inline[] {
  const result: Inline[] = []
  for (const node of nodes) {
    if (node.type === 'text' && typeof node.text === 'string') {
      const format = Number(node.format || 0)
      if (!Number.isInteger(format) || (format & ~3)) throw editorError(`Unsupported text formatting on "${snippet(node.text)}". Only bold and italic can be sent; remove underline, strikethrough, code and similar.`)
      result.push({ text: node.text, ...(format & 1 ? { bold: true } : {}), ...(format & 2 ? { italic: true } : {}), ...(link ? { link } : {}) })
    } else if (node.type === 'link' && typeof asNode(node.fields).url === 'string') {
      result.push(...inlines(children(node.children), validLink(asNode(node.fields).url as string)))
    } else if (node.type === 'linebreak') result.push({ text: '\n', ...(link ? { link } : {}) })
    else throw editorError(`Unsupported inline content in Content: ${String(node.type)}. Remove it or convert it to plain text.`)
  }
  if (!result.length || result.every(part => !part.text.trim())) throw editorError('Empty text block')
  return result
}
export function lexicalBlocks(value: unknown): Block[] {
  const root = asNode(asNode(value).root)
  const result: Block[] = []
  for (const node of children(root.children)) {
    if (node.type === 'heading') {
      if (node.tag !== 'h2' && node.tag !== 'h3') throw editorError('Only H2/H3 headings can be sent')
      result.push({ type: 'heading', level: node.tag === 'h2' ? 2 : 3, children: inlines(children(node.children)) })
    } else if (node.type === 'paragraph' || node.type === 'quote') {
      if (children(node.children).length) result.push({ type: node.type, children: inlines(children(node.children)) })
    } else if (node.type === 'list') {
      if (node.listType !== 'bullet' && node.listType !== 'number') throw editorError('Unsupported list')
      result.push({ type: 'list', ordered: node.listType === 'number', items: children(node.children).map(item => {
        if (item.type !== 'listitem') throw editorError('Unsupported list item')
        return inlines(children(item.children))
      }) })
    } else if (node.type === 'upload') {
      const fields = asNode(node.fields)
      result.push(image(node.value, typeof fields.alt === 'string' ? fields.alt : (node.value && typeof node.value === 'object' && 'alt' in node.value && typeof node.value.alt === 'string' ? node.value.alt : '')))
    } else throw editorError(`Unsupported block in Content: ${String(node.type)}. Use paragraphs, H2/H3 headings, lists, quotes and images only.`)
  }
  return result
}
function markdownInlines(text: string): Inline[] {
  const result: Inline[] = []
  const token = /(\[[^\]]+\]\([^)]+\)|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let cursor = 0
  const addPlain = (part: string) => {
    const bad = part.search(/[\[\]`<>*_]|!\(/)
    if (bad >= 0) throw editorError(`Unsupported Markdown syntax in "${snippet(part.slice(Math.max(0, bad - 20)))}". Square brackets, backticks, < >, * and _ are only allowed as bold, italic or link formatting.`)
    if (part) result.push({ text: part })
  }
  for (const match of text.matchAll(token)) {
    addPlain(text.slice(cursor, match.index))
    const raw = match[0]
    if (raw.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw)
      if (!link) throw editorError('Invalid Markdown link')
      result.push({ text: link[1], link: validLink(link[2]) })
    } else if (raw.startsWith('***')) result.push({ text: raw.slice(3, -3), bold: true, italic: true })
    else if (raw.startsWith('**')) result.push({ text: raw.slice(2, -2), bold: true })
    else result.push({ text: raw.slice(1, -1), italic: true })
    cursor = match.index + raw.length
  }
  addPlain(text.slice(cursor))
  if (!result.length || result.every(part => !part.text.trim())) throw editorError('Empty Markdown block')
  return result
}
const MAX_TABLE_COLUMNS = 12
const MAX_TABLE_ROWS = 100
const tableSeparator = /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?$/
/** Cells of a "| a | b |" row; the outer pipes are optional. */
function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
}
/** A GitHub-style pipe table: header row, "| --- |" separator, body rows. Cells may be blank. */
function markdownTable(lines: string[], start: number): { block: Extract<Block, { type: 'table' }>; next: number } {
  const header = tableCells(lines[start])
  const at = (i: number) => `on line ${i + 1}: "${snippet(lines[i]?.trim() ?? '')}"`
  if (!tableSeparator.test(lines[start + 1]?.trim() ?? '')) throw editorError(`Table needs a separator row like "| --- | --- |" under its header, ${at(start + 1)}`)
  if (header.length > MAX_TABLE_COLUMNS || header.every(cell => !cell)) throw editorError(`Table header must have 1–${MAX_TABLE_COLUMNS} columns with text, ${at(start)}`)
  if (tableCells(lines[start + 1]).length !== header.length) throw editorError(`Table separator must have ${header.length} columns to match the header, ${at(start + 1)}`)
  const cell = (text: string): Inline[] => (text ? markdownInlines(text) : [])
  const rows: Inline[][][] = []
  let i = start + 2
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cells = tableCells(lines[i])
    if (cells.length !== header.length) throw editorError(`Table row has ${cells.length} columns but the header has ${header.length}, ${at(i)}`)
    rows.push(cells.map(cell)); i++
  }
  if (!rows.length || rows.length > MAX_TABLE_ROWS) throw editorError(`Table must have 1–${MAX_TABLE_ROWS} rows under its header, ${at(start)}`)
  return { block: { type: 'table', header: header.map(cell), rows }, next: i }
}
/** A "Q:" or "A:" line (optionally bold) from the documented FAQ format starts a new paragraph. */
const qaLine = /^(?:\*{2,3}|\*)?[QA]:/
/** Restricted Markdown subset. Reject unhandled syntax rather than silently dropping it. */
export function markdownBlocks(source: string): Block[] {
  const result: Block[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  // The website renders the Title field as the page H1, so a leading
  // "# Title" line duplicates it and is dropped. Any other H1 is rejected.
  const first = lines.findIndex(line => line.trim())
  if (first >= 0 && /^#\s+\S/.test(lines[first].trim())) lines[first] = ''
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line)
    const imageLine = /^!\[([^\]]+)\]\(([^)]+)\)$/.exec(line)
    const list = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line)
    if (heading) { result.push({ type: 'heading', level: heading[1].length as 2 | 3, children: markdownInlines(heading[2]) }); i++; continue }
    if (imageLine) { if (!imageLine[1].trim() || imageLine[1].length > 500) throw editorError('Image alt must be 1–500 characters'); result.push({ type: 'image', src: mediaUrl(imageLine[2]), alt: imageLine[1] }); i++; continue }
    if (list) {
      const ordered = /^\d/.test(line)
      const items: Inline[][] = []
      while (i < lines.length) {
        const item = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(lines[i].trim())
        if (!item || /^\d/.test(lines[i].trim()) !== ordered) break
        items.push(markdownInlines(item[1])); i++
      }
      result.push({ type: 'list', ordered, items }); continue
    }
    if (line.startsWith('>')) {
      const quoted: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) { quoted.push(lines[i].trim().replace(/^>\s?/, '').trim()); i++ }
      result.push({ type: 'quote', children: markdownInlines(quoted.filter(Boolean).join(' ')) }); continue
    }
    if (line.startsWith('|')) { const table = markdownTable(lines, i); result.push(table.block); i = table.next; continue }
    if (/^(?:#|`|~|!\[|[-*](?:\s|$)|\d+\.(?:\s|$)|\s{4})/.test(line)) throw editorError(`Unsupported Markdown syntax on line ${i + 1}: "${snippet(line)}". Use ## or ### headings, - or 1. lists, > quotes, | pipe | tables | and ![alt text](image URL) images; the title belongs in the Title field, and #### headings and code are not supported.`)
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(?:#{2,3}\s|[-*]\s|\d+\.\s|!\[|>|\|)/.test(lines[i].trim()) && !(paragraph.length && qaLine.test(lines[i].trim()))) { paragraph.push(lines[i].trim()); i++ }
    result.push({ type: 'paragraph', children: markdownInlines(paragraph.join(' ')) })
  }
  return result
}
/** Sources from the Sources field, one per line; an invalid line is an editor error naming it. */
function parseSources(lines: string[]): Source[] {
  const sources = lines.map((line, index) => {
    const source = sourceLine(line)
    if (!source) throw editorError(`Sources line ${index + 1} ("${snippet(line)}") must be a link like - [ATO: Time limits on amendments](https://www.ato.gov.au/...).`)
    if (source.title.length > MAX_SOURCE_TITLE) throw editorError(`Source title on line ${index + 1} must be ${MAX_SOURCE_TITLE} characters or fewer.`)
    return { title: source.title, url: validLink(source.url) }
  })
  if (sources.length > MAX_SOURCES) throw editorError(`Use at most ${MAX_SOURCES} sources (currently ${sources.length}).`)
  return sources
}
export function reviewRequestedEvent(post: BlogPost, ideaId?: string): Record<string, unknown> {
  if (post.status !== 'review' || !post.clientConfirmed) throw new Error('Review must be confirmed for this client')
  const published = publishedEvent({ ...post, status: 'published' }, ideaId)
  return { ...published, event: 'review_requested' }
}

export function publishedEvent(post: BlogPost, ideaId?: string): Record<string, unknown> {
  const client = typeof post.client === 'number' ? post.client : post.client?.id
  if (!configuredClientId() || client !== configuredClientId() || !post.clientConfirmed || post.status !== 'published') throw new Error('Post is not approved for this client')
  // Report every missing field at once so editors are not sent round one save at a time.
  const missingSidebar = [!categories.includes(post.websiteCategory || '') && 'Website Category', !services.includes(post.websiteServiceSlug || '') && 'Website Service Slug'].filter(Boolean)
  const missing = [...missingSidebar, !post.publishedDate && 'Published Date', !post.author?.trim() && 'Author', !post.excerpt?.trim() && 'Excerpt', !post.readingTime?.trim() && 'Reading Time'].filter(Boolean)
  if (missing.length || !post.publishedDate) throw editorError(`Fill in ${missing.join(', ')} before sending for review or publishing.${missingSidebar.length ? ' Website Category and Website Service Slug are in the sidebar.' : ''}`)
  // A final "## Sources" section left in the body is sent as sources, shown below the author.
  const trailing = post.markdownContent?.trim() ? splitTrailingSources(post.markdownContent) : null
  // The website shows the FAQ section below the author profile, so it is sent separately.
  const faqSplit = post.markdownContent?.trim() ? splitFaqSection(trailing?.body ?? post.markdownContent) : null
  const blocks = post.markdownContent?.trim() ? markdownBlocks(faqSplit?.body ?? trailing?.body ?? post.markdownContent) : lexicalBlocks(post.content)
  const faqBlocks = faqSplit ? markdownBlocks(faqSplit.faq) : []
  const fieldLines = (post.sources ?? '').split('\n').map(line => line.trim()).filter(Boolean)
  const sources = parseSources(mergeSourceLines(fieldLines, trailing?.sourceLines ?? []))
  if (!blocks.length || blocks.length + faqBlocks.length > 300 || !blocks.some(block => block.type !== 'heading')) throw editorError('Article must have 1–300 supported blocks, including body content')
  const article = {
    slug: post.slug, title: post.title, excerpt: post.excerpt, category: post.websiteCategory,
    relatedServiceSlug: post.websiteServiceSlug, publishDate: post.publishedDate.slice(0, 10),
    readTime: post.readingTime, author: post.author, contentBlocks: blocks,
    ...(faqBlocks.length ? { faqBlocks } : {}),
    ...(sources.length ? { sources } : {}),
    ...(post.featuredImage ? { heroImage: image(post.featuredImage, post.featuredImageAlt || '').src, heroImageAlt: post.featuredImageAlt } : {}),
  }
  return { version: 1, event: 'published', postId: String(post.id), revision: post.websiteSyncRevision, ...(ideaId ? { ideaId } : {}), article }
}
