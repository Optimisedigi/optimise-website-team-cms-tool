import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { headers as nextHeaders } from 'next/headers'
import config from '@/payload.config'
import { callLLM } from '@/lib/agents/_shared/llm'
import { getOptiMateDefaultModels } from '@/lib/agents/_shared/optimate-default-models'
import { DEFAULT_AUTONOMOUS_FALLBACKS } from '@/lib/agents/_shared/llm/registry'
import { DEFAULT_GLOBAL_BLOG_RULES, DEFAULT_GLOBAL_MARKDOWN_RULES } from '@/lib/blog-prompter'

const MAX_PROMPT_LENGTH = 30000

interface GenerateBlogBody {
  prompt?: string
  clientId?: string | number
  blogPromptId?: string | number
  createDraft?: boolean
  category?: string
  tag?: string
}

function settingOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function extractText(response: Awaited<ReturnType<typeof callLLM>>): string {
  return response.message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim()
}

function extractTitle(markdown: string): string {
  const frontmatterTitle = markdown.match(/^title:\s*(.+)$/im)?.[1]?.trim()
  if (frontmatterTitle) return frontmatterTitle.replace(/^['"]|['"]$/g, '').slice(0, 160)
  const h1Title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (h1Title) return h1Title.slice(0, 160)
  return 'Generated blog draft'
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || `generated-blog-${Date.now().toString(36)}`
}

function stripStatusMetadata(markdown: string): string {
  const trimmed = markdown.trim()
  const frontmatter = trimmed.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (frontmatter) {
    const cleanedFrontmatter = frontmatter[1]
      .split('\n')
      .filter((line) => !/^status\s*:/i.test(line.trim()))
      .join('\n')
      .trim()
    return cleanedFrontmatter ? `---\n${cleanedFrontmatter}\n---\n${frontmatter[2].trimStart()}` : frontmatter[2].trimStart()
  }

  const lines = markdown.split('\n')
  let inTopMetadata = true
  return lines
    .filter((line, index) => {
      if (index > 20 || (!/^([A-Za-z][A-Za-z\s_-]*?):\s*(.+)$/.test(line) && line.trim() !== '')) {
        inTopMetadata = false
      }
      return !(inTopMetadata && /^status\s*:/i.test(line.trim()))
    })
    .join('\n')
    .trim()
}

function isHeading(line: string): boolean {
  return /^#{2,3}\s+/.test(line.trim())
}

function isListItem(line: string): boolean {
  return /^(?:[-*+]\s+|\d+[.)]\s+)/.test(line.trim())
}

function isFence(line: string): boolean {
  return /^```/.test(line.trim())
}

function normaliseBlogMarkdown(markdown: string): string {
  const lines = stripStatusMetadata(markdown).replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let inFence = false
  let previousWasListItem = false

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const blank = line.trim() === ''

    if (isFence(line)) {
      inFence = !inFence
      out.push(line)
      previousWasListItem = false
      continue
    }

    if (inFence) {
      out.push(rawLine)
      continue
    }

    if (blank) {
      if (previousWasListItem && out[out.length - 1] !== '') out.push('')
      continue
    }

    if (isHeading(line)) {
      while (out[out.length - 1] === '') out.pop()
      if (out.length > 0) out.push('')
      out.push(line.trim())
      previousWasListItem = false
      continue
    }

    out.push(line.trim())
    previousWasListItem = isListItem(line)
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function firstAuthorName(client: unknown): string {
  const authors = (client && typeof client === 'object' ? (client as { authors?: unknown }).authors : undefined)
  if (!Array.isArray(authors)) return 'Optimise Digital'

  const first = authors.find((author) => {
    return author && typeof author === 'object' && typeof (author as { name?: unknown }).name === 'string' && (author as { name: string }).name.trim()
  }) as { name: string } | undefined

  return first?.name.trim() || 'Optimise Digital'
}

function buildSystemPrompt(globalBlogRules: string, globalMarkdownRules: string): string {
  return [
    'You are an SEO blog writer. Return only the complete markdown file. No commentary.',
    'Global blog rules are mandatory. Client/category tone applies only where it does not conflict with global rules.',
    'Never use em dashes or en dashes.',
    '',
    'Global blog rules:',
    globalBlogRules,
    '',
    'Global markdown formatting rules:',
    globalMarkdownRules,
  ].join('\n')
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config })
    const headersList = await nextHeaders()
    const { user } = await payload.auth({ headers: headersList })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: GenerateBlogBody
    try {
      body = (await request.json()) as GenerateBlogBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const prompt = body.prompt?.trim()
    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: 'Prompt is too long' }, { status: 413 })
    }

    let selectedClient: unknown
    if (body.createDraft) {
      if (!body.clientId) {
        return NextResponse.json({ error: 'clientId is required to create a blog draft' }, { status: 400 })
      }

      selectedClient = await payload.findByID({
        collection: 'clients',
        id: String(body.clientId),
        depth: 0,
        overrideAccess: true,
      })
    }

    const settings = await payload.findGlobal({ slug: 'blog-settings', overrideAccess: true })
    const globalBlogRules = settingOrFallback(settings?.globalBlogRules, DEFAULT_GLOBAL_BLOG_RULES)
    const globalMarkdownRules = settingOrFallback(settings?.globalMarkdownRules, DEFAULT_GLOBAL_MARKDOWN_RULES)
    const { defaultAutonomousModel, blogPrompterModel } = await getOptiMateDefaultModels(payload)

    const runGeneration = async (model: typeof defaultAutonomousModel, useFallbackChain: boolean) => {
      const response = await callLLM({
        model,
        ...(useFallbackChain ? { fallbackModels: DEFAULT_AUTONOMOUS_FALLBACKS } : {}),
        maxTokens: 12000,
        temperature: 0.7,
        system: buildSystemPrompt(globalBlogRules, globalMarkdownRules),
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      })
      const markdown = extractText(response)
      if (!markdown) {
        throw new Error(`Model ${response.model} returned empty markdown.`)
      }
      return { markdown, model: response.model }
    }

    let result: Awaited<ReturnType<typeof runGeneration>>
    let warning: string | undefined
    if (blogPrompterModel && blogPrompterModel !== defaultAutonomousModel) {
      try {
        result = await runGeneration(blogPrompterModel, false)
      } catch (err) {
        warning = `Blog Prompter AI model ${blogPrompterModel} failed (${(err as Error).message}); fell back to autonomous default ${defaultAutonomousModel}.`
        console.warn('[blog-prompts/generate-blog]', warning)
        result = await runGeneration(defaultAutonomousModel, true)
      }
    } else {
      result = await runGeneration(defaultAutonomousModel, true)
    }

    let draft: { id: string | number; title: string; adminUrl: string } | undefined
    if (body.createDraft) {
      const markdown = normaliseBlogMarkdown(result.markdown)
      result = { ...result, markdown }
      const title = extractTitle(markdown)
      const data: Record<string, unknown> = {
        client: body.clientId,
        clientConfirmed: false,
        title,
        slug: slugifyTitle(title),
        status: 'draft',
        author: firstAuthorName(selectedClient),
        publishedDate: new Date().toISOString(),
        markdownSource: markdown,
      }
      if (body.category?.trim()) data.category = body.category.trim()
      if (body.tag?.trim()) data.tags = [body.tag.trim()]

      const doc = await payload.create({
        collection: 'blog-posts',
        data,
        overrideAccess: true,
        draft: true,
      })

      if (body.blogPromptId) {
        await payload.update({
          collection: 'blog-prompts',
          id: String(body.blogPromptId),
          data: {
            workflowStatus: 'in_progress',
            blogPost: doc.id,
          },
          overrideAccess: true,
        })
      }

      draft = {
        id: doc.id,
        title: String(doc.title || title),
        adminUrl: `/admin/collections/blog-posts/${doc.id}`,
      }
    }

    return NextResponse.json({ ok: true, ...result, draft, warning })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Blog generation failed'
    console.error('[blog-prompts/generate-blog] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
