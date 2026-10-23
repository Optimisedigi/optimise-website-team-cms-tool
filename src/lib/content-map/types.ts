/** Snapshot + GT wire types. Mirrors /Users/Pe/.gg/goals/living-geo-link/CONTRACT.md exactly. */

export type ContentMapMode = "full" | "refresh";
export type ContentMapDecision = "accepted" | "dismissed";

export interface TopicAuthorityInput {
  key: string;
  name: string;
  description?: string;
  primary: boolean;
}

export interface AnalyseArticle {
  cmsId: string;
  title: string;
  slug: string;
  status: string;
  category?: string;
  markdown?: string;
}

export interface AnalyseRequest {
  clientId: string;
  siteUrl: string;
  mode: ContentMapMode;
  topicAuthorities: TopicAuthorityInput[];
  articles: AnalyseArticle[];
  decisions: Array<{ key: string; decision: ContentMapDecision }>;
}

export interface SnapshotTopic {
  k: string;
  name: string;
  primary?: boolean;
  agg?: boolean;
  description?: string;
}

export interface SnapshotNode {
  id: string;
  g: string;
  t: string;
  in: number;
  out: number;
  agg?: number;
  status?: "live" | "draft";
  cmsId?: string;
  fit?: number;
  overlaps?: Array<{ k: string; s: number }>;
  words?: number;
}

export interface SnapshotLink {
  s: number;
  t: number;
  w: number;
}

export interface SnapshotOpportunity {
  key: string;
  s: number;
  t: number;
  sim: number;
  terms: string[];
  anchor?: string;
  snippet?: string;
  why?: string;
  dup?: boolean;
}

export interface SnapshotRecommendation {
  id: string;
  topic: string;
  overlaps: string[];
  title: string;
  question: string;
  why: string;
  priority: "high" | "medium" | "low";
  score: number;
  primaryKeyword?: string;
  secondaryKeywords: string[];
  outline: string[];
  geo: {
    answerFirst: string;
    entities: string[];
    faqs: string[];
    evidence: string[];
    schema: string[];
  };
  linksTo: string[];
  linksFrom: string[];
}

export interface SnapshotStats {
  pagesCrawled: number;
  mapped: number;
  links: number;
  orphans: number;
}

export interface ContentMapSnapshot {
  version: 1;
  clientId: string;
  siteUrl: string;
  generatedAt: string;
  crawledAt: string;
  mode: ContentMapMode;
  ai: {
    embeddings: "openai" | "tfidf";
    /** Always "none" now: Growth Tools runs no LLM ("moonshot" only on old snapshots). */
    llm: "moonshot" | "none";
    /** Set when the CMS rewrote `recommendations` with its own (subscription) model. */
    ideas?: { model: string; generatedAt: string };
  };
  topics: SnapshotTopic[];
  nodes: SnapshotNode[];
  links: SnapshotLink[];
  opportunities: SnapshotOpportunity[];
  recommendations: SnapshotRecommendation[];
  stats: SnapshotStats;
}

export type RunStatusValue = "running" | "completed" | "failed";

export interface RunStatus {
  runId: string;
  clientId: string;
  status: RunStatusValue;
  phase?: "queued" | "crawling" | "classifying" | "linking" | "recommending" | "done";
  progress?: { pagesCrawled: number };
  error?: string;
  snapshot?: ContentMapSnapshot;
}

export interface IngestBody {
  clientId: string;
  runId: string;
  status: "completed" | "failed";
  error?: string;
  snapshot?: ContentMapSnapshot;
}

/** What GET /api/content-map returns to the UI. */
export interface ContentMapApiResponse {
  client: {
    id: string;
    name: string;
    /** Client URL slug, used for /SEO/Topic-association-linking/<slug>. */
    slug?: string | null;
    siteUrl: string;
    enabled: boolean;
    authorities: TopicAuthorityInput[];
  };
  run: {
    runId: string;
    status: RunStatusValue;
    mode?: string | null;
    phase?: string | null;
    pagesCrawled?: number | null;
    error?: string | null;
    startedAt?: string | null;
  } | null;
  snapshot: ContentMapSnapshot | null;
  decisions: Array<{ key: string; decision: ContentMapDecision }>;
  termW: Record<string, number>;
  sent: Record<string, string>;
  history: Array<{ generatedAt: string | null; stats: SnapshotStats | null }>;
  /** Link edits drafted/applied for accepted opportunities, by opportunity key. */
  actions?: Record<string, LinkAction>;
  /**
   * The plan to show in Write next / Approach: snapshot ideas + AI-citation
   * gaps + approved suggestions, merged and de-duplicated, best first. When
   * absent (older API), the UI falls back to snapshot.recommendations.
   */
  plan?: PlanItem[];
  /** Team: all suggestions. Client view: the client's own + approved team/AI ones. */
  suggestions?: SuggestionView[];
  citations?: CitationsView | null;
  /** Research layers data (map overlays are off by default; the viewer switches them on). */
  research?: ResearchView | null;
  inProgress?: InProgressItem[];
}

export type LinkActionStatus = "drafted" | "applied" | "failed" | "already-linked";
export type LinkActionSource = "cms-article" | "live-page";

/** One accepted link suggestion being written into its source page. */
export interface LinkAction {
  status: LinkActionStatus;
  source: LinkActionSource | null;
  /** Exact text in the source page that gets replaced. */
  original: string;
  /** The same text with the markdown link added. */
  replacement: string;
  anchor: string;
  /** Why this spot, or why it failed. */
  note: string;
  model: string;
  blogPostId: string | null;
  appliedAt: string | null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural check of an incoming snapshot; returns null when it is unusable. */
export function parseSnapshot(value: unknown): ContentMapSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  for (const key of ["topics", "nodes", "links", "opportunities", "recommendations"]) {
    if (!Array.isArray(value[key])) return null;
  }
  if (!isRecord(value.stats)) return null;
  return value as unknown as ContentMapSnapshot;
}

// ─── Living layer: suggestions, AI citation watch, the merged plan ─────────
// Shared contract between the CMS API (src/lib/content-map/*, api/content-map/*)
// and the UI (src/components/content-map/*). Growth Tools' side is in
// /Users/Pe/.gg/goals/living-geo-link/CONTRACT-2.md.

/** AI tools checked for citations (all through DataForSEO in Growth Tools). */
export type CitationEngine = "chatgpt" | "perplexity" | "gemini" | "google_aio";
export const CITATION_ENGINES: readonly CitationEngine[] = ["chatgpt", "perplexity", "gemini", "google_aio"];
export const CITATION_ENGINE_LABELS: Record<CitationEngine, string> = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  google_aio: "Google AI Overviews",
};
/** Tracked questions per topic authority (user decision: up to 8, weekly). */
export const MAX_QUESTIONS_PER_TOPIC = 8;

// GT → CMS citation run result (CONTRACT-2.md §2).
export interface CitationCheck {
  engine: CitationEngine;
  ok: boolean;
  error?: string;
  /** Answer excerpt, ≤ 700 chars. Team only; never sent to the client view. */
  answer: string;
  cited: Array<{ url: string; domain: string; title?: string }>;
  /** The client's site is among the cited URLs. */
  clientCited: boolean;
  /** The brand is named in the answer text. */
  clientMentioned: boolean;
}
export interface CitationQuestionResult {
  id: string;
  topic: string;
  question: string;
  results: CitationCheck[];
}
export interface CitedSource {
  url: string;
  domain: string;
  title: string;
  headings: string[];
  summary: string;
  words: number;
  /** Number of (question, engine) checks citing this URL. */
  citedBy: number;
  questionIds: string[];
  ok: boolean;
  error?: string;
}
export interface CitationsResult {
  version: 1;
  clientId: string;
  siteUrl: string;
  generatedAt: string;
  engines: CitationEngine[];
  questions: CitationQuestionResult[];
  sources: CitedSource[];
  stats: {
    questions: number;
    checks: number;
    okChecks: number;
    clientCitedChecks: number;
    clientMentionedChecks: number;
    topDomains: Array<{ domain: string; count: number }>;
    costUsd?: number;
  };
}

// Why something is in the plan. Shown as small chips; plain words.
export type ReasonKind =
  | "no-page" // no page on the site answers this question
  | "ai-cites-others" // AI tools answer this question citing other sites
  | "client-not-cited" // the client's own page isn't cited for this question
  | "unlinked-topics" // the two topics it bridges never link to each other
  | "orphan-pages" // pages in the topic nothing links to
  | "suggested" // suggested by the team or the client
  | "refresh" // an existing article to improve
  | "demand" // monthly search volume
  | "questions" // questions people ask (Autocomplete / People Also Ask)
  | "competitors" // competitors cover it, you don't
  | "search-console"; // Search Console: impressions without a page that answers it
export interface PlanReason {
  kind: ReasonKind;
  /** One short plain-language line, e.g. "ChatGPT and Perplexity cite 3 other sites for this". */
  text: string;
  engines?: CitationEngine[];
  domains?: string[];
}

export type PlanOrigin = "ai" | "ai-citations" | "team" | "client" | "research";
/** One article in the plan: the snapshot's ideas, AI-citation gaps and approved suggestions, merged. */
export interface PlanItem extends SnapshotRecommendation {
  origin: PlanOrigin;
  reasons: PlanReason[];
  /** Pages AI tools cite today for this question (team + client views). */
  sources?: Array<{ url: string; domain: string; title: string }>;
  /** Points the cited pages cover that the article must cover. */
  cover?: string[];
  /** How to do better than the cited pages. */
  beat?: string[];
  /** Set when the item came from an approved suggestion. */
  suggestionId?: string;
  /** Monthly searches for its keywords (research), when known. */
  volume?: number | null;
  /** Set when the item came from a research idea. */
  researchId?: string;
}

/** An existing article to improve because AI tools cite others for its question. */
export interface RefreshItem {
  id: string;
  /** Snapshot node id of the existing page. */
  nodeId: string;
  topic: string;
  question: string;
  /** What the cited pages cover that this page doesn't. */
  missing: string[];
  sources: Array<{ url: string; domain: string; title: string }>;
  why: string;
}

export type SuggestionKind = "topic" | "bridge" | "article";
export type SuggestionStatus = "pending" | "approved" | "dismissed";
export interface SuggestionView {
  id: string;
  kind: SuggestionKind;
  title: string;
  why: string;
  /** article: its topic; bridge: first topic; topic: unused. */
  topic: string | null;
  /** bridge: second topic. */
  topicB: string | null;
  status: SuggestionStatus;
  origin: "team" | "client" | "ai";
  /** Display name ("Peter", "Client"). Client view: "You" / "Optimise Digital". */
  suggestedBy: string;
  createdAt: string;
  decidedAt: string | null;
  /** Team only. */
  dismissReason?: string | null;
  /** Approved article/bridge suggestions: the plan item id they became. */
  recommendationId?: string | null;
}

export interface TrackedQuestionView {
  id: string;
  topic: string;
  question: string;
  source: "ai" | "team" | "client" | "recommendation" | "article";
  /** Latest run, per engine. Empty until the first run includes this question. */
  checks: Array<{ engine: CitationEngine; ok: boolean; clientCited: boolean; clientMentioned: boolean; citedDomains: string[] }>;
}

export interface CitationsView {
  status: "none" | "running" | "completed" | "failed";
  /** Team only (null in the client view). */
  error: string | null;
  generatedAt: string | null;
  engines: CitationEngine[];
  questions: TrackedQuestionView[];
  /** Per topic authority key, latest run. */
  byTopic: Record<string, { questions: number; checks: number; cited: number }>;
  /** Oldest → newest completed runs (max 12). */
  trend: Array<{ generatedAt: string; checks: number; cited: number }>;
  topDomains: Array<{ domain: string; count: number }>;
  refresh: RefreshItem[];
  /** Model that wrote the insights (team only; "" in the client view). */
  insightsModel: string;
}

// ─── Research layer: search volume, questions, competitors, Search Console ──
// Growth Tools collects keyword volumes, questions and competitor pages
// (CONTRACT-3.md); the CMS pulls Search Console itself and places everything
// with its subscription models. On the map every research layer is OFF by
// default and switched on by the viewer (user rule).

export type ResearchLayer = "volume" | "questions" | "competitors" | "gsc";
export const RESEARCH_LAYERS: readonly ResearchLayer[] = ["volume", "questions", "competitors", "gsc"];
export const RESEARCH_LAYER_LABELS: Record<ResearchLayer, string> = {
  volume: "Search volume",
  questions: "Questions",
  competitors: "Competitors",
  gsc: "Search Console",
};
/** Research ideas per topic that join the plan automatically (rest wait in the Research list). */
export const RESEARCH_PLAN_PER_TOPIC = 3;

// GT → CMS research result (CONTRACT-3.md §2).
export interface ResearchKeyword {
  keyword: string;
  /** Average monthly searches (Keyword Planner); null when unknown. */
  volume: number | null;
  competition: "LOW" | "MEDIUM" | "HIGH" | null;
  cpcLow: number | null;
  cpcHigh: number | null;
}
export interface ResearchQuestion {
  question: string;
  source: "autocomplete" | "people_also_ask" | "related";
  volume: number | null;
}
export interface CompetitorPage {
  url: string;
  domain: string;
  title: string;
  headings: string[];
  summary: string;
  /** Keyword it ranked for, and where. */
  keyword: string;
  position: number;
  ok: boolean;
  error?: string;
}
export interface ResearchTopicResult {
  key: string;
  keywords: ResearchKeyword[];
  questions: ResearchQuestion[];
  competitors: {
    domains: Array<{ domain: string; pages: number; bestPosition: number }>;
    pages: CompetitorPage[];
  };
  totals: { volume: number; keywords: number; questions: number };
  errors: string[];
}
export interface ResearchResult {
  version: 1;
  clientId: string;
  siteUrl: string;
  location: string;
  generatedAt: string;
  topics: ResearchTopicResult[];
  stats: { keywords: number; questions: number; competitorPages: number; costUsd?: number };
}

/** Where the AI places an idea (or a suggestion / in-progress article). */
export interface PlacementResult {
  /** Authority key it belongs to; null when it needs a new topic. */
  topic: string | null;
  /** 0..1 how well it fits that topic. */
  fit: number;
  overlaps: string[];
  placement: "new-article" | "improve-page" | "new-topic";
  /** improve-page: the existing page (snapshot node id) to improve instead of writing a new one. */
  pageId: string | null;
  pageTitle: string | null;
  /** new-topic: the proposed topic name. */
  newTopicName: string | null;
  linksTo: Array<{ id: string; title: string }>;
  linksFrom: Array<{ id: string; title: string }>;
  /** One plain line, e.g. "Fits Cost strongly and also touches Comparisons." */
  why: string;
  /** e.g. "Overlaps 'What offshore teams really cost' — consider improving that page instead." */
  warnings: string[];
}

export interface ResearchEvidence {
  source: ResearchLayer;
  /** One plain line, built by code (never names competitors): "1,300 searches a month", "3 competitors cover this". */
  text: string;
  volume?: number;
  competitors?: number;
  /** Team only (stripped in the client view). */
  domains?: string[];
  impressions?: number;
  position?: number;
}

export interface ResearchIdea extends PlacementResult {
  id: string;
  title: string;
  question: string;
  /** Which layers show it on the map (its evidence sources). */
  layers: ResearchLayer[];
  evidence: ResearchEvidence[];
  /** Monthly searches across its keywords; null when unknown. */
  volume: number | null;
  keywords: string[];
  status: "in-plan" | "listed" | "dismissed";
  /** Set when it joined the plan (automatically or by "Add to plan"). */
  planItemId: string | null;
}

export interface TopicResearch {
  key: string;
  /** Monthly searches across the topic's keywords. */
  volume: number;
  keywords: number;
  /** 0..1 share of that volume whose keyword already has a page on the site. */
  covered: number;
  questions: number;
  competitorPages: number;
  /** Team only (empty in the client view). */
  competitorDomains: Array<{ domain: string; pages: number }>;
  /** Search Console, last 28 days, pages in this topic. */
  gsc: { clicks: number; impressions: number; position: number } | null;
}

export interface GscPageSignal {
  nodeId: string;
  clicks: number;
  impressions: number;
  position: number;
  /** vs the previous 28 days, as a fraction (-0.3 = 30% fewer clicks); null when no baseline. */
  clicksChange: number | null;
  topQueries: Array<{ query: string; impressions: number; position: number }>;
}
export interface GscQuerySignal {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
  /** Snapshot node ids Google shows for it. */
  pages: string[];
  /** unanswered: impressions but no page really answers it; cannibal: 2+ of your pages compete; question: a real question people search. */
  kind: "unanswered" | "cannibal" | "question";
  /** Authority key it falls in, when known. */
  topic: string | null;
}

export interface ResearchView {
  status: "none" | "running" | "completed" | "failed";
  /** Team only (null in the client view). */
  error: string | null;
  generatedAt: string | null;
  gscAt: string | null;
  gscConnected: boolean;
  location: string;
  topics: Record<string, TopicResearch>;
  ideas: ResearchIdea[];
  gscPages: GscPageSignal[];
  gscQueries: GscQuerySignal[];
  /** Demand between two topics (ideas bridging a and b), for the gap matrix volume layer. */
  pairs: Array<{ a: string; b: string; volume: number; ideas: number }>;
  /** Team only ("" in the client view). */
  insightsModel: string;
}

/** Articles already being written outside the plan (Blog Prompter briefs, CMS drafts), with where they fit. */
export interface InProgressItem {
  id: string;
  kind: "brief" | "draft";
  title: string;
  /** Team only (null in the client view). */
  cmsId: string | null;
  placement: PlacementResult | null;
}
