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
      if (!body.clientId) {
        return NextResponse.json({ error: 'clientId is required to create a blog draft' }, { status: 400 })
      }

      const title = extractTitle(result.markdown)
      const doc = await payload.create({
        collection: 'blog-posts',
        data: {
          client: Number(body.clientId),
          clientConfirmed: true,
          title,
          slug: slugifyTitle(title),
          status: 'draft',
          publishedDate: new Date().toISOString(),
          markdownSource: result.markdown,
        },
        overrideAccess: true,
        draft: true,
      })
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
