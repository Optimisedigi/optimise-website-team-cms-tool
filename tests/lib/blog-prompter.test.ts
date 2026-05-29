import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GLOBAL_BLOG_RULES,
  buildBlogPrompt,
  findCategoryTone,
  formatPromptList,
} from '@/lib/blog-prompter'

const baseFields = {
  blogIdea: 'Helpful SEO planning guide',
  titleIdea: 'How to plan SEO work',
  category: 'SEO',
  tag: 'SEO strategy',
  mainPoint: 'Prioritise commercially useful work.',
  keyPoints: 'Audit the site\nPrioritise fixes',
  primaryKeywords: 'seo planning\nseo strategy',
  secondaryKeywords: 'technical seo\ncontent planning',
  pointsToAvoid: 'Guarantees\nFake statistics',
  targetAudience: 'Business owners planning SEO investment.',
  supportingContent: 'Existing SEO service page\nRecent audit example',
}

describe('blog-prompter helpers', () => {
  it('converts newline points to bullet lines', () => {
    expect(formatPromptList('First point\nSecond point')).toBe('- First point\n- Second point')
  })

  it('does not double-prefix existing bullets or numbered list items', () => {
    expect(formatPromptList('- First\n* Second\n• Third\n1. Fourth\n2) Fifth')).toBe(
      '- First\n- Second\n- Third\n- Fourth\n- Fifth',
    )
  })

  it('includes global rules before client tone', () => {
    const prompt = buildBlogPrompt(baseFields, {
      globalBlogRules: 'Global rules win.',
      globalMarkdownRules: 'Markdown rules.',
      clientBlogTone: 'Warm but direct.',
    })

    expect(prompt.indexOf('## Global blog rules')).toBeLessThan(prompt.indexOf('## Client blog tone'))
    expect(prompt).toContain('Global rules win.')
    expect(prompt).toContain('Warm but direct.')
  })

  it('includes matching category tone only when category matches', () => {
    const rows = [
      { category: 'Paid Media', tone: 'Performance focused.' },
      { category: ' seo ', tone: 'Practical SEO consultant tone.' },
    ]

    expect(findCategoryTone(rows, 'SEO')).toBe('Practical SEO consultant tone.')
    expect(findCategoryTone(rows, 'CRO')).toBeNull()
  })

  it('fallback rules include no em dashes or en dashes', () => {
    const prompt = buildBlogPrompt(baseFields)

    expect(DEFAULT_GLOBAL_BLOG_RULES).toContain('Never use em dashes or en dashes')
    expect(prompt).toContain('Never use em dashes or en dashes')
  })
})
