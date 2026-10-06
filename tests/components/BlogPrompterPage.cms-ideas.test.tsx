import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import BlogPrompterPage from '@/components/BlogPrompterPage'

// VoiceField pulls in browser speech APIs; a plain textarea is enough here.
vi.mock('@/components/VoiceField', () => ({
  default: ({
    value,
    onChange,
    placeholder,
    ariaLabel,
  }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    ariaLabel?: string
  }) => (
    <textarea
      aria-label={ariaLabel ?? placeholder ?? 'field'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

const CLIENT_ID = '42'
const websiteIdea = {
  id: 55,
  priority: 1,
  blogIdea: 'Website CMS idea',
  suggestedTitle: 'Suggested title',
  mainPoint: '',
  keyPoints: '',
  pointsToAvoid: '',
  supportingContent: '',
  status: 'open',
  publishedSlug: '',
}
const topicBrief = {
  id: 7,
  blogIdea: 'Assigned topic brief',
  titleIdea: 'Brief title',
  category: '',
  tag: '',
  mainPoint: '',
  keyPoints: '',
  primaryKeywords: '',
  secondaryKeywords: '',
  pointsToAvoid: '',
  targetAudience: '',
  supportingContent: '',
  generatedPrompt: '',
  source: 'topic-clusters',
  workflowStatus: 'idea_phase',
  client: CLIENT_ID,
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
}

function bootResponse(url: string) {
  if (url.startsWith('/api/clients/list')) {
    return jsonResponse([
      {
        id: Number(CLIENT_ID),
        name: 'In The Picture',
        blogCategories: '',
        blogTags: '',
        servicePages: '',
        blogTone: '',
      },
    ])
  }
  if (url.startsWith('/api/blog-settings')) {
    return jsonResponse({ globalBlogRules: '', globalMarkdownRules: '' })
  }
  if (url.startsWith('/api/blog-prompts')) return jsonResponse({ docs: [topicBrief] })
  if (url.startsWith('/api/blog-ideas')) return jsonResponse({ docs: [websiteIdea] })
  return jsonResponse({})
}

async function renderWithClient() {
  render(<BlogPrompterPage />)
  await act(async () => {
    await Promise.resolve()
  })
  fireEvent.change(screen.getByLabelText('Client'), { target: { value: CLIENT_ID } })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  fireEvent.click(screen.getByRole('button', { name: /Proposed blog ideas/ }))
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = vi.fn((url: string) => bootResponse(url)) as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BlogPrompterPage proposed ideas backlog', () => {
  it("lists the selected client's website CMS ideas alongside their proposed briefs", async () => {
    await renderWithClient()

    expect(screen.getByRole('button', { name: 'Website CMS idea' })).toBeTruthy()
    expect(screen.getByText('From client CMS')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Assigned topic brief' })).toBeTruthy()
  })

  it('hides delete for website CMS ideas (the website owns them) but keeps it for saved briefs', async () => {
    await renderWithClient()

    expect(screen.queryByRole('button', { name: 'Delete Website CMS idea' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete Assigned topic brief' })).toBeTruthy()
  })

  it("requests only the selected client's ideas and briefs", async () => {
    await renderWithClient()

    const urls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url]) =>
      String(url),
    )
    expect(urls).toContain(`/api/blog-prompts?clientId=${CLIENT_ID}`)
    expect(urls).toContain(`/api/blog-ideas?clientId=${CLIENT_ID}`)
    expect(urls.filter((url) => url.includes('blog-prompts?clientId='))).toHaveLength(1)
    expect(urls.filter((url) => url.includes('blog-ideas?clientId='))).toHaveLength(1)
  })
})
