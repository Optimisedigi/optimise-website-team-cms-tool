import type { ResearchLayer, ResearchView } from "@/lib/content-map/types";
import { cannibalLines, fmtVolume, type GhostArticle, gscDropped, INK, type MapModel, RED, researchDots, type TopicState, trunc } from "@/lib/content-map/view-model";
import type { ResearchSel } from "./research";
import { st } from "./st";

interface Props {
  model: MapModel;
  topic: TopicState;
  focus: number | null;
  sel: number | null;
  onNode: (i: number) => void;
  onHover: (i: number | null) => void;
  onClear: () => void;
  /** Suggested articles, drawn dashed like drafts. */
  ghosts?: GhostArticle[];
  /** Research layers that are switched on (nothing is drawn when none are). */
  research?: { view: ResearchView; layers: ReadonlySet<ResearchLayer>; onSel: (sel: ResearchSel) => void };
}

/** Topic view: articles on a ring, chords for in-topic links, legend (design's tNodes/tChords). */
export function TopicChord({ model, topic, focus, sel, onNode, onHover, onClear, ghosts = [], research }: Props) {
  const layers = research?.layers;
  const gscOn = !!layers?.has("gsc");
  const dots = research && layers?.size ? researchDots(topic, research.view, layers) : [];
  const cannibals = research && gscOn ? cannibalLines(topic, model.N, research.view) : [];
  const gscByNode = new Map(gscOn && research ? research.view.gscPages.map((g) => [g.nodeId, g]) : []);
  const maxImp = Math.max(1, ...[...gscByNode.values()].map((g) => g.impressions));
  const { N, M } = model;
  const pos = topic.pos;
  const conn = new Set<number>();
  const fn = focus != null ? N[focus] : undefined;
  if (fn) {
    fn.inL.forEach((l) => conn.add(l.s));
    fn.outL.forEach((l) => conn.add(l.t));
  }
  const chords = (M[topic.k]?.[topic.k] ?? []).flatMap((l, ix) => {
    const A = pos[l.s], B = pos[l.t];
    if (!A || !B) return [];
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const isIn = focus != null && l.t === focus, isOut = focus != null && l.s === focus;
    return [{
      key: ix,
      d: `M${A.x},${A.y} Q${500 + (mx - 500) * 0.2},${430 + (my - 430) * 0.2} ${B.x},${B.y}`,
      sw: Math.min(5, 1.1 + Math.log(l.w + 1)),
      stroke: isOut ? INK : topic.c,
      op: focus == null ? 0.4 : isIn || isOut ? 0.95 : 0.05,
      on: isIn || isOut ? 1 : 0,
    }];
  }).sort((a, b) => a.on - b.on);
  const noPeer = new Set(topic.noPeer.map((n) => n.i));
  const nodes = topic.nodes.flatMap((n) => {
    const p = pos[n.i];
    if (!p) return [];
    const f = focus === n.i, lit = focus == null || f || conn.has(n.i);
    return [{ n, p, f, lit }];
  });
  return (
    <>
      <div style={st("position:absolute;inset:0;container-type:size;display:flex;align-items:center;justify-content:center")}>
        <div style={st("position:relative;width:min(100cqw,116.3cqh);aspect-ratio:1000/860;container-type:inline-size")}>
          <svg viewBox="0 0 1000 860" onClick={onClear} style={st("position:absolute;inset:0;width:100%;height:100%")}>
            <circle cx="500" cy="430" r={topic.R} style={st("fill:none;stroke:oklch(0.92 0.006 85);stroke-width:1;stroke-dasharray:2 4")} />
            {chords.map((e) => <path key={e.key} d={e.d} style={st(`fill:none;stroke:${e.stroke};stroke-width:${e.sw};opacity:${e.op};stroke-linecap:round;transition:opacity .2s`)} />)}
            {nodes.map(({ n, p, lit }) => (
              <g
                key={n.i}
                data-testid={`chord-node-${n.id}`}
                onClick={(e) => { e.stopPropagation(); onNode(n.i); }}
                onMouseEnter={() => onHover(n.i)}
                onMouseLeave={() => onHover(null)}
                style={st(`cursor:pointer;opacity:${lit ? 1 : 0.2};transition:opacity .2s`)}
              >
                <circle cx={p.x} cy={p.y} r={p.r + 6} style={st("fill:transparent")} />
                {sel === n.i ? <circle cx={p.x} cy={p.y} r={p.r + 4} style={st("fill:none;stroke:oklch(0.24 0.012 85);stroke-width:1.5")} /> : null}
                <circle cx={p.x} cy={p.y} r={p.r} style={st(`fill:${noPeer.has(n.i) ? "oklch(0.995 0.002 85)" : topic.c};stroke:${topic.c};stroke-width:2${n.status === "draft" ? ";stroke-dasharray:3 2" : ""}`)} />
              </g>
            ))}
            {cannibals.map((c) => (
              <path key={c.ix} data-testid={`cannibal-${c.ix}`} d={`M${c.a.x},${c.a.y} Q500,430 ${c.b.x},${c.b.y}`} onClick={(e) => { e.stopPropagation(); research?.onSel({ kind: "query", ix: c.ix }); }} style={st(`cursor:pointer;fill:none;stroke:${RED};stroke-width:2;stroke-dasharray:6 5;opacity:${focus == null ? 0.75 : 0.15}`)}><title>{`Pages compete for “${c.query}”`}</title></path>
            ))}
            {gscOn ? nodes.map(({ n, p, lit }) => {
              const g = gscByNode.get(n.id);
              if (!g) return null;
              const drop = gscDropped(g);
              return (
                <circle key={`gsc-${n.i}`} data-testid={`gsc-${n.id}`} cx={p.x} cy={p.y} r={p.r + 4.5} style={st(`pointer-events:none;fill:none;stroke:${drop ? RED : "oklch(0.55 0.15 258)"};stroke-width:${(1 + 2.5 * Math.sqrt(g.impressions / maxImp)).toFixed(2)};opacity:${lit ? (drop ? 0.8 : 0.45) : 0.1}`)}>
                  <title>{`${fmtVolume(g.impressions)} impressions · position ${g.position.toFixed(1)}${g.clicksChange != null ? ` · clicks ${Math.round(g.clicksChange * 100)}%` : ""}`}</title>
                </circle>
              );
            }) : null}
            {dots.map((d) => (
              <circle key={d.id} data-testid={d.kind === "idea" ? `research-dot-${d.id}` : `gsc-query-${d.id.slice(1)}`} cx={d.x} cy={d.y} r={d.r} onClick={(e) => { e.stopPropagation(); research?.onSel(d.kind === "idea" ? { kind: "idea", id: d.id } : { kind: "query", ix: Number(d.id.slice(1)) }); }} style={st(`cursor:pointer;fill:oklch(0.995 0.002 85);stroke:${d.kind === "idea" ? topic.c : "oklch(0.55 0.15 258)"};stroke-width:2;stroke-dasharray:3 2;opacity:${focus == null ? 1 : 0.2}`)}><title>{d.title}</title></circle>
            ))}
            {ghosts.map((g) => (
              <circle key={g.id} data-testid={`ghost-article-${g.id}`} cx={g.x} cy={g.y} r={g.r} style={st(`fill:oklch(0.995 0.002 85);stroke:${topic.c};stroke-width:2;stroke-dasharray:3 2;opacity:${focus == null ? 1 : 0.2}`)} />
            ))}
          </svg>
          {ghosts.map((g) => (
            <div key={g.id} style={st(`position:absolute;left:${g.x / 10}%;top:${(g.y + g.r + 6) / 8.6}%;transform:translateX(-50%);width:max-content;max-width:14cqw;display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center;pointer-events:none;opacity:${focus == null ? 1 : 0.2}`)}>
              <span style={st("font:max(8px,1.05cqw) 'Instrument Sans',sans-serif;line-height:1.25;color:oklch(0.4 0.01 85)")}>{trunc(g.title, 48)}</span>
              <span style={st("font:max(7px,0.9cqw) 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{g.status === "approved" ? "planned" : "suggested"}</span>
            </div>
          ))}
          {dots.filter((d) => d.labelled).map((d) => (
            <div key={d.id} style={st(`position:absolute;left:${d.x / 10}%;top:${(d.y + d.r + 5) / 8.6}%;transform:translateX(-50%);width:max-content;max-width:13cqw;display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center;pointer-events:none;opacity:${focus == null ? 1 : 0.2}`)}>
              <span style={st("font:max(8px,1cqw) 'Instrument Sans',sans-serif;line-height:1.25;color:oklch(0.4 0.01 85)")}>{trunc(d.title, 44)}</span>
              <span style={st("font:max(7px,0.9cqw) 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{layers?.has("volume") && d.volume ? `${fmtVolume(d.volume)}/mo` : d.kind === "idea" ? "research" : "search console"}</span>
            </div>
          ))}
          {nodes.map(({ n, p, f, lit }) => (
            <div key={n.i} style={st(`position:absolute;left:${p.lx / 10}%;top:${p.ly / 8.6}%;width:0;height:0;pointer-events:none;transform:rotate(${p.rot}deg);opacity:${lit ? 1 : 0.2};transition:opacity .2s`)}>
              <span style={st(`position:absolute;top:0;left:${p.anchor === "end" ? "auto" : "0"};right:${p.anchor === "end" ? "0" : "auto"};transform:translateY(-50%);white-space:nowrap;font:${f ? "600 max(9px,1.15cqw) 'Instrument Sans',sans-serif" : "max(8px,1.05cqw) 'Instrument Sans',sans-serif"}`)}>
                {trunc(n.title, focus == null || !lit ? 34 : 44)}
              </span>
            </div>
          ))}
          <div style={st("position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none")}>
            <span style={st("font:600 28px 'JetBrains Mono',monospace")}>{topic.intra}</span>
            <span style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>links within topic</span>
          </div>
        </div>
      </div>
      <div style={st("position:absolute;left:22px;bottom:18px;display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:oklch(0.52 0.01 85);background:oklch(0.975 0.005 85 / .9);padding:6px 0")}>
        <span style={st("display:flex;align-items:center;gap:6px")}><span style={st(`width:10px;height:10px;border-radius:50%;background:${topic.c}`)} />Linked from a peer</span>
        <span style={st("display:flex;align-items:center;gap:6px")}><span style={st(`width:10px;height:10px;border-radius:50%;box-sizing:border-box;border:2px solid ${topic.c}`)} />No peer links in (gap)</span>
        {dots.length ? <span style={st("display:flex;align-items:center;gap:6px")}><span style={st(`width:10px;height:10px;border-radius:50%;box-sizing:border-box;border:1.5px dashed ${topic.c}`)} />Article idea from research</span> : null}
        {gscOn && gscByNode.size ? <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:10px;height:10px;border-radius:50%;box-sizing:border-box;border:2px solid oklch(0.55 0.15 258 / .5)")} />Google impressions (red: clicks down)</span> : null}
        {cannibals.length ? <span style={st("display:flex;align-items:center;gap:6px")}><span style={st(`width:16px;height:0;border-top:2px dashed ${RED}`)} />Pages competing</span> : null}
        {ghosts.length ? <span style={st("display:flex;align-items:center;gap:6px")}><span style={st(`width:10px;height:10px;border-radius:50%;box-sizing:border-box;border:1.5px dashed ${topic.c}`)} />Suggested article</span> : null}
        <span>Size = links in</span>
        <span style={st("display:flex;align-items:center;gap:6px")}><span style={st(`width:16px;height:2px;background:${topic.c}`)} />Links in</span>
        <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:16px;height:2px;background:oklch(0.24 0.012 85)")} />Links out</span>
      </div>
    </>
  );
}
