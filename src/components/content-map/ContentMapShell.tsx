"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CitationsView, ContentMapApiResponse, ContentMapDecision, LinkAction, PlacementResult, ResearchLayer, TrackedQuestionView } from "@/lib/content-map/types";
import { contentMapPath } from "@/lib/content-map/paths";
import { adjustTermW, formatDay, type PlanLike, prepMap, prepOpps, suggestionOverlay } from "@/lib/content-map/view-model";
import type { LinkBusy } from "./LinkEdit";
import { Approach } from "./Approach";
import { Citations } from "./Citations";
import { ClientSuggestions, type SuggestDraft, SuggestForm, TeamSuggestions } from "./living";
import { type DecisionKind, LinkOpportunities } from "./LinkOpportunities";
import type { MapNav } from "./MapPanels";
import { type MapResearch, MapView } from "./MapView";
import { InProgressList, type ResearchAction, ResearchList, type ResearchTeam, showResearch } from "./research";
import { st } from "./st";
import { ACTIVE_TAB, GHOST_BTN } from "./ui";
import RocketSplash from "../RocketSplash";
import { WriteNext } from "./WriteNext";
import "./ClientContentMap.css";

export type Audience = "team" | "client";
type Tab = "approach" | "map" | "matrix" | "cites" | "opps" | "write";
// Same tabs for both audiences; the client view names them for the reader, not the editor.
const TABS: Record<Audience, Array<[Tab, string]>> = {
  team: [["approach", "Approach"], ["map", "Map"], ["matrix", "Gap matrix"], ["cites", "AI citations"], ["opps", "Link opportunities"], ["write", "Write next"]],
  client: [["approach", "Approach"], ["map", "Map"], ["matrix", "Gap matrix"], ["cites", "AI citations"], ["opps", "Internal links"], ["write", "Planned articles"]],
};
const POLL_MS = 10_000;
const IDEAS_POLL_MS = 15_000;
const IDEAS_WAIT_MS = 10 * 60_000;
const FONT_HREF = "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
// The design's own document defaults (16px, normal line height), so host page styles don't leak in.
const ROOT_BASE = "display:grid;grid-template-rows:auto minmax(0,1fr);min-height:680px;width:100%;font-family:'Instrument Sans',sans-serif;font-size:16px;line-height:normal;color:oklch(0.24 0.012 85);background:oklch(0.975 0.005 85);overflow:hidden";
const ROOT: Record<"embedded" | "page", string> = {
  embedded: `${ROOT_BASE};height:calc(100vh - 160px);border:1px solid oklch(0.9 0.006 85);border-radius:10px`,
  // Leaves room for ContentMapPage's 40px "Managed by" bar so both fit the window.
  page: `${ROOT_BASE};height:calc(100vh - 40px)`,
};
const STATE_BOX = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:40px;text-align:center";
const STATE_TEXT = "font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);max-width:460px;text-wrap:pretty";

const EMPTY_CITATIONS: CitationsView = { status: "none", error: null, generatedAt: null, engines: [], questions: [], byTopic: {}, groups: { existing: { questions: 0, checks: 0, cited: 0 }, planned: { questions: 0, checks: 0, cited: 0 } }, trend: [], topDomains: [], refresh: [], insightsModel: "" };

async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body), signal });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: typeof json.error === "string" ? json.error : `HTTP ${res.status}` };
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function useWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [w, setW] = useState(1400);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { const v = el.getBoundingClientRect().width; if (v > 0) setW(v); };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

interface ShellProps {
  clientId: string;
  /** Client URL slug; required for the client audience (its data comes from the PIN-gated view route). */
  slug?: string;
  /** `embedded` sits in the client record's Blog Posts tab; `page` is /SEO/Topic-association-linking/<slug>. */
  variant?: "embedded" | "page";
  /** `team`: strategy + actions. `client`: read-only view of the approach. */
  audience?: Audience;
  /** Signed-in staff (shows the team/client view switch on the page). */
  staff?: boolean;
}

export function ContentMapShell({ clientId, slug, variant = "embedded", audience = "team", staff = false }: ShellProps) {
  const isClient = audience === "client";
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const [data, setData] = useState<ContentMapApiResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(isClient ? "approach" : "map");
  const [nav, setNav] = useState<MapNav>({ topic: null, sel: null, pair: null });
  const [recSel, setRecSel] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ContentMapDecision>>({});
  const [termW, setTermW] = useState<Record<string, number>>({});
  const [sent, setSent] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [actions, setActions] = useState<Record<string, LinkAction>>({});
  const [linkBusy, setLinkBusy] = useState<Record<string, LinkBusy>>({});
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({});
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [decideBusy, setDecideBusy] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [citeBusy, setCiteBusy] = useState(false);
  const [citeError, setCiteError] = useState<string | null>(null);
  // Research layers: all off each time the page opens; never persisted (user rule).
  const [layers, setLayers] = useState<ReadonlySet<ResearchLayer>>(() => new Set());
  const [researchStarting, setResearchStarting] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchBusy, setResearchBusy] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const url = isClient ? `/api/content-map/view?slug=${encodeURIComponent(slug ?? "")}` : `/api/content-map?clientId=${encodeURIComponent(clientId)}`;
      const res = await fetch(url, { credentials: "include", signal });
      const json = (await res.json().catch(() => ({}))) as ContentMapApiResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setLoadError(null);
      setDecisions(Object.fromEntries((json.decisions ?? []).map((d) => [d.key, d.decision])));
      setTermW(json.termW ?? {});
      setSent(json.sent ?? {});
      setActions(json.actions ?? {});
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setLoadError((err as Error).message);
    }
  }, [clientId, slug, isClient]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const running = data?.run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const ac = new AbortController();
    const id = setInterval(() => void load(ac.signal), POLL_MS);
    return () => { clearInterval(id); ac.abort(); };
  }, [running, load]);

  const citesRunning = data?.citations?.status === "running";
  useEffect(() => {
    if (!citesRunning || running) return;
    const ac = new AbortController();
    const id = setInterval(() => void load(ac.signal), IDEAS_POLL_MS);
    return () => { clearInterval(id); ac.abort(); };
  }, [citesRunning, running, load]);

  const researchRunning = data?.research?.status === "running";
  useEffect(() => {
    if (!researchRunning || running) return;
    const ac = new AbortController();
    const id = setInterval(() => void load(ac.signal), IDEAS_POLL_MS);
    return () => { clearInterval(id); ac.abort(); };
  }, [researchRunning, running, load]);

  const snap = data?.snapshot ?? null;
  // GT ran without an LLM: the CMS writes ideas in the background after
  // ingest. Keep checking for a while so they appear without a reload.
  const templateIdeas = !!snap && !snap.ai.ideas;
  const ideasExpected = templateIdeas && Date.now() - Date.parse(snap?.generatedAt ?? "") < IDEAS_WAIT_MS;
  useEffect(() => {
    if (!ideasExpected || running) return;
    const ac = new AbortController();
    const id = setInterval(() => void load(ac.signal), IDEAS_POLL_MS);
    return () => { clearInterval(id); ac.abort(); };
  }, [ideasExpected, running, load]);
  const mapModel = useMemo(() => (snap ? prepMap(snap) : null), [snap]);
  const oppModel = useMemo(() => (snap ? prepOpps(snap) : null), [snap]);
  // The merged plan when the API sends it; older APIs only have the snapshot's ideas.
  const recs: PlanLike[] = data?.plan ?? snap?.recommendations ?? [];
  const suggestions = useMemo(() => data?.suggestions ?? [], [data?.suggestions]);
  const overlay = useMemo(() => (mapModel ? suggestionOverlay(mapModel, suggestions) : undefined), [mapModel, suggestions]);
  const citations = data?.citations ?? null;
  const accepted = Object.keys(decisions).filter((k) => decisions[k] === "accepted").sort();
  const dismissed = Object.keys(decisions).filter((k) => decisions[k] === "dismissed").sort();

  const reanalyse = async () => {
    setStarting(true);
    setRunError(null);
    const res = await postJson("/api/content-map/run", { clientId, mode: "full" });
    setStarting(false);
    if (!res.ok) { setRunError(res.error); return; }
    const run = res.json.run as ContentMapApiResponse["run"];
    setData((d) => (d ? { ...d, run } : d));
  };

  const decide = async (key: string, decision: DecisionKind, terms: readonly string[]) => {
    const prevDecisions = decisions, prevW = termW;
    const was = decisions[key];
    let nextW = termW;
    const nextD = { ...decisions };
    if (decision === "undo") {
      if (was) nextW = adjustTermW(termW, terms, was === "accepted" ? -1 : 1);
      delete nextD[key];
    } else {
      if (was) nextW = adjustTermW(nextW, terms, was === "accepted" ? -1 : 1);
      nextW = adjustTermW(nextW, terms, decision === "accepted" ? 1 : -1);
      nextD[key] = decision;
    }
    setDecisions(nextD);
    setTermW(nextW);
    const res = await postJson("/api/content-map/decision", { clientId, key, decision });
    if (!res.ok) { setDecisions(prevDecisions); setTermW(prevW); return; }
    if (decision === "undo") setActions(({ [key]: _gone, ...rest }) => rest);
    // Accepting starts the draft right away; nothing is applied without a click.
    if (decision === "accepted" && !actions[key]) void draftLink(key, false);
  };

  const setBusy = (key: string, busy: LinkBusy | null) =>
    setLinkBusy(({ [key]: _old, ...rest }) => (busy ? { ...rest, [key]: busy } : rest));
  const setLinkError = (key: string, error: string | null) =>
    setLinkErrors(({ [key]: _old, ...rest }) => (error ? { ...rest, [key]: error } : rest));

  const draftLink = async (key: string, redo: boolean) => {
    setBusy(key, "drafting");
    setLinkError(key, null);
    const res = await postJson("/api/content-map/links/draft", { clientId, key, redo });
    setBusy(key, null);
    if (!res.ok) { setLinkError(key, res.error); return; }
    setActions((a) => ({ ...a, [key]: res.json.action as LinkAction }));
  };

  const applyLink = async (key: string) => {
    setBusy(key, "applying");
    setLinkError(key, null);
    const res = await postJson("/api/content-map/links/apply", { clientId, key });
    setBusy(key, null);
    if (!res.ok) { setLinkError(key, res.error); return; }
    setActions((a) => ({ ...a, [key]: res.json.action as LinkAction }));
  };

  const writeIdeas = async () => {
    setIdeasBusy(true);
    setIdeasError(null);
    const res = await postJson("/api/content-map/ideas", { clientId });
    setIdeasBusy(false);
    if (!res.ok) { setIdeasError(res.error); return; }
    await load();
  };

  const send = async (recommendationId: string) => {
    setSending(recommendationId);
    setSendError(null);
    const res = await postJson("/api/content-map/recommendations/send", { clientId, recommendationId });
    setSending(null);
    if (!res.ok) { setSendError(res.error); return; }
    const id = res.json.blogPromptId;
    if (typeof id === "string" || typeof id === "number") setSent((s) => ({ ...s, [recommendationId]: String(id) }));
  };

  const submitSuggestion = async (d: SuggestDraft) => {
    setSuggestBusy(true);
    setSuggestError(null);
    const res = isClient
      ? await postJson("/api/content-map/view/suggestions", { slug, ...d })
      : await postJson("/api/content-map/suggestions", { clientId, ...d });
    setSuggestBusy(false);
    if (!res.ok) { setSuggestError(res.error); return; }
    setSuggestOpen(false);
    await load();
  };

  const decideSuggestion = async (id: string, decision: "approve" | "dismiss", reason?: string) => {
    setDecideBusy(id);
    setDecideError(null);
    const res = await postJson("/api/content-map/suggestions/decide", { clientId, id, decision, ...(reason ? { reason } : {}) });
    setDecideBusy(null);
    if (!res.ok) { setDecideError(res.error); return; }
    await load();
  };

  const setQuestions = (questions: TrackedQuestionView[]) =>
    setData((d) => (d ? { ...d, citations: { ...(d.citations ?? EMPTY_CITATIONS), questions } } : d));
  const editQuestion = async (body: Record<string, unknown>) => {
    setCiteError(null);
    const res = await postJson("/api/content-map/questions", { clientId, ...body });
    if (!res.ok) { setCiteError(res.error); return; }
    if (Array.isArray(res.json.questions)) setQuestions(res.json.questions as TrackedQuestionView[]);
  };

  const runCitations = async () => {
    setCiteBusy(true);
    setCiteError(null);
    const res = await postJson("/api/content-map/citations/run", { clientId });
    setCiteBusy(false);
    if (!res.ok) { setCiteError(res.error); return; }
    setData((d) => (d ? { ...d, citations: { ...(d.citations ?? EMPTY_CITATIONS), status: "running" } } : d));
  };

  const runResearch = async () => {
    setResearchStarting(true);
    setResearchError(null);
    const res = await postJson("/api/content-map/research/run", { clientId });
    setResearchStarting(false);
    if (!res.ok) { setResearchError(res.error); return; }
    setData((d) => (d?.research ? { ...d, research: { ...d.research, status: "running" } } : d));
  };

  const decideResearch = async (id: string, action: ResearchAction) => {
    setResearchBusy(id);
    setResearchError(null);
    const res = await postJson("/api/content-map/research/decide", { clientId, id, action });
    setResearchBusy(null);
    if (!res.ok) { setResearchError(res.error); return; }
    await load();
  };

  const checkPlacement = async (d: { title: string; why: string; topic?: string }): Promise<{ ok: true; result: PlacementResult } | { ok: false; error: string }> => {
    const body = { title: d.title, ...(d.why ? { why: d.why } : {}), ...(d.topic ? { topic: d.topic } : {}) };
    const res = isClient
      ? await postJson("/api/content-map/view/placement", { slug, ...body })
      : await postJson("/api/content-map/placement", { clientId, ...body });
    if (!res.ok) return res;
    // The result may come bare or wrapped ({ result } / { placement: {...} }); PlacementResult has its own string `placement`.
    const wrapped = [res.json.result, res.json.placement].find((v) => typeof v === "object" && v !== null && !Array.isArray(v));
    const result = (wrapped ?? res.json) as unknown as PlacementResult;
    if (typeof result.placement !== "string") return { ok: false, error: "No placement in the reply" };
    return { ok: true, result };
  };

  const toggleLayer = (l: ResearchLayer) => setLayers((prev) => {
    const next = new Set(prev);
    if (next.has(l)) next.delete(l); else next.add(l);
    return next;
  });
  const researchTeam: ResearchTeam | undefined = isClient ? undefined : { running: researchStarting, error: researchError, busy: researchBusy, onRun: () => void runResearch(), onDecide: (id, a) => void decideResearch(id, a) };
  const mapResearch: MapResearch = { view: data?.research, layers, onToggle: toggleLayer, audience, team: researchTeam };
  const researchView = showResearch(data?.research) ? data.research : null;
  const inProgress = data?.inProgress ?? [];

  const openRec = (id: string) => { setRecSel(id); setTab("write"); };
  const openNode = (nodeId: string) => {
    if (!mapModel) return;
    const n = mapModel.N.find((x) => x.id === nodeId);
    if (!n) return;
    setNav(n.agg ? { topic: n.g, sel: null, pair: null } : { topic: n.g, sel: n.i, pair: null });
    setTab("map");
  };

  // The date the map was made already sits in the top line; this only speaks up while it's being updated.
  const statusLine = running
    ? isClient ? "Updating your map…" : `Analysing… ${data?.run?.pagesCrawled ?? 0} pages`
    : "";

  const clientAdmin = `/admin/collections/clients/${encodeURIComponent(clientId)}`;
  const stateBox = (text: string, action?: { label: string; onClick?: () => void; href?: string }) => (
    <div style={st(STATE_BOX)}>
      <div style={st(STATE_TEXT)}>{text}</div>
      {action?.href ? <a href={action.href} style={st(`${GHOST_BTN};text-decoration:none`)}>{action.label}</a> : null}
      {action?.onClick ? <button type="button" onClick={action.onClick} style={st(GHOST_BTN)}>{action.label}</button> : null}
    </div>
  );
  // The Optimise Digital rocket (same loader as the rest of the CMS) while the
  // map loads, the moment Analyse is pressed, and through the first analysis.
  const rocketBox = (label: string, detail?: string) => (
    <div data-testid="ccm-rocket" style={st(`${STATE_BOX};height:100%;gap:6px;padding-bottom:90px`)}>
      <RocketSplash label={label} />
      {detail ? <div style={st(STATE_TEXT)}>{detail}</div> : null}
    </div>
  );
  const pages = data?.run?.pagesCrawled ?? 0;
  const phaseLine = (() => {
    switch (data?.run?.phase) {
      case "queued": return "Waiting for a free slot to start";
      case "crawling": return pages ? `Reading the site · ${pages} pages so far` : "Reading the site";
      case "classifying": return `Sorting ${pages || "the"} pages into topics`;
      case "linking": return "Tracing links and finding link opportunities";
      case "recommending": return "Planning what to write next";
      default: return pages ? `${pages} pages read so far` : "Starting up";
    }
  })();
  const fullPage = variant === "embedded" && !isClient && data?.client.slug ? contentMapPath(data.client.slug) : null;
  // Staff on the page can flip between the team view and what the client sees.
  const pagePath = slug ? contentMapPath(slug) : null;
  const viewSwitch = staff && variant === "page" && pagePath
    ? isClient ? { label: "Team view", href: pagePath } : { label: "Client view", href: `${pagePath}?view=client` }
    : null;
  const appliedCount = Object.values(actions).filter((a) => a.status === "applied" || a.status === "already-linked").length;

  const openSuggest = () => { setSuggestError(null); setSuggestOpen(true); };
  const teamSuggestions = !isClient && mapModel
    ? <TeamSuggestions model={mapModel} suggestions={suggestions} busy={decideBusy} error={decideError} onDecide={(id, d, r) => void decideSuggestion(id, d, r)} />
    : null;
  const tight = width < 1500;

  let body: React.ReactNode;
  if (loadError && !data) body = stateBox(isClient ? "Couldn't load your content map. Please try again." : `Couldn't load the content map: ${loadError}`, { label: "Retry", onClick: () => void load() });
  else if (!data) body = rocketBox(isClient ? "Loading your content map" : "Loading the content map");
  else if (!data.client.enabled) body = stateBox(isClient ? "This content map isn't switched on yet." : "Content Map analysis is switched off for this client. Switch it on, with topic authorities, in the Blog Settings tab → Content Map.", variant === "page" && !isClient ? { label: "Open client", href: clientAdmin } : undefined);
  else if (!snap && isClient) body = running ? rocketBox("Preparing your content map", "This page updates by itself when it's ready.") : stateBox("Your content map is being prepared.");
  else if (!snap && (running || starting)) body = rocketBox("Analysing the site", starting && !running ? "Starting the analysis" : `${phaseLine}. This usually takes a few minutes; the map appears here by itself.`);
  else if (!snap && data.run?.status === "failed") body = stateBox(`The analysis failed: ${data.run.error ?? "unknown error"}`, { label: "Retry", onClick: () => void reanalyse() });
  else if (!snap || !mapModel || !oppModel) body = stateBox("No analysis yet.", { label: "Analyse now", onClick: () => void reanalyse() });
  else if (tab === "approach") body = <Approach model={mapModel} snapshot={snap} clientName={data.client.name} authorities={data.client.authorities} recs={recs} sent={sent} linksPlanned={accepted.length} linksAdded={appliedCount} audience={audience} width={width} onOpenTopic={(k) => { setNav({ topic: k, sel: null, pair: null }); setTab("map"); }} onOpenRec={openRec} onOpenLinks={() => setTab("opps")} citations={citations} onOpenCitations={() => setTab("cites")} research={researchView} inProgress={inProgress} suggestions={isClient ? <ClientSuggestions model={mapModel} suggestions={suggestions} onSuggest={openSuggest} /> : null} />;
  else if (tab === "cites") body = isClient
    ? <Citations model={mapModel} citations={citations} audience={audience} width={width} onOpenNode={openNode} />
    : <Citations model={mapModel} citations={citations} audience={audience} width={width} onOpenNode={openNode} team={{ busy: citeBusy, error: citeError, onRun: () => void runCitations(), onAdd: (topic, question) => void editQuestion({ action: "add", topic, question }), onRemove: (id) => void editQuestion({ action: "remove", id }) }} />;
  else if (tab === "opps") body = isClient
    ? <LinkOpportunities model={oppModel} accepted={accepted} dismissed={[]} termW={{}} width={width} onDecide={() => undefined} actions={actions} readOnly />
    : <LinkOpportunities model={oppModel} accepted={accepted} dismissed={dismissed} termW={termW} width={width} onDecide={(k, d, t) => void decide(k, d, t)} actions={actions} linkBusy={linkBusy} linkErrors={linkErrors} onDraft={(k, redo) => void draftLink(k, redo)} onApply={(k) => void applyLink(k)} />;
  else if (tab === "write") body = isClient
    ? <WriteNext model={mapModel} recs={recs} selected={recSel} sent={sent} sending={null} sendError={null} width={width} onSelect={setRecSel} onSend={() => undefined} onOpenNode={openNode} readOnly top={<ClientSuggestions model={mapModel} suggestions={suggestions} onSuggest={openSuggest} />} research={researchView} bottom={<>{researchView ? <ResearchList research={researchView} model={mapModel} /> : null}<InProgressList items={inProgress} model={mapModel} audience={audience} /></>} />
    : <WriteNext model={mapModel} recs={recs} selected={recSel} sent={sent} sending={sending} sendError={sendError} width={width} onSelect={setRecSel} onSend={(id) => void send(id)} onOpenNode={openNode} ideas={{ by: snap.ai.ideas?.model ?? null, template: templateIdeas, pending: ideasExpected, busy: ideasBusy, error: ideasError, onWrite: () => void writeIdeas() }} top={teamSuggestions} research={researchView} bottom={<>{researchView ? <ResearchList research={researchView} model={mapModel} team={researchTeam} /> : null}<InProgressList items={inProgress} model={mapModel} audience={audience} /></>} />;
  else body = <MapView model={mapModel} view={tab} width={width} nav={nav} setNav={setNav} recs={recs} onRec={openRec} overlay={overlay} overviewTop={teamSuggestions} research={mapResearch} />;

  const failedWithSnap = !isClient && !!snap && data?.run?.status === "failed";
  return (
    <div ref={rootRef} className="ccm-root" style={st(ROOT[variant])}>
      <link rel="stylesheet" href={FONT_HREF} precedence="default" />
      {/* One row: title · tabs in the middle · status, actions and stats. */}
      <header style={st(`display:flex;align-items:center;flex-wrap:wrap;gap:${tight ? 10 : 16}px;padding:12px ${tight ? 16 : 24}px;border-bottom:1px solid oklch(0.9 0.006 85);background:oklch(0.995 0.002 85)`)}>
        <div style={st("font-size:20px;font-weight:600;letter-spacing:-.01em;white-space:nowrap")}>Topic associations</div>
        <div style={st("flex:1")} />
        {snap && mapModel ? (
          <div role="tablist" style={st("display:flex;gap:2px;padding:3px;border-radius:10px;background:oklch(0.94 0.006 85)")}>
            {TABS[audience].map(([k, label]) => (
              <button type="button" role="tab" aria-selected={tab === k} key={k} onClick={() => setTab(k)} style={st(`border:0;cursor:pointer;padding:7px ${tight ? 8 : 14}px;border-radius:7px;font-size:13px;font-weight:500;white-space:nowrap;background:${tab === k ? ACTIVE_TAB.bg : "transparent"};box-shadow:${tab === k ? ACTIVE_TAB.sh : "none"}`)}>{label}</button>
            ))}
          </div>
        ) : null}
        <div style={st("flex:1")} />
        <div style={st(`display:flex;align-items:center;gap:${tight ? 8 : 10}px`)}>
          {data?.client.enabled && (runError || failedWithSnap || statusLine || (snap && (!tight || isClient))) ? (
            <span style={st(`font-size:12px;white-space:nowrap;color:${runError || failedWithSnap ? "oklch(0.52 0.17 25)" : "oklch(0.52 0.01 85)"}`)}>
              {runError ?? (failedWithSnap ? `Last run failed: ${data.run?.error ?? "unknown error"}` : statusLine || (snap ? `Updated ${formatDay(snap.generatedAt)}` : ""))}
            </span>
          ) : null}
          {data?.client.enabled && !isClient ? (
            <button type="button" disabled={running || starting} title={snap ? `Updated ${formatDay(snap.generatedAt)}` : undefined} onClick={() => void reanalyse()} style={st(`${GHOST_BTN};white-space:nowrap;opacity:${running || starting ? 0.6 : 1}`)}>Re-analyse</button>
          ) : null}
          {viewSwitch ? <a href={viewSwitch.href} style={st(`${GHOST_BTN};text-decoration:none;white-space:nowrap`)}>{viewSwitch.label}</a> : null}
          {fullPage ? <a href={fullPage} target="_blank" rel="noopener" aria-label="Open full page" style={st(`${GHOST_BTN};text-decoration:none;white-space:nowrap`)}>Full page ↗</a> : null}
          {snap && mapModel && data?.client.enabled ? (
            <button type="button" onClick={() => (suggestOpen ? setSuggestOpen(false) : openSuggest())} aria-pressed={suggestOpen} style={st(`${GHOST_BTN};white-space:nowrap;${suggestOpen ? "background:oklch(0.94 0.006 85)" : ""}`)}>Suggest</button>
          ) : null}
          {snap && mapModel ? (
            <div style={st(`display:flex;gap:${tight ? 12 : 22}px;margin-left:${tight ? 4 : 8}px`)}>
              <div style={st("display:flex;flex-direction:column;gap:2px")}><span style={st("font:600 18px 'JetBrains Mono',monospace")}>{snap.stats.pagesCrawled}</span><span style={st("font-size:12px;color:oklch(0.52 0.01 85);white-space:nowrap")}>pages mapped</span></div>
              <div style={st("display:flex;flex-direction:column;gap:2px")}><span style={st("font:600 18px 'JetBrains Mono',monospace")}>{mapModel.linkTotal}</span><span style={st("font-size:12px;color:oklch(0.52 0.01 85);white-space:nowrap")}>in-text links</span></div>
              <div style={st("display:flex;flex-direction:column;gap:2px")}><span style={st("font:600 18px 'JetBrains Mono',monospace;color:oklch(0.52 0.17 25)")}>{mapModel.gaps.length}</span><span style={st("font-size:12px;color:oklch(0.52 0.01 85);white-space:nowrap")}>topic gaps</span></div>
            </div>
          ) : null}
        </div>
      </header>
      <div style={st("position:relative;min-height:0;height:100%")}>
        {body}
        {suggestOpen && snap ? (
          <aside style={st(`position:absolute;top:0;right:0;bottom:0;width:${width < 1000 ? 340 : 400}px;box-sizing:border-box;border-left:1px solid oklch(0.9 0.006 85);overflow:auto;background:oklch(0.995 0.002 85);z-index:2`)}>
            <SuggestForm authorities={data?.client.authorities ?? []} audience={audience} busy={suggestBusy} error={suggestError} onSubmit={(d) => void submitSuggestion(d)} onCheck={checkPlacement} model={mapModel ?? undefined} onClose={() => setSuggestOpen(false)} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
