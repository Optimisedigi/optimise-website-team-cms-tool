/**
 * Pure maths for the Content Map UI, ported from the design files
 * (content-map.dc.html prep() and link-opportunities.dc.html prep()/renderVals()).
 * Data-driven: topics, colours and titles come from the snapshot.
 */
import type { ContentMapSnapshot, GscPageSignal, PlacementResult, PlanItem, ResearchIdea, ResearchLayer, ResearchView, SnapshotLink, SnapshotNode, SnapshotOpportunity, SnapshotRecommendation, SnapshotTopic, SuggestionView } from "./types";

export const INK = "oklch(0.24 0.012 85)";
export const MUTED = "oklch(0.52 0.01 85)";
export const RED = "oklch(0.52 0.17 25)";
export const GREEN = "oklch(0.55 0.13 160)";
export const BLUE = "oklch(0.55 0.15 258)";

const CORE_COLOUR = "oklch(0.34 0.04 210)";
const AUTHORITY_COLOURS = [
  "oklch(0.55 0.1 178)",
  "oklch(0.58 0.16 18)",
  "oklch(0.55 0.16 300)",
  "oklch(0.62 0.14 62)",
  "oklch(0.55 0.15 258)",
  "oklch(0.58 0.14 130)",
  "oklch(0.56 0.15 340)",
];
const GROUP_COLOURS: Record<string, string> = {
  service: "oklch(0.5 0.03 245)",
  proof: "oklch(0.6 0.015 85)",
  offtopic: "oklch(0.72 0.01 85)",
  other: "oklch(0.79 0.01 85)",
};
const UNKNOWN_AGG = "oklch(0.64 0.03 245)";

export interface MapTopic extends SnapshotTopic {
  c: string;
  agg: boolean;
}

/** Colours by role: core, authorities in order, then aggregate groups. */
export function assignTopicColours(topics: readonly SnapshotTopic[]): MapTopic[] {
  let a = 0;
  return topics.map((t) => {
    const agg = t.agg === true;
    let c: string;
    if (t.k === "core") c = CORE_COLOUR;
    else if (agg) c = GROUP_COLOURS[t.k] ?? UNKNOWN_AGG;
    else c = AUTHORITY_COLOURS[a++ % AUTHORITY_COLOURS.length] ?? CORE_COLOUR;
    return { ...t, agg, c };
  });
}

const SEP = / [-|–] /;

/**
 * Generic version of the design's short(): "/" becomes Homepage, and a trailing
 * " | Brand" / " – Brand" / " - Brand" is stripped when that brand repeats
 * across most of the titles that carry a suffix.
 */
export function makeShortTitle(nodes: readonly Pick<SnapshotNode, "t">[]): (n: Pick<SnapshotNode, "t">) => string {
  const counts = new Map<string, number>();
  let suffixed = 0;
  for (const n of nodes) {
    const parts = n.t.split(SEP);
    if (parts.length < 2) continue;
    suffixed++;
    const last = (parts[parts.length - 1] ?? "").split(":")[0]?.trim() ?? "";
    if (last) counts.set(last, (counts.get(last) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
  const brand = top && top[1] >= 3 && top[1] / Math.max(1, suffixed) >= 0.5 ? top[0] : null;
  const esc = brand?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = esc ? new RegExp(` [-|–] ${esc}.*$`) : null;
  return (n) => (n.t === "/" ? "Homepage" : re ? n.t.replace(re, "") : n.t);
}

export const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trim() + "…" : s);
export const sum = (a: readonly { w: number }[]) => a.reduce((x, l) => x + l.w, 0);

export interface MapNode extends SnapshotNode {
  i: number;
  title: string;
  inL: SnapshotLink[];
  outL: SnapshotLink[];
}

export interface TopicPos { x: number; y: number; r: number; lx: number; ly: number; rot: number; anchor: "start" | "end" }

export interface TopicState extends MapTopic {
  ix: number;
  nodes: MapNode[];
  pages: number;
  intra: number;
  noPeer: MapNode[];
  cov: number;
  R: number;
  pos: Record<number, TopicPos>;
  x: number;
  y: number;
  r: number;
}

export interface MapModel {
  topics: MapTopic[];
  N: MapNode[];
  L: SnapshotLink[];
  T: Record<string, TopicState>;
  M: Record<string, Record<string, SnapshotLink[]>>;
  gaps: Array<[string, string]>;
  linkTotal: number;
  short: (n: Pick<SnapshotNode, "t">) => string;
}

/** content-map.dc.html prep(), with topics from the snapshot. */
export function prepMap(snap: Pick<ContentMapSnapshot, "topics" | "nodes" | "links">): MapModel {
  const topics = assignTopicColours(snap.topics);
  const short = makeShortTitle(snap.nodes);
  const N: MapNode[] = snap.nodes.map((n, i) => ({ ...n, i, title: short(n), inL: [], outL: [] }));
  const known = new Set(topics.map((t) => t.k));
  const L = snap.links.filter((l) => N[l.s] && N[l.t] && l.s !== l.t);
  L.forEach((l) => {
    N[l.s]?.outL.push(l);
    N[l.t]?.inL.push(l);
  });
  const T: Record<string, TopicState> = {};
  const M: Record<string, Record<string, SnapshotLink[]>> = {};
  topics.forEach((t, ix) => {
    T[t.k] = { ...t, ix, nodes: [], pages: 0, intra: 0, noPeer: [], cov: 0, R: 150, pos: {}, x: 0, y: 0, r: 0 };
    const row: Record<string, SnapshotLink[]> = {};
    topics.forEach((b) => (row[b.k] = []));
    M[t.k] = row;
  });
  N.forEach((n) => T[n.g]?.nodes.push(n));
  L.forEach((l) => {
    const a = N[l.s]?.g ?? "";
    const b = N[l.t]?.g ?? "";
    if (known.has(a) && known.has(b)) M[a]?.[b]?.push(l);
  });
  topics.forEach((t, ix) => {
    const o = T[t.k] as TopicState;
    o.pages = t.agg ? (o.nodes[0]?.agg ?? o.nodes.length) : o.nodes.length;
    o.intra = M[t.k]?.[t.k]?.length ?? 0;
    if (!t.agg) {
      o.noPeer = o.nodes.filter((n) => !n.inL.some((l) => N[l.s]?.g === t.k));
      o.cov = o.nodes.length ? 1 - o.noPeer.length / o.nodes.length : 0;
      const ns = [...o.nodes].sort((a, b) => b.in - a.in);
      const n = ns.length;
      const R = Math.min(215, Math.max(150, (n * 27) / (2 * Math.PI)));
      o.R = R;
      ns.forEach((nd, k) => {
        const a = -Math.PI / 2 + (k / n) * 2 * Math.PI;
        const r = Math.min(14, 4.5 + Math.sqrt(nd.in) * 2.1);
        const left = Math.cos(a) < -0.001;
        const deg = (a * 180) / Math.PI;
        const lr = R + r + 8;
        o.pos[nd.i] = {
          x: 500 + Math.cos(a) * R,
          y: 430 + Math.sin(a) * R,
          r,
          lx: 500 + Math.cos(a) * lr,
          ly: 430 + Math.sin(a) * lr,
          rot: left ? deg + 180 : deg,
          anchor: left ? "end" : "start",
        };
      });
    }
    const a = -Math.PI / 2 + (ix / topics.length) * 2 * Math.PI;
    o.x = 500 + Math.cos(a) * 370;
    o.y = 345 + Math.sin(a) * 250;
    o.r = Math.min(52, 15 + Math.sqrt(o.pages) * 5);
  });
  const gaps: Array<[string, string]> = [];
  const seo = topics.filter((t) => !t.agg);
  seo.forEach((a) => seo.forEach((b) => {
    if (a.k !== b.k && !(M[a.k]?.[b.k]?.length)) gaps.push([a.k, b.k]);
  }));
  return { topics, N, L, T, M, gaps, linkTotal: sum(L), short };
}

/** Gap-matrix grid template: one column per topic (design had 11 fixed). */
export function matrixColumns(topicCount: number): string {
  return `150px repeat(${topicCount},minmax(40px,1fr))`;
}

// ---------------------------------------------------------------- opportunities

export interface OppPair {
  key: string;
  s: number;
  t: number;
  cos: number;
  dup: boolean;
  shared: string[];
  opp: SnapshotOpportunity;
}

export interface OppModel {
  all: MapNode[];
  N: MapNode[];
  L: SnapshotLink[];
  pos: Record<number, number>;
  segs: Array<{ k: string; x0: number; x1: number }>;
  pairs: OppPair[];
  topics: MapTopic[];
  TC: Record<string, MapTopic>;
}

/** link-opportunities.dc.html prep(), with GT opportunities instead of title cosine. */
export function prepOpps(snap: Pick<ContentMapSnapshot, "topics" | "nodes" | "links" | "opportunities">): OppModel {
  const topics = assignTopicColours(snap.topics).filter((t) => !t.agg);
  const TC: Record<string, MapTopic> = Object.fromEntries(topics.map((t) => [t.k, t]));
  const short = makeShortTitle(snap.nodes);
  const all: MapNode[] = snap.nodes.map((n, i) => ({ ...n, i, title: short(n), inL: [], outL: [] }));
  const N = all.filter((n) => !n.agg && TC[n.g] && !n.id.startsWith("AGG:"));
  const inN = new Set(N.map((n) => n.i));
  const L = snap.links.filter((l) => inN.has(l.s) && inN.has(l.t));
  const pos: Record<number, number> = {};
  const segs: OppModel["segs"] = [];
  let x = 30;
  const gap = 26;
  const step = (1140 - gap * (topics.length - 1)) / Math.max(1, N.length - 1);
  topics.forEach((t) => {
    const ns = N.filter((n) => n.g === t.k).sort((a, b) => b.in - a.in);
    if (!ns.length) return;
    const x0 = x;
    ns.forEach((n) => {
      pos[n.i] = x;
      x += step;
    });
    segs.push({ k: t.k, x0: x0 - 4, x1: x - step + 4 });
    x += gap;
  });
  const pairs: OppPair[] = snap.opportunities
    .filter((o) => inN.has(o.s) && inN.has(o.t) && o.s !== o.t)
    .map((o) => ({ key: o.key, s: o.s, t: o.t, cos: o.dup ? 0.15 : o.sim, dup: o.dup === true, shared: o.terms.slice(0, 4), opp: o }));
  return { all, N, L, pos, segs, pairs, topics, TC };
}

export type OppFilter = "all" | "gaps" | "within" | "across";

export interface ScoredPair extends OppPair {
  same: boolean;
  score: number;
  reasons: string[];
}

/** Live metrics + learned ranking, exactly as the design's renderVals(). */
export function scoreOpps(d: OppModel, accepted: ReadonlySet<string>, termW: Readonly<Record<string, number>>) {
  const { all, N, L, pairs, TC, topics } = d;
  const accPairs = pairs.filter((p) => accepted.has(p.key));
  const eff = [...L, ...accPairs.map((p) => ({ s: p.s, t: p.t, w: 1 }))];
  const peerIn = new Set<number>();
  const tg = new Set<string>();
  eff.forEach((l) => {
    const a = all[l.s]?.g;
    const b = all[l.t]?.g;
    if (a === b) peerIn.add(l.t);
    else tg.add(`${a}>${b}`);
  });
  const gapsOpen: string[] = [];
  topics.forEach((a) => topics.forEach((b) => {
    if (a.k !== b.k && !tg.has(`${a.k}>${b.k}`)) gapsOpen.push(`${a.k}>${b.k}`);
  }));
  const gapSet = new Set(gapsOpen);
  const scored: ScoredPair[] = pairs.map((p) => {
    const A = all[p.s] as MapNode;
    const B = all[p.t] as MapNode;
    const same = A.g === B.g;
    const reasons: string[] = [];
    let sc = p.cos;
    const lw = p.shared.reduce((x, t) => x + (termW[t] || 0), 0);
    sc *= Math.max(0.3, 1 + lw * 0.12);
    if (same && !peerIn.has(p.t)) {
      sc += 0.25;
      reasons.push("Target has no links from its own topic");
    }
    if (!same && gapSet.has(`${A.g}>${B.g}`)) {
      sc += 0.3;
      reasons.push(`Opens the ${TC[A.g]?.name} → ${TC[B.g]?.name} gap`);
    }
    if (B.in === 0) reasons.push("Target has no in-text links at all");
    if (p.dup) reasons.unshift("Same title on two URLs: possible cannibalisation. Consider merging or redirecting.");
    return { ...p, same, score: sc, reasons };
  });
  const cov = N.length ? Math.round((peerIn.size / N.length) * 100) : 0;
  return { scored, accPairs, peerIn, gapsOpen, cov };
}

export function filterPairs(scored: readonly ScoredPair[], f: OppFilter): ScoredPair[] {
  return scored.filter((p) => (f === "within" ? p.same : f === "across" ? !p.same : f === "gaps" ? p.reasons.length > 0 : true));
}

export function arcPath(x1: number, x2: number, up: boolean, maxH: number): string {
  const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
  const rx = (b - a) / 2;
  const ry = Math.min(maxH, rx * 0.85);
  return `M${a},330 A${rx},${ry} 0 0 ${up ? 1 : 0} ${b},330`;
}

export function learnLine(acceptedCount: number, dismissedCount: number, termW: Readonly<Record<string, number>>): string {
  const tw = Object.entries(termW).filter(([, w]) => w !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const up = tw.filter(([, w]) => w > 0).slice(0, 3).map(([t]) => t);
  const dn = tw.filter(([, w]) => w < 0).slice(0, 3).map(([t]) => t);
  if (!(acceptedCount + dismissedCount)) {
    return "Ranked by how closely the two pages match, plus a boost when the link closes a gap. Accept or dismiss to teach it what you want.";
  }
  return (
    `Learning from ${acceptedCount} accepted and ${dismissedCount} dismissed.` +
    (up.length ? ` Ranking up: ${up.join(", ")}.` : "") +
    (dn.length ? ` Ranking down: ${dn.join(", ")}.` : "")
  );
}

/** Client-side mirror of the server termW update, for optimistic UI. */
export function adjustTermW(termW: Readonly<Record<string, number>>, terms: readonly string[], delta: number): Record<string, number> {
  const next = { ...termW };
  terms.forEach((t) => (next[t] = (next[t] || 0) + delta));
  return next;
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function csvFor(rows: readonly string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

// ---------------------------------------------------------------- living layer

/** A plan item, or a bare snapshot recommendation from an older API (no reasons/origin). */
export type PlanLike = SnapshotRecommendation & Partial<Omit<PlanItem, keyof SnapshotRecommendation>>;

export interface GhostArticle { id: string; title: string; status: SuggestionView["status"]; x: number; y: number; r: number }
export interface GhostBridge { id: string; a: string; b: string; d: string; title: string; why: string; status: SuggestionView["status"] }
export interface GhostTopic { id: string; title: string; why: string; status: SuggestionView["status"]; x: number; y: number; r: number }
export interface SuggestionOverlay {
  /** Article ideas per topic key, in TopicChord coordinates (1000×860). */
  articles: Record<string, GhostArticle[]>;
  /** Bridges between two topic bubbles, in OverviewChart coordinates (1000×720). */
  bridges: GhostBridge[];
  /** New topics, as extra bubbles in the middle of the overview. */
  topics: GhostTopic[];
}

/**
 * Where pending/approved suggestions sit on the existing visuals. Pure: reads the
 * prepared model's positions and adds dashed "not yet real" shapes beside them.
 */
export function suggestionOverlay(model: Pick<MapModel, "T">, suggestions: readonly SuggestionView[]): SuggestionOverlay {
  const live = suggestions.filter((s) => s.status === "pending" || s.status === "approved");
  const articles: Record<string, GhostArticle[]> = {};
  for (const s of live) {
    if (s.kind !== "article" || !s.topic || !model.T[s.topic]) continue;
    (articles[s.topic] ??= []).push({ id: s.id, title: s.title, status: s.status, x: 0, y: 0, r: 7 });
  }
  for (const [k, list] of Object.entries(articles)) {
    const R = model.T[k]?.R ?? 150;
    // Inside the ring, below the centre label, spread side by side.
    list.forEach((g, ix) => { g.x = 500 + (ix - (list.length - 1) / 2) * 150; g.y = 430 + R * 0.5; });
  }
  const bridges: GhostBridge[] = [];
  for (const s of live) {
    if (s.kind !== "bridge" || !s.topic || !s.topicB) continue;
    const A = model.T[s.topic], B = model.T[s.topicB];
    if (!A || !B || A === B) continue;
    // Curve the other way from the real edges, so the dashed line stays visible.
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, cx = mx + (mx - 500) * 0.25, cy = my + (my - 345) * 0.25;
    bridges.push({ id: s.id, a: s.topic, b: s.topicB, d: `M${A.x},${A.y} Q${cx},${cy} ${B.x},${B.y}`, title: s.title, why: s.why, status: s.status });
  }
  const newTopics = live.filter((s) => s.kind === "topic");
  const topics: GhostTopic[] = newTopics.map((s, ix) => ({
    id: s.id, title: s.title, why: s.why, status: s.status,
    x: 500 + (ix - (newTopics.length - 1) / 2) * 170, y: 330, r: 24,
  }));
  return { articles, bridges, topics };
}

/** Bridge suggestions touching this topic pair, in either direction. */
export function bridgesFor(overlay: SuggestionOverlay, a: string, b: string): GhostBridge[] {
  return overlay.bridges.filter((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a));
}

// ---------------------------------------------------------------- research layers
// Overlays only: none of these change the base map maths. Every layer is off by default.

/** "8.4k", "1.3k", "480". */
export function fmtVolume(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toString()}k`;
  return String(Math.round(n));
}

/** "1,300". */
export const fmtCount = (n: number) => Math.round(n).toLocaleString("en-US");

/** Short date, "1 Oct". */
export function shortDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export const anyLayerOn = (layers: ReadonlySet<ResearchLayer>) => layers.size > 0;
/** An idea shows when any of its evidence layers is switched on (dismissed never on the map). */
export const ideaVisible = (idea: Pick<ResearchIdea, "layers" | "status">, layers: ReadonlySet<ResearchLayer>) =>
  idea.status !== "dismissed" && idea.layers.some((l) => layers.has(l));

export interface DemandRing { k: string; x: number; y: number; r: number; volume: number; covered: number; circ: number }
/** Overview demand rings: radius grows with the topic's share of the biggest topic's volume. */
export function demandRings(model: Pick<MapModel, "topics" | "T">, research: Pick<ResearchView, "topics">): DemandRing[] {
  const vols = model.topics.filter((t) => !t.agg).map((t) => research.topics[t.k]?.volume ?? 0);
  const max = Math.max(0, ...vols);
  if (!max) return [];
  return model.topics.flatMap((t) => {
    const o = model.T[t.k], tr = research.topics[t.k];
    if (t.agg || !o || !tr || !tr.volume) return [];
    const r = o.r + 13 + (tr.volume / max) * 16;
    return [{ k: t.k, x: o.x, y: o.y, r, volume: tr.volume, covered: Math.max(0, Math.min(1, tr.covered)), circ: 2 * Math.PI * r }];
  });
}

/** Demand between two topics, either order. */
export function pairDemand(research: Pick<ResearchView, "pairs">, a: string, b: string): { volume: number; ideas: number } | null {
  const p = research.pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  return p && p.volume > 0 ? { volume: p.volume, ideas: p.ideas } : null;
}

export interface ResearchDot { id: string; kind: "idea" | "query"; title: string; volume: number | null; x: number; y: number; r: number; labelled: boolean }
/** Topic view: visible research ideas (and, with Search Console on, unanswered queries) as a row of dots above the centre. */
export function researchDots(topic: Pick<TopicState, "k" | "R">, research: Pick<ResearchView, "ideas" | "gscQueries">, layers: ReadonlySet<ResearchLayer>, labelTop = 3): ResearchDot[] {
  const ideas = research.ideas.filter((i) => i.topic === topic.k && i.placement !== "new-topic" && ideaVisible(i, layers))
    .map((i) => ({ id: i.id, kind: "idea" as const, title: i.title, volume: i.volume, s: i.volume ?? 0 }));
  const queries = layers.has("gsc")
    ? research.gscQueries.flatMap((q, ix) => q.kind === "unanswered" && q.topic === topic.k ? [{ id: `q${ix}`, kind: "query" as const, title: q.query, volume: null, s: q.impressions / 10 }] : [])
    : [];
  const list = [...ideas, ...queries].sort((a, b) => b.s - a.s || a.id.localeCompare(b.id));
  const perRow = 4;
  return list.map((d, ix) => {
    const row = Math.floor(ix / perRow), col = ix % perRow;
    const inRow = Math.min(perRow, list.length - row * perRow);
    const x = 500 + (col - (inRow - 1) / 2) * 140;
    const y = 430 - topic.R * 0.52 - row * 56;
    const r = d.volume ? Math.min(11, 5 + Math.sqrt(d.volume) / 8) : 6;
    return { id: d.id, kind: d.kind, title: d.title, volume: d.volume, x, y, r, labelled: ix < labelTop };
  });
}

export interface ResearchTopicBubble { id: string; title: string; volume: number | null; x: number; y: number; r: number }
/** Overview: research ideas that need a new topic, as dashed bubbles below the centre (suggested topics sit above). */
export function researchNewTopics(research: Pick<ResearchView, "ideas">, layers: ReadonlySet<ResearchLayer>): ResearchTopicBubble[] {
  const list = research.ideas.filter((i) => i.placement === "new-topic" && ideaVisible(i, layers));
  return list.map((i, ix) => ({ id: i.id, title: i.newTopicName || i.title, volume: i.volume, x: 500 + (ix - (list.length - 1) / 2) * 170, y: 420, r: 22 }));
}

/** Cannibal queries in a topic whose first two pages are both on the ring. */
export function cannibalLines(topic: Pick<TopicState, "pos">, N: readonly Pick<MapNode, "id" | "i">[], research: Pick<ResearchView, "gscQueries">): Array<{ ix: number; query: string; a: TopicPos; b: TopicPos }> {
  const byId = new Map(N.map((n) => [n.id, n.i]));
  return research.gscQueries.flatMap((q, ix) => {
    if (q.kind !== "cannibal") return [];
    const [pa, pb] = q.pages;
    const a = pa ? topic.pos[byId.get(pa) ?? -1] : undefined, b = pb ? topic.pos[byId.get(pb) ?? -1] : undefined;
    return a && b ? [{ ix, query: q.query, a, b }] : [];
  });
}

/** Clicks dropped by a quarter or more vs the previous 28 days. */
export const gscDropped = (p: Pick<GscPageSignal, "clicksChange">) => p.clicksChange != null && p.clicksChange <= -0.25;

/** One plain line for where an idea goes. */
export function placementLine(p: Pick<PlacementResult, "placement" | "topic" | "pageTitle" | "newTopicName" | "why">, topicName: (k: string) => string): string {
  if (p.placement === "new-topic") return `Needs a new topic: ${p.newTopicName ?? "unnamed"}`;
  if (p.placement === "improve-page") return `Improve “${p.pageTitle ?? "an existing page"}” instead`;
  return p.why || (p.topic ? `Fits ${topicName(p.topic)}` : "");
}

/** Topics by monthly searches, biggest first. */
export function demandByTopic(research: Pick<ResearchView, "topics">, names: Readonly<Record<string, string>>): Array<{ k: string; name: string; volume: number; covered: number }> {
  return Object.values(research.topics).filter((t) => t.volume > 0 && names[t.key])
    .map((t) => ({ k: t.key, name: names[t.key] ?? t.key, volume: t.volume, covered: t.covered }))
    .sort((a, b) => b.volume - a.volume || a.k.localeCompare(b.k));
}

export interface OverviewLayerPart { key: "questions" | "gsc" | "unanswered"; text: string }

/** Overview lines under a topic bubble for the Questions and Search Console switches. */
export function overviewLayerParts(k: string, research: Pick<ResearchView, "topics" | "gscQueries">, layers: ReadonlySet<ResearchLayer>): OverviewLayerPart[] {
  const t = research.topics[k];
  const out: OverviewLayerPart[] = [];
  if (layers.has("questions") && t?.questions) out.push({ key: "questions", text: `${fmtCount(t.questions)} ${t.questions === 1 ? "question" : "questions"}` });
  if (layers.has("gsc")) {
    if (t?.gsc && t.gsc.impressions > 0) out.push({ key: "gsc", text: `${fmtVolume(t.gsc.impressions)} impressions · pos ${Math.round(t.gsc.position * 10) / 10}` });
    const unanswered = research.gscQueries.filter((q) => q.kind === "unanswered" && q.topic === k).length;
    if (unanswered) out.push({ key: "unanswered", text: `${unanswered} unanswered` });
  }
  return out;
}

/**
 * Muted notes for switches that are on but have nothing to show in the
 * current view (overview: topic === null), so a switch never looks dead.
 */
export function emptyLayerNotes(
  research: Pick<ResearchView, "topics" | "gscQueries" | "gscPages" | "ideas">,
  layers: ReadonlySet<ResearchLayer>,
  view: { topic: string | null; topicKeys: readonly string[]; nodeIds?: ReadonlySet<string> },
): string[] {
  const notes: string[] = [];
  const keys = view.topic ? [view.topic] : view.topicKeys;
  if (layers.has("questions")) {
    if (view.topic) {
      const any = research.ideas.some((i) => i.topic === view.topic && i.status !== "dismissed" && i.placement !== "new-topic" && i.layers.includes("questions"));
      if (!any) notes.push("Questions: no research ideas from questions in this topic yet");
    } else if (!keys.some((k) => (research.topics[k]?.questions ?? 0) > 0)) notes.push("Questions: no questions for these topics yet");
  }
  if (layers.has("gsc")) {
    const unanswered = research.gscQueries.some((q) => q.kind === "unanswered" && q.topic !== null && keys.includes(q.topic));
    if (view.topic) {
      const pages = research.gscPages.some((p) => view.nodeIds?.has(p.nodeId));
      const cannibal = research.gscQueries.some((q) => q.kind === "cannibal" && q.pages.some((id) => view.nodeIds?.has(id)));
      if (!pages && !unanswered && !cannibal) notes.push("Search Console: no data for this topic yet");
    } else if (!unanswered && !keys.some((k) => (research.topics[k]?.gsc?.impressions ?? 0) > 0)) notes.push("Search Console: no data for these topics yet");
  }
  return notes;
}
