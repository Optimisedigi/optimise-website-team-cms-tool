import { useState } from "react";
import type { ResearchLayer, ResearchView } from "@/lib/content-map/types";
import { emptyLayerNotes, fmtCount, fmtVolume, gscDropped, ideaVisible, type MapModel, MUTED, type PlanLike, RED, type SuggestionOverlay } from "@/lib/content-map/view-model";
import type { Audience } from "./ContentMapShell";
import { GapMatrix } from "./GapMatrix";
import { type MapNav, MapPanels } from "./MapPanels";
import { OverviewChart } from "./OverviewChart";
import { st } from "./st";
import { TopicChord } from "./TopicChord";
import { TopicList } from "./TopicList";
import { LayerBar, ResearchPanel, type ResearchSel, type ResearchTeam, showResearch, TopicResearchBlock } from "./research";
import { GAP_ITEM, MONO_LABEL, MonoTag } from "./ui";

/** Research layers on the map: all off when the page opens; the viewer switches them on. */
export interface MapResearch {
  view: ResearchView | null | undefined;
  layers: ReadonlySet<ResearchLayer>;
  onToggle: (l: ResearchLayer) => void;
  audience: Audience;
  /** Team only: Research now, Add to plan / Dismiss. */
  team?: ResearchTeam;
}

interface Props {
  model: MapModel;
  view: "map" | "matrix";
  width: number;
  nav: MapNav;
  setNav: (nav: MapNav) => void;
  recs: PlanLike[];
  onRec: (id: string) => void;
  overlay?: SuggestionOverlay;
  /** Suggestions block at the top of the overview panel. */
  overviewTop?: React.ReactNode;
  research?: MapResearch;
}

/** Map + Gap matrix tabs: left topic list, main view, right panels. */
export function MapView({ model, view, width, nav, setNav: setNavRaw, recs, onRec, overlay, overviewTop, research }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [rsel, setRsel] = useState<ResearchSel | null>(null);
  const rview = showResearch(research?.view) ? research.view : null;
  const layers = research?.layers ?? new Set<ResearchLayer>();
  const rOn = !!rview && layers.size > 0;
  const rx = rview && rOn ? { view: rview, layers, onSel: setRsel } : undefined;
  const setNav = (n: MapNav) => { setRsel(null); setNavRaw(n); };
  const [hoverTopic, setHoverTopic] = useState<string | null>(null);
  const { N, T } = model;
  const narrow = width < 1100;
  const cols = narrow ? "minmax(0,1fr) minmax(260px,320px)" : "minmax(190px,250px) minmax(0,1fr) minmax(280px,370px)";
  const topic = nav.topic ? T[nav.topic] : undefined;
  const isTopic = !!topic && !topic.agg && view === "map";
  const selTopic = (k: string) => { setNav({ topic: k, sel: null, pair: null }); setHover(null); setHoverTopic(null); };
  const selNode = (i: number) => {
    const n = N[i];
    if (!n) return;
    if (n.agg) return selTopic(n.g);
    setNav({ topic: n.g, sel: i, pair: null });
    setHover(null);
  };
  const openNodeId = (id: string) => { const n = N.find((x) => x.id === id); if (n) selNode(n.i); };
  const nodeSel = nav.sel != null ? N[nav.sel] : undefined;
  const goOverview = () => { setNav({ topic: null, sel: null, pair: null }); setHover(null); };
  const active = hoverTopic || (topic?.agg ? topic.k : null);
  const focus = isTopic && topic && hover != null && topic.pos[hover] ? hover : nav.sel;
  const tipNode = isTopic && hover != null ? N[hover] : undefined;
  const emptyNotes = rx && view === "map" && (!topic || isTopic)
    ? emptyLayerNotes(rx.view, layers, { topic: isTopic && topic ? topic.k : null, topicKeys: model.topics.filter((t) => !T[t.k]?.agg).map((t) => t.k), nodeIds: isTopic && topic ? new Set(N.filter((n) => n.g === topic.k).map((n) => n.id)) : undefined })
    : [];
  const hint = isTopic ? "Click an article to trace its links" : view === "map" ? "Hover to trace, click to open a topic" : "";
  return (
    <div style={st(`display:grid;grid-template-columns:${cols};min-height:0;height:100%`)}>
      <TopicList
        topics={model.topics.map((t) => T[t.k]).filter((t) => t !== undefined)}
        display={narrow ? "none" : "flex"}
        active={nav.topic}
        hoverTopic={hoverTopic}
        allActive={!nav.topic && !nav.pair}
        onAll={goOverview}
        onSelect={selTopic}
        onHover={setHoverTopic}
      />
      <main style={st("position:relative;min-width:0;min-height:0;display:flex;flex-direction:column")}>
        <div style={st("display:flex;align-items:center;gap:10px;padding:14px 22px 0;font-size:13px;min-height:30px")}>
          <button type="button" onClick={goOverview} style={st("border:0;background:none;padding:0;cursor:pointer;color:oklch(0.52 0.01 85);font-size:13px;white-space:nowrap")}>All topics</button>
          {topic ? (
            <>
              <span style={st("color:oklch(0.75 0.01 85)")}>/</span>
              <span style={st("display:flex;align-items:center;gap:7px;font-weight:600")}><span style={st(`width:8px;height:8px;border-radius:50%;background:${topic.c}`)} />{topic.name}</span>
            </>
          ) : null}
          <div style={st("flex:1")} />
          <span style={st("font-size:12px;color:oklch(0.52 0.01 85);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0")}>{hint}</span>
        </div>
        {emptyNotes.length ? (
          <div data-testid="layer-empty-notes" style={st("display:flex;flex-wrap:wrap;gap:2px 14px;padding:4px 22px 0;font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>
            {emptyNotes.map((n) => <span key={n}>{n}</span>)}
          </div>
        ) : null}
        {rview && research ? <LayerBar research={rview} layers={layers} onToggle={(l) => { if (layers.has(l)) setRsel(null); research.onToggle(l); }} team={research.team} /> : null}
        {view === "map" ? (
          <div style={st("flex:1;min-height:0;position:relative")}>
            {isTopic && topic ? (
              <TopicChord model={model} topic={topic} focus={focus} sel={nav.sel} onNode={selNode} onHover={setHover} onClear={() => nav.sel != null && setNav({ ...nav, sel: null })} ghosts={overlay?.articles[topic.k]} research={rx} />
            ) : (
              <OverviewChart model={model} active={active} pair={nav.pair} subDisplay={width < 900 ? "none" : "block"} onSelect={selTopic} onHover={setHoverTopic} overlay={overlay} research={rx} />
            )}
            {tipNode ? (
              <div style={st("position:absolute;top:10px;left:22px;max-width:420px;padding:10px 12px;border-radius:10px;background:oklch(0.24 0.012 85);color:oklch(0.98 0.004 85);display:flex;flex-direction:column;gap:3px;pointer-events:none")}>
                <span style={st("font-size:13px;font-weight:600;line-height:1.35")}>{tipNode.title}{tipNode.status === "draft" ? <> <MonoTag dark>draft</MonoTag></> : null}</span>
                <span style={st("font:11px 'JetBrains Mono',monospace;opacity:.75")}>{`${tipNode.in} in · ${tipNode.out} out · ${tipNode.id}`}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <GapMatrix model={model} pair={nav.pair} onCell={(a, b) => setNav({ pair: [a, b], sel: null, topic: null })} overlay={overlay} research={rx} />
        )}
      </main>
      <aside style={st("border-left:1px solid oklch(0.9 0.006 85);overflow:auto;background:oklch(0.995 0.002 85)")}>
        {rsel && rview && research ? (
          <ResearchPanel sel={rsel} research={rview} model={model} audience={research.audience} team={research.team} onClose={() => setRsel(null)} onNode={openNodeId} />
        ) : (
        <>
        {rx && topic && !topic.agg && !nav.pair ? (
          nodeSel ? <NodeGsc nodeId={nodeSel.id} view={rx.view} layers={layers} /> : <TopicResearchBlock k={topic.k} research={rx.view} layers={layers} team={research?.audience === "team"} gscPages model={model} onNode={openNodeId} />
        ) : null}
        {rx && nav.pair ? <PairIdeas a={nav.pair[0]} b={nav.pair[1]} model={model} view={rx.view} layers={layers} onSel={setRsel} /> : null}
        <MapPanels
          model={model}
          nav={nav}
          recs={recs}
          onNode={selNode}
          onPair={(a, b) => setNav({ pair: [a, b], topic: null, sel: null })}
          onBack={() => setNav({ ...nav, sel: null })}
          onHover={setHover}
          onRec={onRec}
          overlay={overlay}
          overviewTop={overviewTop}
        />
        </>
        )}
      </aside>
    </div>
  );
}

/** Search Console for the selected page, when that layer is on. */
function NodeGsc({ nodeId, view, layers }: { nodeId: string; view: ResearchView; layers: ReadonlySet<ResearchLayer> }) {
  const g = layers.has("gsc") ? view.gscPages.find((p) => p.nodeId === nodeId) : undefined;
  if (!g) return null;
  const drop = gscDropped(g);
  return (
    <div data-testid="node-gsc" style={st("padding:22px 22px 0;display:flex;flex-direction:column;gap:6px")}>
      <div style={st(MONO_LABEL)}>Search Console · last 28 days</div>
      <div style={st("font-size:12.5px;line-height:1.45")}>{fmtCount(g.impressions)} impressions, {fmtCount(g.clicks)} clicks, position {g.position.toFixed(1)}{g.clicksChange != null ? <span style={st(`color:${drop ? RED : MUTED}`)}>{` · clicks ${g.clicksChange > 0 ? "+" : ""}${Math.round(g.clicksChange * 100)}% on the month before`}</span> : null}</div>
      {g.topQueries.slice(0, 5).map((q) => <div key={q.query} style={st("display:flex;gap:8px;font-size:12px;color:oklch(0.4 0.01 85)")}><span style={st("flex:1")}>{q.query}</span><span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{fmtVolume(q.impressions)} · #{Math.round(q.position)}</span></div>)}
    </div>
  );
}

/** Research ideas joining the two topics of a gap-matrix cell. */
function PairIdeas({ a, b, model, view, layers, onSel }: { a: string; b: string; model: MapModel; view: ResearchView; layers: ReadonlySet<ResearchLayer>; onSel: (s: ResearchSel) => void }) {
  const ideas = view.ideas.filter((i) => ideaVisible(i, layers) && ((i.topic === a && i.overlaps.includes(b)) || (i.topic === b && i.overlaps.includes(a))));
  if (!ideas.length) return null;
  return (
    <div data-testid="pair-research" style={st("padding:22px 22px 0;display:flex;flex-direction:column;gap:8px")}>
      <div style={st(MONO_LABEL)}>Research ideas joining them · {ideas.length}</div>
      {ideas.map((i) => (
        <button type="button" key={i.id} className="ccm-hbg" onClick={() => onSel({ kind: "idea", id: i.id })} style={st(`${GAP_ITEM};border-style:dashed;align-items:flex-start;line-height:1.35`)}>
          <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${model.T[i.topic ?? ""]?.c ?? MUTED}`)} />
          <span style={st("flex:1")}>{i.title}</span>
          {layers.has("volume") && i.volume ? <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{fmtVolume(i.volume)}/mo</span> : null}
        </button>
      ))}
    </div>
  );
}
