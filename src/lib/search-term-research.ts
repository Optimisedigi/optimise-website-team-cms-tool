/**
 * Search-term research for the Match Type Violations review.
 *
 * Given a batch of unfamiliar search terms, this grounds each one in its top
 * Google result (via Growth Tools' `/api/serp/top-results`, which owns the
 * Serper key) and asks the LLM to compress that into a single sentence
 * describing what the company/business/thing actually is — so a reviewer can
 * tell brand/competitor drift from genuine intent without manually
 * copy-pasting every term into Google.
 *
 * Grounding is best-effort: if Growth Tools is unreachable or its Serper key is
 * missing, the summary falls back to the model's own knowledge and `grounded`
 * is false.
 */

const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1'
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2-0905-preview'

export interface TermResearchSource {
  title: string
  link: string
  snippet: string
}

export interface TermResearchResult {
  term: string
  summary: string
  grounded: boolean
  source: TermResearchSource | null
}

export interface TermResearchResponse {
  /** True when live Google grounding was available (Growth Tools' Serper key is set). */
  grounded: boolean
  results: TermResearchResult[]
}

interface GroundedTerm {
  term: string
  source: TermResearchSource | null
  knowledgeGraph: {
    title?: string
    type?: string
    description?: string
    website?: string
  } | null
}

interface TopResultsResponse {
  results?: Array<{
    term?: string
    source?: { title?: string; link?: string; snippet?: string } | null
    knowledgeGraph?: GroundedTerm['knowledgeGraph']
  }>
  configured?: boolean
}

/**
 * Ground a batch of terms in their top Google result via Growth Tools, which
 * holds the Serper key. Returns ungrounded stubs if Growth Tools is not
 * configured or the call fails, so summarisation can still run.
 */
async function fetchTopResults(terms: string[]): Promise<{ grounded: GroundedTerm[]; configured: boolean }> {
  const stub = terms.map((term) => ({ term, source: null, knowledgeGraph: null }))
  const fallback = () => ({ grounded: stub, configured: false })

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    console.error('[search-term-research] GROWTH_TOOLS_URL or INTERNAL_API_KEY not set')
    return fallback()
  }

  try {
    const res = await fetch(`${GROWTH_TOOLS_URL}/api/serp/top-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_API_KEY },
      body: JSON.stringify({ terms }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) {
      console.error(`[search-term-research] Growth Tools ${res.status}: ${await res.text().catch(() => '')}`)
      return fallback()
    }
    const data: TopResultsResponse = await res.json()
    const byTerm = new Map<string, GroundedTerm>()
    for (const row of data.results ?? []) {
      const term = typeof row?.term === 'string' ? row.term : ''
      if (!term) continue
      const link = row.source?.link
      byTerm.set(term.toLowerCase(), {
        term,
        source: link ? { title: row.source?.title ?? term, link, snippet: row.source?.snippet ?? '' } : null,
        knowledgeGraph: row.knowledgeGraph ?? null,
      })
    }
    // Preserve input order and fill any terms Growth Tools omitted.
    const grounded = terms.map((term) => byTerm.get(term.toLowerCase()) ?? { term, source: null, knowledgeGraph: null })
    return { grounded, configured: data.configured !== false }
  } catch (err) {
    console.error('[search-term-research] Growth Tools top-results failed:', err)
    return fallback()
  }
}

/** Build the compact grounding context handed to the LLM for one term. */
function groundingLine(g: GroundedTerm): string {
  const parts: string[] = []
  if (g.knowledgeGraph?.title || g.knowledgeGraph?.description) {
    const kg = g.knowledgeGraph
    parts.push(
      `knowledge panel: ${[kg?.title, kg?.type, kg?.description, kg?.website].filter(Boolean).join(' — ')}`,
    )
  }
  if (g.source) {
    parts.push(`top result: ${g.source.title} (${g.source.link})`)
    if (g.source.snippet) parts.push(`snippet: ${g.source.snippet}`)
  }
  return parts.length > 0 ? parts.join('\n    ') : 'no search results found'
}

/** Ask the LLM to compress grounded context into one sentence per term. */
async function summariseGroundedTerms(grounded: GroundedTerm[]): Promise<Map<string, string>> {
  const summaries = new Map<string, string>()
  const apiKey = process.env.KIMI_API_KEY
  if (!apiKey || grounded.length === 0) return summaries

  const systemPrompt = [
    'You explain unfamiliar Google Ads search terms to a paid-search analyst.',
    'For each search term you are given its top Google result and/or knowledge panel.',
    'Return ONE plain sentence saying what the company, business, brand, or thing is —',
    'e.g. "A UK accountancy firm based in Leeds" or "A generic phrase for outsourced bookkeeping, not a specific brand".',
    'If it is clearly a competitor or unrelated brand, say so. If the results are empty or ambiguous, say it is unclear.',
    'Do not add advice, prefixes, or quotes. Return ONLY a valid JSON array, no markdown fences.',
  ].join('\n')

  const userMessage = [
    'Summarise each of these search terms as one sentence. Return a JSON array of {"term","summary"} objects.',
    '',
    ...grounded.map((g) => `- term: "${g.term}"\n    ${groundingLine(g)}`),
  ].join('\n')

  try {
    const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      console.error(`[search-term-research] Kimi ${res.status}: ${await res.text().catch(() => '')}`)
      return summaries
    }
    const data = await res.json()
    const text: string = data.choices?.[0]?.message?.content?.trim() || ''
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '')
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) {
      for (const row of parsed) {
        const term = typeof row?.term === 'string' ? row.term : ''
        const summary = typeof row?.summary === 'string' ? row.summary.trim() : ''
        if (term && summary) summaries.set(term.toLowerCase(), summary)
      }
    }
  } catch (err) {
    console.error('[search-term-research] Kimi summarisation failed:', err)
  }
  return summaries
}

/**
 * Research a batch of search terms. Deduplicates, grounds each in its top
 * Google result, and returns a one-sentence summary per unique term.
 */
export async function researchSearchTerms(rawTerms: string[]): Promise<TermResearchResponse> {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of rawTerms) {
    const term = String(raw ?? '').trim()
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    terms.push(term)
  }
  if (terms.length === 0) return { grounded: false, results: [] }

  const { grounded, configured } = await fetchTopResults(terms)
  const summaries = await summariseGroundedTerms(grounded)

  const results = grounded.map((g) => {
    const summary = summaries.get(g.term.toLowerCase())
    return {
      term: g.term,
      summary: summary || 'No summary available — the AI summariser is unavailable or returned nothing for this term.',
      grounded: Boolean(g.source || g.knowledgeGraph),
      source: g.source,
    }
  })

  return { grounded: configured, results }
}
