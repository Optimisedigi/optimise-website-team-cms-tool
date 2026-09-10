export type TopicNodeType = "category" | "topic" | "article" | "page";
export type TopicEdgeType = "in_category" | "tagged_with" | "published_link" | "suggested_link";
export type CategoryHealth = "Empty" | "Sparse" | "Developing" | "Connected";

export interface TopicGraphNode {
  id: string;
  type: TopicNodeType;
  label: string;
  url?: string;
  adminUrl?: string;
  status?: string;
  categoryIds: string[];
  topicIds: string[];
  configured?: boolean;
  evidenceCount: number;
  degree: number;
}

export interface TopicGraphEdge {
  id: string;
  type: TopicEdgeType;
  source: string;
  target: string;
  confidence?: number;
  status?: "pending" | "approved";
  clusterRelation?: string;
  clusterName?: string;
}

export interface CategorySummary {
  id: string;
  label: string;
  configured: boolean;
  articleCount: number;
  publishedCount: number;
  draftCount: number;
  topicCount: number;
  publishedLinkCount: number;
  possibleInternalLinks: number;
  internalDensity: number;
  orphanCount: number;
  bridgeCount: number;
  sharedTopicCount: number;
  pendingSuggestionCount: number;
  health: CategoryHealth;
}

export interface TopicSummary {
  id: string;
  label: string;
  categoryIds: string[];
  articleCount: number;
  connectivity: number;
  orphanCount: number;
  pendingSuggestionCount: number;
  gaps: string[];
  membershipStrength?: number;
  provenance?: { model: string; version?: string; derivedAt: string };
}

export interface TopicGraphSummary {
  categoryCount: number;
  articleCount: number;
  topicCount: number;
  pageCount: number;
  unusedConfiguredCategories: number;
  uncategorizedArticles: number;
  untaggedArticles: number;
  unconfiguredCategoryArticles: number;
  orphanArticles: number;
  pendingSuggestions: number;
  truncated: boolean;
  lastDerivedAt: string;
}

export interface TopicAuthorityGraph {
  nodes: TopicGraphNode[];
  edges: TopicGraphEdge[];
  categories: CategorySummary[];
  topics: TopicSummary[];
  summary: TopicGraphSummary;
}

export interface GraphPostInput {
  id: string | number;
  title?: string | null;
  slug?: string | null;
  status?: string | null;
  category?: string | null;
  tags?: unknown;
  markdownContent?: string | null;
}

export interface GraphSuggestionInput {
  id?: string | number;
  sourceUrl?: string | null;
  targetUrl?: string | null;
  confidenceScore?: number | null;
  status?: string | null;
  clusterRelation?: string | null;
  clusterName?: string | null;
}

export interface BuildTopicGraphInput {
  configuredCategories?: string | string[] | null;
  configuredTags?: string | string[] | null;
  posts: GraphPostInput[];
  suggestions?: GraphSuggestionInput[];
  siteOrigins?: string[];
  maxNodes?: number;
  maxEdges?: number;
  derivedAt?: string;
}

const UNCATEGORIZED = "Uncategorized";
const UNCONFIGURED = "Unconfigured category";
const UNTAGGED = "Untagged";

export function normalizeTaxonomyValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function parseTaxonomy(raw: string | string[] | null | undefined): string[] {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/) : [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const label = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
    const key = normalizeTaxonomyValue(label);
    if (!label || seen.has(key)) return [];
    seen.add(key);
    return [label];
  });
}

function idPart(value: string): string {
  return encodeURIComponent(normalizeTaxonomyValue(value) || "unknown");
}

export function normalizeInternalUrl(value: string, siteOrigins: string[] = []): string | null {
  const raw = value.trim();
  if (!raw || raw.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(raw, "https://internal.invalid");
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.origin !== "https://internal.invalid") {
    const allowed = new Set(siteOrigins.flatMap((origin) => {
      try { return [new URL(origin).origin.toLocaleLowerCase()]; } catch { return []; }
    }));
    if (!allowed.has(url.origin.toLocaleLowerCase())) return null;
  }
  let path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  try { path = decodeURI(path); } catch { return null; }
  return path;
}

export function extractMarkdownLinks(markdown: string | null | undefined, siteOrigins: string[] = []): string[] {
  if (!markdown) return [];
  const links = new Set<string>();
  const expression = /\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const match of markdown.matchAll(expression)) {
    const normalized = normalizeInternalUrl(match[1] ?? match[2] ?? "", siteOrigins);
    if (normalized) links.add(normalized);
  }
  return [...links].sort();
}

function parseTags(raw: unknown): string[] {
  return Array.isArray(raw) ? parseTaxonomy(raw.filter((tag): tag is string => typeof tag === "string")) : [];
}

export function getFirstDegreeNeighborhood(graph: Pick<TopicAuthorityGraph, "nodes" | "edges">, nodeId: string) {
  const edges = graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId);
  const ids = new Set([nodeId, ...edges.flatMap((edge) => [edge.source, edge.target])]);
  return { nodes: graph.nodes.filter((node) => ids.has(node.id)), edges };
}

export function buildTopicAuthorityGraph(input: BuildTopicGraphInput): TopicAuthorityGraph {
  const maxNodes = Math.max(1, input.maxNodes ?? 700);
  const maxEdges = Math.max(1, input.maxEdges ?? 1500);
  const categoryLabels = parseTaxonomy(input.configuredCategories);
  const configuredTags = parseTaxonomy(input.configuredTags);
  const categoryByKey = new Map(categoryLabels.map((label) => [normalizeTaxonomyValue(label), label]));
  const nodes = new Map<string, TopicGraphNode>();
  const edges = new Map<string, TopicGraphEdge>();
  let truncated = false;

  const addNode = (node: Omit<TopicGraphNode, "degree">): TopicGraphNode | undefined => {
    const existing = nodes.get(node.id);
    if (existing) return existing;
    if (nodes.size >= maxNodes) { truncated = true; return undefined; }
    const created = { ...node, degree: 0 };
    nodes.set(node.id, created);
    return created;
  };
  const addEdge = (edge: TopicGraphEdge) => {
    if (!nodes.has(edge.source) || !nodes.has(edge.target) || edges.has(edge.id)) return;
    if (edges.size >= maxEdges) { truncated = true; return; }
    edges.set(edge.id, edge);
  };

  for (const label of categoryLabels) addNode({ id: `category:${idPart(label)}`, type: "category", label, categoryIds: [], topicIds: [], configured: true, evidenceCount: 0 });
  for (const label of configuredTags) addNode({ id: `topic:${idPart(label)}`, type: "topic", label, categoryIds: [], topicIds: [], configured: true, evidenceCount: 0 });

  const articleIdByPath = new Map<string, string>();
  let uncategorizedArticles = 0;
  let unconfiguredCategoryArticles = 0;
  let untaggedArticles = 0;

  for (const post of input.posts) {
    const rawCategory = post.category?.trim() ?? "";
    const configuredLabel = categoryByKey.get(normalizeTaxonomyValue(rawCategory));
    const categoryLabel = configuredLabel ?? (rawCategory ? UNCONFIGURED : UNCATEGORIZED);
    if (!rawCategory) uncategorizedArticles++;
    else if (!configuredLabel) unconfiguredCategoryArticles++;
    const categoryId = `category:${idPart(categoryLabel)}`;
    addNode({ id: categoryId, type: "category", label: categoryLabel, categoryIds: [], topicIds: [], configured: Boolean(configuredLabel), evidenceCount: 0 });

    const articleId = `article:${String(post.id)}`;
    const path = normalizeInternalUrl(`/blog/${post.slug ?? ""}`, input.siteOrigins);
    const tags = parseTags(post.tags);
    if (!tags.length) untaggedArticles++;
    const topicLabels = tags.length ? tags : [UNTAGGED];
    const topicIds = topicLabels.map((tag) => `topic:${idPart(tag)}`);
    const article = addNode({ id: articleId, type: "article", label: post.title?.trim() || "Untitled", url: path ?? undefined, adminUrl: `/admin/collections/blog-posts/${encodeURIComponent(String(post.id))}`, status: post.status ?? "draft", categoryIds: [categoryId], topicIds, evidenceCount: 0 });
    if (!article) continue;
    if (path) articleIdByPath.set(path, articleId);
    addEdge({ id: `in_category:${articleId}:${categoryId}`, type: "in_category", source: articleId, target: categoryId });
    for (const [index, topicLabel] of topicLabels.entries()) {
      const topicId = topicIds[index];
      const topic = addNode({ id: topicId, type: "topic", label: topicLabel, categoryIds: [categoryId], topicIds: [], configured: configuredTags.some((tag) => normalizeTaxonomyValue(tag) === normalizeTaxonomyValue(topicLabel)), evidenceCount: 0 });
      if (!topic) continue;
      if (!topic.categoryIds.includes(categoryId)) topic.categoryIds.push(categoryId);
      addEdge({ id: `tagged_with:${articleId}:${topicId}`, type: "tagged_with", source: articleId, target: topicId });
    }
  }

  const ensureTarget = (path: string): string | undefined => {
    const articleId = articleIdByPath.get(path);
    if (articleId) return articleId;
    const pageId = `page:${path}`;
    return addNode({ id: pageId, type: "page", label: path === "/" ? "Homepage" : path.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") || path, url: path, categoryIds: [], topicIds: [], evidenceCount: 0 })?.id;
  };

  for (const post of input.posts) {
    const source = `article:${String(post.id)}`;
    if (!nodes.has(source)) continue;
    for (const path of extractMarkdownLinks(post.markdownContent, input.siteOrigins)) {
      const target = ensureTarget(path);
      if (target && target !== source) addEdge({ id: `published_link:${source}:${target}`, type: "published_link", source, target });
    }
  }

  for (const suggestion of input.suggestions ?? []) {
    if (suggestion.status !== "pending" && suggestion.status !== "approved") continue;
    const sourcePath = suggestion.sourceUrl ? normalizeInternalUrl(suggestion.sourceUrl, input.siteOrigins) : null;
    const targetPath = suggestion.targetUrl ? normalizeInternalUrl(suggestion.targetUrl, input.siteOrigins) : null;
    if (!sourcePath || !targetPath) continue;
    const source = articleIdByPath.get(sourcePath);
    const target = ensureTarget(targetPath);
    if (!source || !target || source === target) continue;
    addEdge({ id: `suggested_link:${String(suggestion.id ?? `${source}:${target}`)}`, type: "suggested_link", source, target, confidence: typeof suggestion.confidenceScore === "number" ? Math.max(0, Math.min(100, suggestion.confidenceScore)) : undefined, status: suggestion.status, clusterRelation: suggestion.clusterRelation ?? undefined, clusterName: suggestion.clusterName ?? undefined });
  }

  for (const node of nodes.values()) {
    node.degree = [...edges.values()].filter((edge) => edge.source === node.id || edge.target === node.id).length;
    node.evidenceCount = node.degree;
  }

  const articleNodes = [...nodes.values()].filter((node) => node.type === "article");
  const publishedEdges = [...edges.values()].filter((edge) => edge.type === "published_link");
  const pendingEdges = [...edges.values()].filter((edge) => edge.type === "suggested_link" && edge.status === "pending");
  const categorySummaries = [...nodes.values()].filter((node) => node.type === "category").map((category): CategorySummary => {
    const articles = articleNodes.filter((article) => article.categoryIds.includes(category.id));
    const ids = new Set(articles.map((article) => article.id));
    const internal = publishedEdges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const bridges = publishedEdges.filter((edge) => ids.has(edge.source) && nodes.get(edge.target)?.type === "article" && !ids.has(edge.target));
    const possible = articles.length * Math.max(articles.length - 1, 0);
    const topics = [...nodes.values()].filter((node) => node.type === "topic" && node.categoryIds.includes(category.id));
    const orphans = articles.filter((article) => !publishedEdges.some((edge) => edge.source === article.id || edge.target === article.id));
    const health: CategoryHealth = articles.length === 0 ? "Empty" : articles.length < 3 ? "Sparse" : internal.length === 0 ? "Developing" : "Connected";
    return { id: category.id, label: category.label, configured: Boolean(category.configured), articleCount: articles.length, publishedCount: articles.filter((a) => a.status === "published").length, draftCount: articles.filter((a) => a.status !== "published").length, topicCount: topics.length, publishedLinkCount: internal.length, possibleInternalLinks: possible, internalDensity: possible ? internal.length / possible : 0, orphanCount: orphans.length, bridgeCount: bridges.length, sharedTopicCount: topics.filter((topic) => topic.categoryIds.length > 1).length, pendingSuggestionCount: pendingEdges.filter((edge) => ids.has(edge.source) || ids.has(edge.target)).length, health };
  });
  const topicSummaries = [...nodes.values()].filter((node) => node.type === "topic").map((topic): TopicSummary => {
    const articleIds = new Set([...edges.values()].filter((edge) => edge.type === "tagged_with" && edge.target === topic.id).map((edge) => edge.source));
    const linked = publishedEdges.filter((edge) => articleIds.has(edge.source) || articleIds.has(edge.target));
    const orphanCount = [...articleIds].filter((id) => !linked.some((edge) => edge.source === id || edge.target === id)).length;
    return { id: topic.id, label: topic.label, categoryIds: topic.categoryIds, articleCount: articleIds.size, connectivity: articleIds.size ? linked.length / articleIds.size : 0, orphanCount, pendingSuggestionCount: pendingEdges.filter((edge) => articleIds.has(edge.source) || articleIds.has(edge.target)).length, gaps: [...(articleIds.size < 2 ? ["Needs more articles"] : []), ...(orphanCount ? ["Contains isolated articles"] : [])], membershipStrength: 1 };
  });

  return {
    nodes: [...nodes.values()], edges: [...edges.values()], categories: categorySummaries, topics: topicSummaries,
    summary: { categoryCount: categorySummaries.length, articleCount: articleNodes.length, topicCount: topicSummaries.length, pageCount: [...nodes.values()].filter((node) => node.type === "page").length, unusedConfiguredCategories: categorySummaries.filter((category) => category.configured && category.articleCount === 0).length, uncategorizedArticles, untaggedArticles, unconfiguredCategoryArticles, orphanArticles: articleNodes.filter((article) => !publishedEdges.some((edge) => edge.source === article.id || edge.target === article.id)).length, pendingSuggestions: pendingEdges.length, truncated, lastDerivedAt: input.derivedAt ?? new Date().toISOString() },
  };
}
