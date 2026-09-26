import type { BlogPost, Media } from '@/payload-types'
import { configuredClientId } from './config'

export type Inline = { text: string; bold?: boolean; italic?: boolean; link?: string }
export type Block = { type: 'heading'; level: 2 | 3; children: Inline[] } | { type: 'paragraph' | 'quote'; children: Inline[] } | { type: 'list'; ordered: boolean; items: Inline[][] } | { type: 'image'; src: string; alt: string; caption?: string; width?: number; height?: number }
const categories = ['tax-tips', 'business-handbook', 'contractor-handbook']
const services = ['accounting', 'taxation', 'tax-advisory', 'superfunds', 'business-accounting', 'business-advice', 'virtual-fractional-cfo', 'income-averaging', 'property-service', 'finance-financial-planning', 'creative-tax-deductions', 'entertainment-industry-accounting']

function mediaUrl(raw: string): string {
  const origin = process.env.CONTENT_CMS_PUBLIC_ORIGIN
  if (!origin) throw new Error('Public CMS media origin is not configured')
  const base = new URL(origin)
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.username || base.password || base.search || base.hash) throw new Error('Invalid public CMS media origin')
  const url = new URL(raw, base)
  if (url.origin !== base.origin || url.protocol !== 'https:' || url.username || url.password || !url.pathname.startsWith('/api/media/file/')) throw new Error('Image must use a public CMS media URL (Blob requires an explicitly reviewed website allowlist)')
  return url.toString()
}
function image(value: unknown, alt: string): Extract<Block, { type: 'image' }> {
  if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string' || !alt?.trim() || alt.length > 500) throw new Error('Image URL and descriptive alt (max 500 characters) are required')
  const media = value as Media
  if (media.mimeType && !media.mimeType.startsWith('image/')) throw new Error('Video cannot be published as an image')
  if ((media.width && media.width > 8192) || (media.height && media.height > 8192)) throw new Error('Image dimensions exceed website limit')
  return { type: 'image', src: mediaUrl(value.url), alt: alt.trim(), ...(media.width ? { width: media.width } : {}), ...(media.height ? { height: media.height } : {}) }
}
function validLink(link: string): string {
  if (link.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(link)) throw new Error('Invalid link')
  if (link.startsWith('/') && !link.startsWith('//')) return link
  const url = new URL(link)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid link')
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
      if (!Number.isInteger(format) || (format & ~3)) throw new Error('Unsupported text formatting')
      result.push({ text: node.text, ...(format & 1 ? { bold: true } : {}), ...(format & 2 ? { italic: true } : {}), ...(link ? { link } : {}) })
    } else if (node.type === 'link' && typeof asNode(node.fields).url === 'string') {
      result.push(...inlines(children(node.children), validLink(asNode(node.fields).url as string)))
    } else if (node.type === 'linebreak') result.push({ text: '\n', ...(link ? { link } : {}) })
    else throw new Error(`Unsupported inline node: ${String(node.type)}`)
  }
  if (!result.length || result.every(part => !part.text.trim())) throw new Error('Empty text block')
  return result
}
export function lexicalBlocks(value: unknown): Block[] {
  const root = asNode(asNode(value).root)
  const result: Block[] = []
  for (const node of children(root.children)) {
    if (node.type === 'heading') {
      if (node.tag !== 'h2' && node.tag !== 'h3') throw new Error('Only H2/H3 headings can be sent')
      result.push({ type: 'heading', level: node.tag === 'h2' ? 2 : 3, children: inlines(children(node.children)) })
    } else if (node.type === 'paragraph' || node.type === 'quote') {
      if (children(node.children).length) result.push({ type: node.type, children: inlines(children(node.children)) })
    } else if (node.type === 'list') {
      if (node.listType !== 'bullet' && node.listType !== 'number') throw new Error('Unsupported list')
      result.push({ type: 'list', ordered: node.listType === 'number', items: children(node.children).map(item => {
        if (item.type !== 'listitem') throw new Error('Unsupported list item')
        return inlines(children(item.children))
      }) })
    } else if (node.type === 'upload') {
      const fields = asNode(node.fields)
      result.push(image(node.value, typeof fields.alt === 'string' ? fields.alt : (node.value && typeof node.value === 'object' && 'alt' in node.value && typeof node.value.alt === 'string' ? node.value.alt : '')))
    } else throw new Error(`Unsupported rich text node: ${String(node.type)}`)
  }
  return result
}
function markdownInlines(text: string): Inline[] {
  const result: Inline[] = []
  const token = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let cursor = 0
  const addPlain = (part: string) => {
    if (/[\[\]`<>*_]|!\(/.test(part)) throw new Error('Unsupported Markdown syntax')
    if (part) result.push({ text: part })
  }
  for (const match of text.matchAll(token)) {
    addPlain(text.slice(cursor, match.index))
    const raw = match[0]
    if (raw.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(raw)
      if (!link) throw new Error('Invalid Markdown link')
      result.push({ text: link[1], link: validLink(link[2]) })
    } else if (raw.startsWith('**')) result.push({ text: raw.slice(2, -2), bold: true })
    else result.push({ text: raw.slice(1, -1), italic: true })
    cursor = match.index + raw.length
  }
  addPlain(text.slice(cursor))
  if (!result.length || result.every(part => !part.text.trim())) throw new Error('Empty Markdown block')
  return result
}
/** Restricted Markdown subset. Reject unhandled syntax rather than silently dropping it. */
export function markdownBlocks(source: string): Block[] {
  const result: Block[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line)
    const imageLine = /^!\[([^\]]+)\]\(([^)]+)\)$/.exec(line)
    const list = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line)
    if (heading) { result.push({ type: 'heading', level: heading[1].length as 2 | 3, children: markdownInlines(heading[2]) }); i++; continue }
    if (imageLine) { if (!imageLine[1].trim() || imageLine[1].length > 500) throw new Error('Image alt must be 1–500 characters'); result.push({ type: 'image', src: mediaUrl(imageLine[2]), alt: imageLine[1] }); i++; continue }
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
    if (/^(?:#|>|`|~|\||!\[|[-*](?:\s|$)|\d+\.(?:\s|$)|\s{4})/.test(line)) throw new Error('Unsupported Markdown syntax; review and convert to supported blocks')
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(?:#{2,3}\s|[-*]\s|\d+\.\s|!\[)/.test(lines[i].trim())) { paragraph.push(lines[i].trim()); i++ }
    result.push({ type: 'paragraph', children: markdownInlines(paragraph.join(' ')) })
  }
  return result
}
export function publishedEvent(post: BlogPost, ideaId?: string): Record<string, unknown> {
  const client = typeof post.client === 'number' ? post.client : post.client?.id
  if (!configuredClientId() || client !== configuredClientId() || !post.clientConfirmed || post.status !== 'published') throw new Error('Post is not approved for this client')
  if (!categories.includes(post.websiteCategory || '') || !services.includes(post.websiteServiceSlug || '')) throw new Error('Choose an approved website category and service')
  if (!post.readingTime?.trim() || !post.publishedDate || !post.author?.trim() || !post.excerpt?.trim()) throw new Error('Post needs date, byline, excerpt and reading time')
  const blocks = post.markdownContent?.trim() ? markdownBlocks(post.markdownContent) : lexicalBlocks(post.content)
  if (!blocks.length || blocks.length > 300 || !blocks.some(block => block.type !== 'heading')) throw new Error('Article must have 1–300 supported blocks, including body content')
  const article = {
    slug: post.slug, title: post.title, excerpt: post.excerpt, category: post.websiteCategory,
    relatedServiceSlug: post.websiteServiceSlug, publishDate: post.publishedDate.slice(0, 10),
    readTime: post.readingTime, author: post.author, contentBlocks: blocks,
    ...(post.featuredImage ? { heroImage: image(post.featuredImage, post.featuredImageAlt || '').src, heroImageAlt: post.featuredImageAlt } : {}),
  }
  return { version: 1, event: 'published', postId: String(post.id), revision: post.websiteSyncRevision, ...(ideaId ? { ideaId } : {}), article }
}
