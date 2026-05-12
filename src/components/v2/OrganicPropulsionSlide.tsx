/**
 * Slide 16 — Organic propulsion (Fueling the Ship · Stage 1). Dynamic.
 *
 * Left column: four-stage explainer (cluster maps → pillar pages → supporting
 * articles → FAQ/schema).
 * Right column: one collapsible card per keyword category. Each card shows
 * the category name and a question count; hovering (or keyboard-focusing) the
 * card expands a panel revealing the real customer questions pulled from
 * content-research, sorted by search volume.
 *
 * Hover-expand is pure CSS so the slide stays a server component.
 */

import type { ReactElement } from 'react'

type ContentQuestion = {
  question?: string | null
  source?: string | null
  modifier?: string | null
  searchVolume?: number | null
}

type ContentCluster = {
  label?: string | null
  questions?: ContentQuestion[] | null
}

type ContentResearchLike = {
  keyword?: string | null
  clusters?: ContentCluster[] | null
}

type KeywordCategory = {
  categoryName?: string | null
  // Stored as a textarea — one keyword per line.
  keywords?: string | null
}

type ResolvedQuestion = { question: string; volume: number; isQuestion: boolean }
type CategoryBucket = {
  name: string
  index: number
  questions: ResolvedQuestion[]
}

const QUESTIONS_PER_CATEGORY = 6

// Modifiers that produce genuine questions rather than keyword variants.
// Matches the QUESTION_MODIFIERS list in growth-tools/autocomplete-service.ts.
const INTERROGATIVE_MODIFIERS = new Set([
  'what', 'why', 'how', 'when', 'where', 'who', 'which',
  'can', 'does', 'is', 'are', 'will', 'should', 'do',
])

// ── Exclusion lists ──────────────────────────────────────────────────────────
// Any question containing one of these terms (whole-word or substring as noted)
// is excluded. Keeps the customer-questions panel focused on genuine content
// strategy questions rather than keyword variants, transactional intent, or
// job-seeking queries.

// Job / recruitment intent.
const JOB_TERMS = [
  'jobs', 'job', 'hiring', 'vacancy', 'vacancies', 'careers', 'career',
  'recruitment', 'recruiter', 'resume', 'cv', 'salary', 'salaries',
  'employment', 'apply', 'opening', 'openings', 'internship', 'intern',
  'apprentice', 'apprenticeship', 'graduate program', 'role', 'roles',
  'traineeship', 'trainee', 'part time', 'part-time', 'full time', 'full-time',
  'casual work', 'work from home', 'remote work', 'wfh', 'work experience',
  'entry level', 'entry-level', 'junior', 'senior position', 'job description',
]

// Proximity / local-intent modifiers — these produce "X near me" variants
// that are keyword research, not content questions.
const PROXIMITY_TERMS = [
  'near me', 'near by', 'nearby', 'close to me', 'close by', 'around me',
  'in my area', 'in my city', 'local', 'closest',
]

// Transactional/pricing intent is intentionally NOT excluded — pricing
// content ("how much does an accountant cost", "tax return fees") is
// genuinely useful for SEO and content strategy.
const TRANSACTIONAL_TERMS: string[] = []

// Review / comparison / ranking intent.
const COMPARISON_TERMS = [
  'best', 'top 10', 'top 5', 'top rated', 'reviews', 'review',
  'vs ', ' vs', 'versus', 'compare', 'alternatives', 'alternative to',
  'competitor', 'competitors', 'recommended', 'ranking', 'rankings',
  'award', 'awards', 'rated',
]

// App / account / login intent — not content-strategy questions.
const PLATFORM_TERMS = [
  'login', 'log in', 'sign in', 'sign up', 'register', 'portal',
  'download', 'app ', 'software', 'tool', 'tools', 'calculator',
  'template', 'templates', 'spreadsheet', 'checklist',
]

// Alphabet-expansion modifiers from autocomplete service (alpha:a … alpha:z).
// These are never genuine questions.
const ALPHA_MODIFIER_PREFIX = 'alpha:'

// All country/city names keyed by location-code prefix.
// When the proposal's location starts with a given prefix, every OTHER
// entry's terms become foreign and are excluded from question results.
const LOCATION_TERMS: Record<string, string[]> = {
  au: [
    'australia', 'australian', 'sydney', 'melbourne', 'brisbane', 'perth',
    'adelaide', 'canberra', 'hobart', 'darwin', 'gold coast', 'sunshine coast',
    'newcastle', 'wollongong', 'geelong', 'townsville', 'cairns', 'toowoomba',
    'nsw', 'victoria', 'queensland', 'south australia', 'western australia',
    'tasmania', 'act', 'northern territory',
  ],
  nz: [
    'new zealand', 'auckland', 'wellington', 'christchurch', 'hamilton',
    'tauranga', 'dunedin', 'palmerston north', 'napier', 'rotorua',
  ],
  us: [
    'united states', 'usa', 'america', 'american', 'new york', 'los angeles',
    'chicago', 'houston', 'miami', 'atlanta', 'seattle', 'denver', 'phoenix',
    'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
    'austin', 'jacksonville', 'fort worth', 'columbus', 'charlotte',
    'california', 'texas', 'florida', 'illinois', 'pennsylvania', 'ohio',
    'georgia', 'michigan', 'new jersey', 'virginia', 'washington state',
  ],
  ca: [
    'canada', 'canadian', 'toronto', 'vancouver', 'montreal', 'calgary',
    'ottawa', 'edmonton', 'winnipeg', 'quebec city', 'hamilton', 'kitchener',
    'ontario', 'british columbia', 'quebec', 'alberta', 'nova scotia',
    'manitoba', 'saskatchewan',
  ],
  gb: [
    'united kingdom', 'britain', 'british', 'england', 'london',
    'manchester', 'birmingham', 'glasgow', 'edinburgh', 'liverpool',
    'bristol', 'leeds', 'sheffield', 'newcastle', 'nottingham', 'leicester',
    'wales', 'scotland', 'northern ireland', 'cardiff', 'belfast',
  ],
  sg: ['singapore', 'singaporean'],
  in: [
    'india', 'indian', 'mumbai', 'delhi', 'new delhi', 'bangalore', 'bengaluru',
    'hyderabad', 'chennai', 'kolkata', 'pune', 'ahmedabad', 'jaipur', 'surat',
    'lucknow', 'kanpur', 'nagpur', 'indore', 'thane', 'bhopal',
  ],
  // Additional major regions always excluded (no proposal location maps to these)
  // but their terms should never appear in any client’s content questions.
  _global: [
    'china', 'chinese', 'beijing', 'shanghai', 'hong kong',
    'japan', 'japanese', 'tokyo', 'osaka',
    'south korea', 'korean', 'seoul',
    'germany', 'german', 'berlin', 'munich', 'frankfurt',
    'france', 'french', 'paris', 'lyon', 'marseille',
    'spain', 'spanish', 'madrid', 'barcelona',
    'italy', 'italian', 'rome', 'milan',
    'netherlands', 'amsterdam',
    'sweden', 'stockholm', 'norway', 'oslo', 'denmark', 'copenhagen',
    'switzerland', 'zurich', 'geneva',
    'russia', 'moscow', 'brazil', 'sao paulo', 'rio de janeiro',
    'mexico', 'mexico city', 'argentina', 'buenos aires',
    'south africa', 'johannesburg', 'cape town',
    'nigeria', 'kenya', 'nairobi',
    'saudi arabia', 'riyadh', 'dubai', 'uae', 'abu dhabi',
    'pakistan', 'karachi', 'lahore', 'islamabad',
    'bangladesh', 'dhaka',
    'philippines', 'manila', 'indonesia', 'jakarta',
    'malaysia', 'kuala lumpur', 'thailand', 'bangkok',
    'vietnam', 'hanoi', 'ho chi minh',
  ],
}

/**
 * Given a location code like "au", "au:sydney", "us", return the set of
 * foreign location terms that should be excluded from questions.
 * Own-country terms are allowed (so "tax accountant sydney" isn't excluded
 * when location is au:sydney, but "tax accountant canada" is).
 * The _global bucket is always excluded regardless of own location.
 */
function buildForeignLocationTerms(location: string | null | undefined): Set<string> {
  const ownPrefix = location ? location.split(':')[0]!.toLowerCase() : null
  const foreign = new Set<string>()
  for (const [prefix, terms] of Object.entries(LOCATION_TERMS)) {
    if (prefix === '_global' || prefix !== ownPrefix) {
      for (const t of terms) foreign.add(t.toLowerCase())
    }
  }
  return foreign
}

function isQuestionModifier(modifier: string | null | undefined): boolean {
  if (!modifier) return false
  return INTERROGATIVE_MODIFIERS.has(modifier.trim().toLowerCase())
}

/** Returns true if the question text itself starts with an interrogative word,
 *  even when the modifier field is null (e.g. PAA sources). */
function isQuestionText(text: string): boolean {
  const first = text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return INTERROGATIVE_MODIFIERS.has(first)
}

/** Returns true if the question should be excluded from the slide. */
function shouldExclude(
  text: string,
  modifier: string | null | undefined,
  foreignTerms: Set<string>,
): boolean {
  const lower = text.toLowerCase()
  const words = lower.split(/\s+/)

  // Alphabet-expansion results are never genuine questions.
  if (modifier && modifier.toLowerCase().startsWith(ALPHA_MODIFIER_PREFIX)) return true

  // Job / recruitment intent.
  if (JOB_TERMS.some((t) => lower.includes(t))) return true

  // Proximity / local-intent variants ("near me", "nearby" etc).
  if (PROXIMITY_TERMS.some((t) => lower.includes(t))) return true

  // Review / comparison / ranking intent.
  // Use word-level matching for short terms like "best", "vs", "rated"
  // to avoid false positives (e.g. "interest" should not hit "interest").
  for (const t of COMPARISON_TERMS) {
    if (t.includes(' ')) {
      if (lower.includes(t)) return true
    } else {
      if (words.includes(t)) return true
    }
  }

  // App / login / platform intent.
  for (const t of PLATFORM_TERMS) {
    if (lower.includes(t)) return true
  }

  // Foreign location mentions.
  for (const term of foreignTerms) {
    if (term.includes(' ')) {
      if (lower.includes(term)) return true
    } else {
      if (words.includes(term)) return true
    }
  }

  return false
}

function parseCategoryKeywords(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/\r?\n/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0)
}

function formatVolume(n: number): string {
  if (n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

// Group every content-research's questions under whichever keyword category
// the research's `keyword` belongs to. Questions are deduped by lower-cased
// text, filtered for job terms + foreign locations, and sorted with genuine
// questions first then by search volume.
function buildBuckets(
  categories: KeywordCategory[],
  researches: ContentResearchLike[],
  location: string | null | undefined,
): CategoryBucket[] {
  const foreignTerms = buildForeignLocationTerms(location)
  // Index researches by keyword for O(1) lookup.
  const byKeyword = new Map<string, ContentResearchLike[]>()
  for (const cr of researches) {
    const key = cr?.keyword?.trim().toLowerCase()
    if (!key) continue
    const existing = byKeyword.get(key) ?? []
    existing.push(cr)
    byKeyword.set(key, existing)
  }

  const buckets: CategoryBucket[] = []
  for (let i = 0; i < categories.length; i += 1) {
    const cat = categories[i]
    const name = cat?.categoryName?.trim()
    if (!name) continue
    const catKeywords = parseCategoryKeywords(cat.keywords)
    const seen = new Set<string>()
    const flat: ResolvedQuestion[] = []
    for (const kw of catKeywords) {
      for (const cr of byKeyword.get(kw) ?? []) {
        for (const cluster of cr.clusters ?? []) {
          for (const q of cluster.questions ?? []) {
            const text = q?.question?.trim()
            if (!text) continue
            const dedupeKey = text.toLowerCase()
            if (seen.has(dedupeKey)) continue
            seen.add(dedupeKey)
            if (shouldExclude(text, q?.modifier, foreignTerms)) continue
            const isQuestion = isQuestionModifier(q?.modifier) || isQuestionText(text)
            flat.push({ question: text, volume: q?.searchVolume ?? 0, isQuestion })
          }
        }
      }
    }
    // Sort: genuine questions (interrogative modifier or question-style text)
    // always appear before keyword variants. Within each tier, sort by
    // search volume descending so the most-searched questions surface first.
    flat.sort((a, b) => {
      if (a.isQuestion !== b.isQuestion) return a.isQuestion ? -1 : 1
      return b.volume - a.volume
    })
    buckets.push({ name, index: i, questions: flat })
  }
  return buckets
}

/** Comma-join with an Oxford "and" before the last item. */
function formatList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

/** Inline question-mark tooltip used beside each stage title on slide 16. */
function StageTooltip({ text }: { text: string }): ReactElement {
  return (
    <span
      className="stage-tooltip"
      tabIndex={0}
      role="button"
      aria-label="More info"
      data-tip={text}
    >
      ?
    </span>
  )
}

function CategoryCard({
  bucket,
  openDirection,
}: {
  bucket: CategoryBucket
  openDirection: 'down' | 'up'
}): ReactElement {
  const top = bucket.questions.slice(0, QUESTIONS_PER_CATEGORY)
  return (
    <div
      className="op-cat"
      tabIndex={0}
      aria-label={`${bucket.name} questions`}
      data-open={openDirection}
    >
      <div className="op-cat-head">
        <div className="op-cat-head-left">
          <span className="op-cat-eyebrow">
            Category {String(bucket.index + 1).padStart(2, '0')}
          </span>
          <span className="op-cat-name">{bucket.name}</span>
        </div>
        <div className="op-cat-meta">
          <span className="count">
            {bucket.questions.length > 0
              ? `${bucket.questions.length} question${bucket.questions.length === 1 ? '' : 's'}`
              : 'No questions yet'}
          </span>
          <span className="caret" aria-hidden="true">›</span>
        </div>
      </div>
      <div className="op-cat-panel" role="region">
        {top.length > 0 ? (
          <ul className="op-cat-q-list">
            {top.map((q, i) => (
              <li key={`${q.question}-${i}`}>
                <span className="q">{q.question.toLowerCase()}</span>
                {q.volume > 0 && <span className="vol">{formatVolume(q.volume)}/mo</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="op-cat-q-empty">
            No customer questions captured yet for this category.
          </p>
        )}
      </div>
    </div>
  )
}

export function OrganicPropulsionSlide({
  contentResearches,
  keywordCategories,
  location,
}: {
  contentResearches: ContentResearchLike[] | null
  keywordCategories: KeywordCategory[] | null
  location: string | null
}): ReactElement {
  const categories = keywordCategories ?? []
  const researches = contentResearches ?? []
  const buckets = buildBuckets(categories, researches, location)

  // List of category names used in the Pillar pages explainer. We surface the
  // proposal's own categories so the copy reads like a real plan ("creating
  // pages around X, Y, Z") instead of generic boilerplate. Falls back to a
  // generic line when the proposal doesn't have categories yet.
  const categoryNames = categories
    .map((c) => c?.categoryName?.trim())
    .filter((n): n is string => !!n && n.length > 0)
  const pillarCategoriesCopy = categoryNames.length > 0
    ? `Creating pages around ${formatList(categoryNames)}.`
    : null

  return (
    <section className="slide" data-label="17 Organic Propulsion">
      <div className="brand-tag">
        <span className="dot"></span> 06 · Fueling the Ship
      </div>
      <div className="slide-head">
        <div className="h-left">
          <div className="h-eyebrow">06 · Fueling the Ship · Stage 1</div>
          <h1 className="h-title">Organic propulsion</h1>
        </div>
        <div className="h-meta">Ongoing · compounds over time</div>
      </div>

      <div className="two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 760 }}>
            <p className="body" style={{ fontSize: 24, margin: 0, lineHeight: 1.4 }}>
              SEO is the only channel where the investment compounds.
              Paid stops when the budget does. <strong style={{ color: 'var(--ink)' }}>Organic keeps arriving for years</strong> and
              lowers your cost-per-lead across every other channel.
            </p>
            <p className="body" style={{ fontSize: 24, margin: 0, lineHeight: 1.4 }}>
              The businesses with the highest marketing ROI started building authority early.
              We also manage your <strong style={{ color: 'var(--ink)' }}>Google Business Profile and reviews</strong> as part of the organic strategy, building local authority and trust signals that compound alongside your content.
            </p>
          </div>

          <div className="stages" style={{ marginTop: 18 }}>
            <div className="stage">
              <div className="stage-num">01</div>
              <div className="stage-body">
                <div className="stage-title">
                  Pillar pages
                  <StageTooltip text="Broad authority pages that own each category at the top of the funnel. Written once, ranked for years. We build one pillar per keyword category so each topic has a single anchor page that all supporting articles link back to. From there we go deeper into industry-specific sub-categories so the site captures the niche, high-intent search terms that generic competitors miss." />
                </div>
                <div className="stage-sub">
                  {pillarCategoriesCopy ?? 'Broad authority pages that own each category at the top of the funnel. Written once, ranked for years.'}
                </div>
              </div>
            </div>
            <div className="stage">
              <div className="stage-num">02</div>
              <div className="stage-body">
                <div className="stage-title">
                  Cluster maps per category
                  <StageTooltip text="Search-intent groupings ('what / how / can / does') built from each keyword category. The map tells us which questions to answer, in what order, and how they interlink. Raw keywords become a content plan." />
                </div>
                <div className="stage-sub">
                  &quot;What / how / can / does&quot; search-intent groupings
                  built from the proposal&apos;s keyword categories
                </div>
              </div>
            </div>
            <div className="stage">
              <div className="stage-num">03</div>
              <div className="stage-body">
                <div className="stage-title">
                  Supporting articles per service
                  <StageTooltip text="Service-specific deep-dives that link back into each pillar, capturing long-tail intent your competitors don't cover. Each article targets a single buying-intent question with a clear next action." />
                </div>
                <div className="stage-sub">
                  Service-specific deep-dives that link back into each pillar,
                  capturing long-tail intent your competitors don&apos;t cover.
                </div>
              </div>
            </div>
            <div className="stage">
              <div className="stage-num">04</div>
              <div className="stage-body">
                <div className="stage-title">
                  FAQ + schema rollout
                  <StageTooltip text="Structured FAQ blocks and schema markup applied across the pillar + supporting articles. Closes the lowest-scoring SEO categories (rich results, AI summaries, voice) and gives Google a machine-readable map of every Q&A on the site." />
                </div>
                <div className="stage-sub">Closes the lowest-scoring SEO categories</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            className="eyebrow"
            style={{ color: 'var(--ink-mute)', fontSize: 18 }}
          >
            {buckets.length > 0
              ? 'Customer questions by category · hover to expand'
              : 'Customer questions by category'}
          </div>

          {buckets.length > 0 ? (
            <div className="op-cat-stack">
              {buckets.map((bucket, i) => {
                // The bottom half of the stack opens upward so the expanded
                // panel never falls off the slide. "Bottom half" here is
                // anything past the midpoint, plus the very last card.
                const midpoint = Math.ceil(buckets.length / 2)
                const openDirection: 'down' | 'up' = i >= midpoint ? 'up' : 'down'
                return (
                  <CategoryCard
                    key={`${bucket.name}-${bucket.index}`}
                    bucket={bucket}
                    openDirection={openDirection}
                  />
                )
              })}
            </div>
          ) : (
            <div
              style={{
                padding: '18px 24px',
                background: 'var(--bg-paper-2)',
                borderRadius: 14,
                border: '1px solid var(--line)',
                color: 'var(--ink-mute)',
                fontStyle: 'italic',
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 22,
                lineHeight: 1.4,
              }}
            >
              Keyword categories will appear here once the proposal has them
              defined. Each category will reveal its real customer questions
              on hover.
            </div>
          )}
        </div>
      </div>

      <div className="slide-foot"></div>
    </section>
  )
}
