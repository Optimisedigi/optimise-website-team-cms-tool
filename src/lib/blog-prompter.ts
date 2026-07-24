export interface BlogPrompterFields {
  blogIdea: string
  titleIdea: string
  category: string
  tag: string
  mainPoint: string
  keyPoints: string
  primaryKeywords: string
  secondaryKeywords: string
  pointsToAvoid: string
  targetAudience: string
  supportingContent: string
}

export interface BlogCategoryToneRow {
  category?: string | null
  tone?: string | null
}

export interface BlogPromptContext {
  clientName?: string | null
  servicePages?: string | null
  globalBlogRules?: string | null
  globalMarkdownRules?: string | null
  clientBlogTone?: string | null
  categoryBlogTone?: string | null
}

export const DEFAULT_SERVICES = `SEO: /services/seo
Google Ads: /services/google-ads
GEO: /services/ai-search-optimisation
CRO: /services/cro
Meta Ads: /services/facebook-ads
Integrated digital growth strategy: /services/integrated-digital-growth-strategy
AI automation: /services/ai-automation`

export const DEFAULT_GLOBAL_BLOG_RULES = `- Use Australian English spelling.
- Never use em dashes or en dashes.
- Keep writing clear, commercially grounded, and practical.
- Make sure the main point and required key points are clearly covered.
- Blog content exists to support SEO and topic authority.
- Blog content answers real user questions, not generic filler.
- Include estimated reading time in minutes and a TLDR at the start, formatted exactly as: > **TL;DR**
- Make it easy and enjoyable to read.
- Avoid thin or generic content.
- Write fully in markdown so it can be copied and pasted cleanly, including internal URLs.
- Add meta title under 90 characters, meta description under 160 characters and excerpt under 160 characters.
- Add relevant, non overlapping FAQs that reflect real search behaviour.
- Consider all primary and secondary keywords.
- Do not include anything listed in 'What are points I don't want to add'.
- Do not end the blog post with "Thanks," "Thank you," "Peter Tu," "Optimise Digital" or any sign-off. End naturally after the final paragraph, right before the FAQ section.`

export const DEFAULT_GLOBAL_MARKDOWN_RULES = `- Make sure you stick to this markdown formatting:
  - Bold: **text**
  - Italic: *text*
  - Bold + Italic: ***text***
  - H1 Title: # Heading
  - H2 Section: ## Heading
  - H3 Subsection: ### Heading
  - External Link: [descriptive anchor text](https://verified-url.com)
  - Internal Link: [descriptive anchor text](/verified-path-from-the-service-page-list)
  - Bullet List: - Item
  - Numbered List: 1. Item
  - Inline Code: \`code\`
  - Code Block: \`\`\` code \`\`\`
  - Blockquote: > Quote text
  - Line Break: empty line between paragraphs
  - FAQ Section: ## FAQ **Q: Question?** A: Answer...
- After every heading (## or ###), the very next line must be the opening paragraph or list with no blank line.
- Never insert a blank line immediately after a heading.
- Only insert a single blank line before the next heading.
- Bullet lists must start on the immediate next line after the introducing sentence with no blank line before the first bullet.
- After a bullet list ends, you may have one blank line before the next paragraph if needed, but keep overall spacing tight and compact.
- Do not create air gaps between sections.
- Follow this exact spacing example:

## Example heading
This paragraph sits directly under the heading with no blank line. Lists start immediately:
* Point one
* Point two

This paragraph can follow the list after one blank line only if required.

## Next heading
Continues the same tight rule.`

function valueOrFallback(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

function section(heading: string, value: string | null | undefined, note?: string): string | null {
  if (!value?.trim()) return null
  return `## ${heading}\n${note ? `${note}\n` : ''}${value.trim()}`
}

function listSection(heading: string, value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  return `## ${heading}\n${formatPromptList(value)}`
}

export function parsePromptLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean)
}

export function formatPromptList(text: string): string {
  return parsePromptLines(text).map((item) => `- ${item}`).join('\n')
}

export function findCategoryTone(
  rows: ReadonlyArray<BlogCategoryToneRow> | null | undefined,
  category: string | null | undefined,
): string | null {
  const target = category?.trim().toLowerCase()
  if (!target) return null

  const match = rows?.find((row) => row.category?.trim().toLowerCase() === target)
  const tone = match?.tone?.trim()
  return tone || null
}

export function buildServiceLinkingRequirements(servicePages?: string | null): string {
  const services = parsePromptLines(servicePages?.trim() || DEFAULT_SERVICES)
    .map((service) => `  - ${service}`)
    .join('\n')

  return `## Service and internal linking requirements
- Blog content should align with relevant business services or products.
- These are the only approved service or product pages for internal links:
${services}
- Use only the exact URLs listed above. Never guess, derive, or invent a URL from a service name.
- If an entry has no URL, mention the service without linking it.
- Add a link only where it is contextually useful.
- Do not add any internal links inside the TLDR section.
- Each unique URL should only be linked once in the entire blog post. Do not link multiple anchor texts to the same destination.
- If Facebook Ads, Instagram Ads, Meta Ads, and/or LinkedIn Ads share one supplied service URL, add only one link using "Meta Ads" as the anchor text.`
}

export function buildBlogPrompt(fields: BlogPrompterFields, context: BlogPromptContext = {}): string {
  const name = context.clientName?.trim() || 'Optimise Digital'
  const parts = [
    `# Blog content brief for ${name}`,
    `Write a blog post for ${name} using only the brief, global blog rules, and client tone below.`,
    section('Global blog rules', valueOrFallback(context.globalBlogRules, DEFAULT_GLOBAL_BLOG_RULES)),
    section('Global markdown formatting rules', valueOrFallback(context.globalMarkdownRules, DEFAULT_GLOBAL_MARKDOWN_RULES)),
    section('Client blog tone', context.clientBlogTone),
    section('Category-specific blog tone', context.categoryBlogTone),
    section('Blog Idea', fields.blogIdea),
    section('Title idea', fields.titleIdea),
    section('Category', fields.category, '(for internal use only)'),
    section('Tag', fields.tag),
    section('Main point of the content', fields.mainPoint),
    listSection('Primary keywords to include', fields.primaryKeywords),
    listSection('Secondary keywords to include', fields.secondaryKeywords),
    listSection('Key points that must be included', fields.keyPoints),
    listSection("What are points I don't want to add", fields.pointsToAvoid),
    section('Who is the target audience', fields.targetAudience),
    listSection('Content to support', fields.supportingContent),
    buildServiceLinkingRequirements(context.servicePages),
  ]

  return parts.filter(Boolean).join('\n\n')
}
