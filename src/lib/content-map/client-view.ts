/**
 * Client-safe Content Map data. The client view (PIN cookie, or a staff
 * member previewing it) gets the map, the topics, the planned articles and
 * the links being added — and none of the team's working state:
 *
 * - no dismissed suggestions, learned weights or cannibalisation flags
 * - no drafted edit text, model names, failure notes or run errors
 * - no CMS ids (blog prompts, articles, client record)
 *
 * Everything is rebuilt field by field (allowlist), so a new internal field
 * added later never leaks by default.
 */

import type { CitationsView, ContentMapApiResponse, ContentMapSnapshot, InProgressItem, LinkAction, PlacementResult, PlanItem, ResearchIdea, ResearchView, SnapshotRecommendation, SuggestionView } from "./types";

const PLANNED: LinkAction = {
  status: "drafted",
  source: null,
  original: "",
  replacement: "",
  anchor: "",
  note: "",
  model: "",
  blogPostId: null,
  appliedAt: null,
};

function cleanRec(r: SnapshotRecommendation): SnapshotRecommendation {
  return {
    id: r.id,
    topic: r.topic,
    overlaps: [...r.overlaps],
    title: r.title,
    question: r.question,
    why: r.why,
    priority: r.priority,
    score: r.score,
    ...(r.primaryKeyword ? { primaryKeyword: r.primaryKeyword } : {}),
    secondaryKeywords: [...r.secondaryKeywords],
    outline: [...r.outline],
    geo: { answerFirst: r.geo.answerFirst, entities: [...r.geo.entities], faqs: [...r.geo.faqs], evidence: [...r.geo.evidence], schema: [...r.geo.schema] },
    linksTo: [...r.linksTo],
    linksFrom: [...r.linksFrom],
  };
}

const cleanSources = (list: ReadonlyArray<{ url: string; domain: string; title: string }>) => list.map((s) => ({ url: s.url, domain: s.domain, title: s.title }));

function cleanPlanItem(p: PlanItem): PlanItem {
  return {
    ...cleanRec(p),
    origin: p.origin,
    // Research competitor reasons: counts only for the client (no domains).
    reasons: p.reasons.map((r) => ({ kind: r.kind, text: r.text, ...(r.engines ? { engines: [...r.engines] } : {}), ...(r.domains && r.kind !== "competitors" ? { domains: [...r.domains] } : {}) })),
    ...(p.sources ? { sources: cleanSources(p.sources) } : {}),
    ...(p.cover ? { cover: [...p.cover] } : {}),
    ...(p.beat ? { beat: [...p.beat] } : {}),
    ...(p.suggestionId ? { suggestionId: p.suggestionId } : {}),
    ...(p.volume !== undefined ? { volume: p.volume } : {}),
    ...(p.researchId ? { researchId: p.researchId } : {}),
  };
}

function cleanPlacement(p: PlacementResult): PlacementResult {
  return {
    topic: p.topic,
    fit: p.fit,
    overlaps: [...p.overlaps],
    placement: p.placement,
    pageId: p.pageId,
    pageTitle: p.pageTitle,
    newTopicName: p.newTopicName,
    linksTo: p.linksTo.map((l) => ({ id: l.id, title: l.title })),
    linksFrom: p.linksFrom.map((l) => ({ id: l.id, title: l.title })),
    why: p.why,
    warnings: [...p.warnings],
  };
}

function cleanIdea(i: ResearchIdea): ResearchIdea {
  return {
    ...cleanPlacement(i),
    id: i.id,
    title: i.title,
    question: i.question,
    layers: [...i.layers],
    // Evidence text is built by code (counts only); domains are team-only.
    evidence: i.evidence.map((e) => ({
      source: e.source,
      text: e.text,
      ...(e.volume !== undefined ? { volume: e.volume } : {}),
      ...(e.competitors !== undefined ? { competitors: e.competitors } : {}),
      ...(e.impressions !== undefined ? { impressions: e.impressions } : {}),
      ...(e.position !== undefined ? { position: e.position } : {}),
    })),
    volume: i.volume,
    keywords: [...i.keywords],
    status: i.status,
    planItemId: i.planItemId,
  };
}

function cleanResearch(r: ResearchView): ResearchView {
  return {
    status: r.status,
    error: null,
    generatedAt: r.generatedAt,
    gscAt: r.gscAt,
    gscConnected: r.gscConnected,
    location: r.location,
    topics: Object.fromEntries(
      Object.entries(r.topics).map(([k, t]) => [
        k,
        { key: t.key, volume: t.volume, keywords: t.keywords, covered: t.covered, questions: t.questions, competitorPages: t.competitorPages, competitorDomains: [], gsc: t.gsc ? { clicks: t.gsc.clicks, impressions: t.gsc.impressions, position: t.gsc.position } : null },
      ]),
    ),
    ideas: r.ideas.filter((i) => i.status !== "dismissed").map(cleanIdea),
    gscPages: r.gscPages.map((p) => ({ nodeId: p.nodeId, clicks: p.clicks, impressions: p.impressions, position: p.position, clicksChange: p.clicksChange, topQueries: p.topQueries.map((q) => ({ query: q.query, impressions: q.impressions, position: q.position })) })),
    gscQueries: r.gscQueries.map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.position, pages: [...q.pages], kind: q.kind, topic: q.topic })),
    pairs: r.pairs.map((p) => ({ a: p.a, b: p.b, volume: p.volume, ideas: p.ideas })),
    insightsModel: "",
  };
}

const cleanInProgress = (i: InProgressItem): InProgressItem => ({ id: i.id, kind: i.kind, title: i.title, cmsId: null, placement: i.placement ? cleanPlacement(i.placement) : null });

/** Public helper for the PIN placement route. */
export const toClientPlacement = cleanPlacement;

/** The client's own suggestions (any status) + approved team/AI ones. No dismiss reasons, no staff names. */
function cleanSuggestions(list: readonly SuggestionView[]): SuggestionView[] {
  return list
    .filter((s) => s.origin === "client" || s.status === "approved")
    .map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      why: s.why,
      topic: s.topic,
      topicB: s.topicB,
      status: s.status,
      origin: s.origin,
      suggestedBy: s.origin === "client" ? "You" : "Optimise Digital",
      createdAt: s.createdAt,
      decidedAt: s.decidedAt,
      recommendationId: s.recommendationId ?? null,
    }));
}

function cleanCitations(c: CitationsView): CitationsView {
  return {
    status: c.status,
    error: null,
    generatedAt: c.generatedAt,
    engines: [...c.engines],
    questions: c.questions.map((q) => ({
      id: q.id,
      topic: q.topic,
      question: q.question,
      source: q.source,
      checks: q.checks.map((k) => ({ engine: k.engine, ok: k.ok, clientCited: k.clientCited, clientMentioned: k.clientMentioned, citedDomains: [...k.citedDomains] })),
    })),
    byTopic: Object.fromEntries(Object.entries(c.byTopic).map(([k, v]) => [k, { questions: v.questions, checks: v.checks, cited: v.cited }])),
    trend: c.trend.map((t) => ({ generatedAt: t.generatedAt, checks: t.checks, cited: t.cited })),
    topDomains: c.topDomains.map((d) => ({ domain: d.domain, count: d.count })),
    refresh: c.refresh.map((r) => ({ id: r.id, nodeId: r.nodeId, topic: r.topic, question: r.question, missing: [...r.missing], sources: cleanSources(r.sources), why: r.why })),
    insightsModel: "",
  };
}

function cleanSnapshot(snap: ContentMapSnapshot, dismissed: ReadonlySet<string>): ContentMapSnapshot {
  return {
    version: 1,
    clientId: "",
    siteUrl: snap.siteUrl,
    generatedAt: snap.generatedAt,
    crawledAt: snap.crawledAt,
    mode: snap.mode,
    ai: { embeddings: snap.ai.embeddings, llm: snap.ai.llm, ...(snap.ai.ideas ? { ideas: { model: "", generatedAt: snap.ai.ideas.generatedAt } } : {}) },
    topics: snap.topics.map((t) => ({ k: t.k, name: t.name, ...(t.primary ? { primary: true } : {}), ...(t.agg ? { agg: true } : {}), ...(t.description ? { description: t.description } : {}) })),
    nodes: snap.nodes.map((n) => ({
      id: n.id,
      g: n.g,
      t: n.t,
      in: n.in,
      out: n.out,
      ...(n.agg !== undefined ? { agg: n.agg } : {}),
      ...(n.status ? { status: n.status } : {}),
      ...(n.fit !== undefined ? { fit: n.fit } : {}),
      ...(n.overlaps ? { overlaps: n.overlaps.map((o) => ({ k: o.k, s: o.s })) } : {}),
      ...(n.words !== undefined ? { words: n.words } : {}),
    })),
    links: snap.links.map((l) => ({ s: l.s, t: l.t, w: l.w })),
    opportunities: snap.opportunities
      .filter((o) => !dismissed.has(o.key) && !o.dup)
      .map((o) => ({ key: o.key, s: o.s, t: o.t, sim: o.sim, terms: [...o.terms], ...(o.why ? { why: o.why } : {}) })),
    recommendations: snap.recommendations.map(cleanRec),
    stats: { pagesCrawled: snap.stats.pagesCrawled, mapped: snap.stats.mapped, links: snap.stats.links, orphans: snap.stats.orphans },
  };
}

export function toClientView(state: ContentMapApiResponse): ContentMapApiResponse {
  const dismissed = new Set(state.decisions.filter((d) => d.decision === "dismissed").map((d) => d.key));
  const accepted = state.decisions.filter((d) => d.decision === "accepted").map((d) => ({ key: d.key, decision: "accepted" as const }));
  const actions: Record<string, LinkAction> = {};
  for (const { key } of accepted) {
    const a = state.actions?.[key];
    const done = a?.status === "applied" || a?.status === "already-linked";
    actions[key] = done ? { ...PLANNED, status: "applied", appliedAt: a?.appliedAt ?? null } : { ...PLANNED };
  }
  const run = state.run;
  return {
    client: {
      id: "",
      name: state.client.name,
      slug: state.client.slug ?? null,
      siteUrl: state.client.siteUrl,
      enabled: state.client.enabled,
      authorities: state.client.authorities.map((a) => ({ key: a.key, name: a.name, primary: a.primary, ...(a.description ? { description: a.description } : {}) })),
    },
    // A failed run is the team's problem; the client keeps seeing the last good map.
    run: run && run.status === "running"
      ? { runId: "", status: "running", mode: run.mode ?? null, phase: run.phase ?? null, pagesCrawled: run.pagesCrawled ?? null, error: null, startedAt: run.startedAt ?? null }
      : null,
    snapshot: state.snapshot ? cleanSnapshot(state.snapshot, dismissed) : null,
    decisions: accepted,
    termW: {},
    sent: Object.fromEntries(Object.keys(state.sent).map((id) => [id, "1"])),
    history: state.history.map((h) => ({ generatedAt: h.generatedAt, stats: h.stats ? { pagesCrawled: h.stats.pagesCrawled, mapped: h.stats.mapped, links: h.stats.links, orphans: h.stats.orphans } : null })),
    actions,
    ...(state.plan ? { plan: state.plan.map(cleanPlanItem) } : {}),
    ...(state.suggestions ? { suggestions: cleanSuggestions(state.suggestions) } : {}),
    ...(state.citations !== undefined ? { citations: state.citations ? cleanCitations(state.citations) : null } : {}),
    ...(state.research !== undefined ? { research: state.research ? cleanResearch(state.research) : null } : {}),
    ...(state.inProgress ? { inProgress: state.inProgress.map(cleanInProgress) } : {}),
  };
}
