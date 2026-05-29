import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { headers as nextHeaders } from 'next/headers'
import config from '@/payload.config'
import { DEFAULT_GLOBAL_BLOG_RULES, DEFAULT_GLOBAL_MARKDOWN_RULES } from '@/lib/blog-prompter'

function settingOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

export async function GET(): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config })
    const headersList = await nextHeaders()
    const { user } = await payload.auth({ headers: headersList })
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await payload.findGlobal({ slug: 'blog-settings' })

    return NextResponse.json({
      globalBlogRules: settingOrFallback(settings?.globalBlogRules, DEFAULT_GLOBAL_BLOG_RULES),
      globalMarkdownRules: settingOrFallback(settings?.globalMarkdownRules, DEFAULT_GLOBAL_MARKDOWN_RULES),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load blog settings'
    console.error('[blog-settings] error:', message)
    return NextResponse.json({ error: 'Failed to load blog settings' }, { status: 500 })
  }
}
