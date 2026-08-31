/**
 * Weekly auto-triage classifier for phrase-match violations.
 *
 * Consumes the grounded one-sentence summaries from `search-term-research.ts`
 * and sorts each violating search term into one of four buckets so the human
 * review is a few bulk clicks instead of per-term research:
 *
 *   relevant_keyword — generic phrase, genuinely relevant to the ad group
 *   competitor       — a different company in the same trade as the client
 *   irrelevant       — not relevant, and not a competitor
 *   unclear          — inconclusive; no suggestion, manual review
 *
 * Nothing here is applied to Google Ads. The decision only pre-fills a
 * recommendation the user approves; a misjudged term must never silently block
 * live traffic.
 *
 * On unparseable model output this THROWS rather than inventing decisions. The
 * cron then leaves those rows untouched (`aiDecidedAt` stays NULL) so the next
 * weekly run retries them — a parse failure must never burn a row's only chance
 * at triage, and must never be recorded as `unclear`.
 */

import { callLLM } from '@/lib/agents/_shared/llm'
import { getOptiMateDefaultModels } from '@/lib/agents/_shared/optimate-default-models'

const FALLBACK_MODELS = ['claude-sonnet-5', 'minimax-m3']

// Each decision carries a reason sentence, so a full 60-row batch overflows the
// output budget mid-array and the reply parses to nothing. Chunk it: one bad
// chunk then costs only its own rows, and the rest still get decided.
const CHUNK_SIZE = 12

export const TRIAGE_BUCKETS = [
  'relevant_keyword',
  'competitor',
  'irrelevant',
  'unclear',
] as const

export type TriageBucket = (typeof TRIAGE_BUCKETS)[number]

export interface TriageRow {
  /** Candidate row id, echoed back on the decision. */
  id: string | number
  searchTerm: string
  campaignName?: string | null
  adGroupName?: string | null
  triggeringKeyword?: string | null
  nearestKeyword?: string | null
  /** Researched one-sentence description of the term. */
  summary?: string | null
  sourceTitle?: string | null
  sourceLink?: string | null
}

export interface TriageClientContext {
  name: string
  websiteUrl?: string | null
}

export interface TriageDecision {
  id: string | number
  decision: TriageBucket
  reason: string
  confidence: number
}

const SYSTEM_PROMPT = [
  'You triage Google Ads phrase-match search-term violations for a paid-search agency.',
  'For each row you get the search term, its ad group, the keyword that triggered it,',
  'and a researched one-sentence description of the term with its top Google result.',
  '',
  'Put every row in exactly one bucket:',
  '- "relevant_keyword": a generic phrase genuinely relevant to this ad group and this client\'s services. It should become an exact keyword.',
  '- "competitor": the term is a DIFFERENT company, and that company is in the same trade as the client (a genuine competitor).',
  '- "irrelevant": not relevant to the ad group and not a competitor. This includes companies in an unrelated trade.',
  '- "unclear": the research is inconclusive. Never guess.',
  '',
  'Rules:',
  '- Decide brand-vs-generic from the SEARCH TERM itself, not from whichever company happens to rank first for it. A generic phrase stays generic even if one brand dominates its results.',
  '- "competitor" requires BOTH: the term names a company other than the client, AND that company sells the same kind of service as the client. A different company in an unrelated trade is "irrelevant".',
  '- If the research says the term is unclear, or there were no results, return "unclear".',
  '- reason: ONE short sentence, plain English, explaining the bucket.',
  '- confidence: integer 0-100.',
  '',
  'Return ONLY a valid JSON array of {"id","decision","reason","confidence"} objects, no markdown fences, no prose.',
].join('\n')

/** Pull the first balanced JSON array out of a model reply, tolerating fences/prose. */
function extractJsonArray(text: string): unknown {
  const stripped = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(stripped)
  } catch {
    const start = stripped.indexOf('[')
    const end = stripped.lastIndexOf(']')
    if (start !== -1 && end > start) return JSON.parse(stripped.slice(start, end + 1))
    throw new Error('No JSON array found in model reply')
  }
}

function rowLine(row: TriageRow): string {
  const parts = [
    `- id: ${JSON.stringify(String(row.id))}`,
    `    search term: "${row.searchTerm}"`,
  ]
  if (row.campaignName) parts.push(`    campaign: ${row.campaignName}`)
  if (row.adGroupName) parts.push(`    ad group: ${row.adGroupName}`)
  if (row.triggeringKeyword) parts.push(`    triggered by keyword: ${row.triggeringKeyword}`)
  if (row.nearestKeyword) parts.push(`    nearest owned keyword: ${row.nearestKeyword}`)
  parts.push(`    research: ${row.summary?.trim() || 'no research available'}`)
  if (row.sourceTitle) parts.push(`    top result: ${row.sourceTitle}`)
  return parts.join('\n')
}

/**
 * Classify a batch of violation rows. Throws when the model returns nothing
 * parseable — callers must leave those rows undecided so they retry.
 */
export async function classifyViolations(input: {
  client: TriageClientContext
  rows: TriageRow[]
}): Promise<TriageDecision[]> {
  const { client, rows } = input
  if (rows.length === 0) return []

  if (rows.length > CHUNK_SIZE) {
    const decisions: TriageDecision[] = []
    let lastError: unknown = null
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      try {
        decisions.push(...(await classifyViolations({ client, rows: rows.slice(i, i + CHUNK_SIZE) })))
      } catch (err) {
        // Rows in a failed chunk are simply not returned, so the caller leaves
        // them undecided and next week's run retries them.
        lastError = err
      }
    }
    if (decisions.length === 0) throw lastError ?? new Error('Triage returned no usable decisions')
    return decisions
  }

  const userMessage = [
    `Client: ${client.name}${client.websiteUrl ? ` (${client.websiteUrl})` : ''}`,
    'Judge "competitor" relative to THIS client\'s trade.',
    '',
    'Rows:',
    ...rows.map(rowLine),
  ].join('\n')

  const defaults = await getOptiMateDefaultModels()
  const model = defaults.searchTermResearchModel ?? defaults.defaultAutonomousModel
  const response = await callLLM({
    model,
    fallbackModels: FALLBACK_MODELS,
    maxTokens: 6000,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'text', text: userMessage }] }],
  })

  const text = response.message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim()

  const parsed = extractJsonArray(text)
  if (!Array.isArray(parsed)) throw new Error('Triage model reply was not a JSON array')

  const byId = new Map(rows.map((r) => [String(r.id), r]))
  const decisions: TriageDecision[] = []
  const seen = new Set<string>()
  for (const raw of parsed) {
    const id = String((raw as { id?: unknown })?.id ?? '')
    const decision = String((raw as { decision?: unknown })?.decision ?? '') as TriageBucket
    if (!byId.has(id) || seen.has(id)) continue
    if (!TRIAGE_BUCKETS.includes(decision)) continue
    seen.add(id)
    const rawConfidence = Number((raw as { confidence?: unknown })?.confidence)
    decisions.push({
      id: byId.get(id)!.id,
      decision,
      reason: String((raw as { reason?: unknown })?.reason ?? '').trim(),
      confidence: Number.isFinite(rawConfidence)
        ? Math.max(0, Math.min(100, Math.round(rawConfidence)))
        : 0,
    })
  }

  if (decisions.length === 0) throw new Error('Triage model returned no usable decisions')
  return decisions
}
