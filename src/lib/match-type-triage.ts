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

/**
 * Below this the model's own stated confidence is not worth acting on, so the
 * row is forced to `unclear` instead of shown as a suggestion. The score is
 * self-reported, not calibrated — which is exactly why a confident-sounding but
 * genuinely ambiguous term ('tech agency': dev shop? IT reseller? recruiter?)
 * must not reach the reviewer as a recommendation.
 */
export const MIN_CONFIDENCE = 75

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
  /** Who the client sells to, from the client record. */
  idealCustomer?: string | null
  /** Work the client does NOT do; a match forces `irrelevant`. One per line. */
  exclusions?: string | null
}

/** A real ad group from the live account structure a term could be routed to. */
export interface TriageAdGroup {
  adGroupName: string
  campaignName: string
}

export interface TriageDecision {
  id: string | number
  decision: TriageBucket
  reason: string
  confidence: number
  /**
   * A better-fitting ad group than the one that triggered the violation. Only
   * ever a name the caller supplied — anything invented is discarded.
   */
  suggestedAdGroup?: string | null
}

const SYSTEM_PROMPT = [
  'You triage Google Ads phrase-match search-term violations for a paid-search agency.',
  'For each row you get the search term, its ad group, the keyword that triggered it,',
  'and a researched one-sentence description of the term with its top Google result.',
  '',
  'Put every row in exactly one bucket:',
  '- "relevant_keyword": a generic phrase genuinely relevant to this ad group and this client\'s services. It should become an exact keyword.',
  '- "competitor": the term is a DIFFERENT company, and that company is in the same trade as the client (a genuine competitor).',
  '- "irrelevant": not relevant to the ad group and not a competitor. This includes companies in an unrelated trade, AND anything matching the client\'s EXCLUDED WORK.',
  '- "unclear": the research is inconclusive, OR the term has more than one plausible meaning and you cannot tell which is intended. Never guess.',
  '',
  'Rules:',
  '- Decide brand-vs-generic from the SEARCH TERM itself, not from whichever company happens to rank first for it. A generic phrase stays generic even if one brand dominates its results.',
  '- "competitor" requires BOTH: the term names a company other than the client, AND that company sells the same kind of service as the client. A different company in an unrelated trade is "irrelevant".',
  '- EXCLUDED WORK overrides relevance. If the term describes work the client does not do, it is "irrelevant" even when it sits in a matching ad group and reads as on-topic.',
  '- A term with several plausible trades behind it (e.g. an agency that could be recruitment, software, or marketing) is "unclear", not "relevant_keyword". Do not resolve the ambiguity by guessing the most common reading.',
  '- confidence: integer 0-100, and be honest. Score below 75 whenever the term is ambiguous or the evidence is thin; low scores are expected and useful.',
  '- reason: ONE short sentence, plain English, explaining the bucket.',
  '',
  'Ad group routing (only for "relevant_keyword"):',
  '- You are given the client\'s real ad groups. If one of them fits the term better than the ad group that triggered it, set "suggestedAdGroup" to that EXACT name from the list.',
  '- Match on the SUBJECT of the term: a term about software/developers/IT belongs in a developer or IT group, not a generic one, even when the generic group also mentions the same country.',
  '- Copy the name character-for-character from the list. Never invent a name. If no listed group fits better than the current one, omit "suggestedAdGroup".',
  '',
  'Return ONLY a valid JSON array of {"id","decision","reason","confidence","suggestedAdGroup"} objects, no markdown fences, no prose.',
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
  /** Real ad groups the term may be routed to. Anything outside this list is rejected. */
  adGroups?: TriageAdGroup[]
}): Promise<TriageDecision[]> {
  const { client, rows, adGroups = [] } = input
  if (rows.length === 0) return []

  if (rows.length > CHUNK_SIZE) {
    const decisions: TriageDecision[] = []
    let lastError: unknown = null
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      try {
        decisions.push(
          ...(await classifyViolations({ client, adGroups, rows: rows.slice(i, i + CHUNK_SIZE) })),
        )
      } catch (err) {
        // Rows in a failed chunk are simply not returned, so the caller leaves
        // them undecided and next week's run retries them.
        lastError = err
      }
    }
    if (decisions.length === 0) throw lastError ?? new Error('Triage returned no usable decisions')
    return decisions
  }

  const exclusions = (client.exclusions ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*\s]+/, '').trim())
    .filter(Boolean)

  const userMessage = [
    `Client: ${client.name}${client.websiteUrl ? ` (${client.websiteUrl})` : ''}`,
    'Judge "competitor" relative to THIS client\'s trade.',
    ...(client.idealCustomer?.trim()
      ? ['', `Who this client serves: ${client.idealCustomer.trim()}`]
      : []),
    ...(exclusions.length > 0
      ? [
          '',
          'EXCLUDED WORK — the client does NOT do these. A term describing any of them is "irrelevant":',
          ...exclusions.map((line) => `- ${line}`),
        ]
      : []),
    ...(adGroups.length > 0
      ? [
          '',
          'The client\'s real ad groups (copy a name EXACTLY if one fits better):',
          ...adGroups.map((g) => `- ${g.adGroupName}  (campaign: ${g.campaignName})`),
        ]
      : []),
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
  // Case-insensitive lookup, but the STORED name is the account's own spelling,
  // so downstream ad-group matching stays exact.
  const adGroupByName = new Map(adGroups.map((g) => [g.adGroupName.toLowerCase(), g.adGroupName]))
  const decisions: TriageDecision[] = []
  const seen = new Set<string>()
  for (const raw of parsed) {
    const id = String((raw as { id?: unknown })?.id ?? '')
    const decision = String((raw as { decision?: unknown })?.decision ?? '') as TriageBucket
    if (!byId.has(id) || seen.has(id)) continue
    if (!TRIAGE_BUCKETS.includes(decision)) continue
    seen.add(id)
    const row = byId.get(id)!
    const rawConfidence = Number((raw as { confidence?: unknown })?.confidence)
    const confidence = Number.isFinite(rawConfidence)
      ? Math.max(0, Math.min(100, Math.round(rawConfidence)))
      : 0

    // A hallucinated ad group would silently send keywords to the wrong place,
    // so only a name that exists in the account survives. Routing to the group
    // the term already sits in is not a suggestion.
    const rawSuggested = String((raw as { suggestedAdGroup?: unknown })?.suggestedAdGroup ?? '').trim()
    const resolved = rawSuggested ? adGroupByName.get(rawSuggested.toLowerCase()) : undefined
    const suggestedAdGroup =
      resolved && resolved.toLowerCase() !== String(row.adGroupName ?? '').toLowerCase()
        ? resolved
        : null

    // A self-rated score this low means "I am guessing"; show it as unclear
    // rather than as a recommendation the reviewer might trust.
    const belowBar = decision !== 'unclear' && confidence < MIN_CONFIDENCE

    decisions.push({
      id: row.id,
      decision: belowBar ? 'unclear' : decision,
      reason: belowBar
        ? `Too uncertain to recommend (${confidence}%): ${String((raw as { reason?: unknown })?.reason ?? '').trim()}`
        : String((raw as { reason?: unknown })?.reason ?? '').trim(),
      confidence,
      ...(belowBar ? {} : { suggestedAdGroup }),
    })
  }

  if (decisions.length === 0) throw new Error('Triage model returned no usable decisions')
  return decisions
}
