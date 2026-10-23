import type { ResearchLayer, ResearchView } from "@/lib/content-map/types";
import { demandRings, fmtVolume, INK, type MapModel, MUTED, researchNewTopics, type SuggestionOverlay, sum } from "@/lib/content-map/view-model";
import type { ResearchSel } from "./research";
import { st } from "./st";

interface Props {
  model: MapModel;
  active: string | null;
  pair: [string, string] | null;
  subDisplay: string;
  onSelect: (k: string) => void;
  onHover: (k: string | null) => void;
  /** Suggestions not yet built: dashed bridges and new-topic bubbles. */
  overlay?: SuggestionOverlay;
  /** Research layers that are switched on (nothing is drawn when none are). */
  research?: { view: ResearchView; layers: ReadonlySet<ResearchLayer>; onSel: (sel: ResearchSel) => void };
}

/** Overview: topic bubbles, curved edges, edge labels (design's ovNodes/ovEdges). */
export function OverviewChart({ model, active, pair, subDisplay, onSelect, onHover, overlay, research }: Props) {
  const layers = research?.layers;
  const rings = research && layers?.has("volume") ? demandRings(model, research.view) : [];
  const ringOf = new Map(rings.map((r) => [r.k, r]));
  // A research new topic that is also a suggested topic shows once, in the suggestion's place, opening its evidence.
  const norm = (x: string) => x.trim().toLowerCase();
  const newTopics = (research && layers?.size ? researchNewTopics(research.view, layers) : []).map((g) => {
    const same = overlay?.topics.find((o) => norm(o.title) === norm(g.title));
    return same ? { ...g, x: same.x, y: same.y, r: same.r, replaces: same.id } : { ...g, replaces: null };
  });
  const replaced = new Set(newTopics.map((g) => g.replaces));
  const ghostTopics = (overlay?.topics ?? []).filter((g) => !replaced.has(g.id));
  const compOn = !!layers?.has("competitors");
  const { topics, T, M } = model;
  const w = (a: string, b: string) => sum(M[a]?.[b] ?? []);
  const edges: Array<{ key: string; d: string; sw: number; stroke: string; op: number }> = [];
  const labels: Array<{ key: string; px: string; py: string; txt: number }> = [];
  topics.forEach((a, i) => topics.forEach((b, j) => {
    if (j <= i) return;
    const n = w(a.k, b.k) + w(b.k, a.k);
    if (!n) return;
    const A = T[a.k];
    const B = T[b.k];
    if (!A || !B) return;
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, cx = 500 + (mx - 500) * 0.35, cy = 345 + (my - 345) * 0.35;
    const on = !!active && (a.k === active || b.k === active);
    const pairOn = !!pair && ((pair[0] === a.k && pair[1] === b.k) || (pair[0] === b.k && pair[1] === a.k));
    edges.push({
      key: `${a.k}-${b.k}`,
      d: `M${A.x},${A.y} Q${cx},${cy} ${B.x},${B.y}`,
      sw: Math.min(14, 1 + Math.log2(n + 1) * 1.6),
      stroke: on ? (a.k === active ? B.c : A.c) : pairOn ? INK : "oklch(0.7 0.012 85)",
      op: active ? (on ? 0.85 : 0.07) : pairOn ? 0.9 : 0.32,
    });
    if (on || pairOn) labels.push({ key: `${a.k}-${b.k}`, px: `${(0.25 * A.x + 0.5 * cx + 0.25 * B.x) / 10}%`, py: `${(0.25 * A.y + 0.5 * cy + 0.25 * B.y) / 7.2}%`, txt: n });
  }));
  edges.sort((x, y) => x.op - y.op);
  const nodes = topics.map((t) => {
    const o = T[t.k];
    if (!o) return null;
    const linked = !!active && (t.k === active || w(t.k, active) + w(active, t.k) > 0);
    const ringR = o.r + 6, circ = 2 * Math.PI * ringR;
    return { o, t, ringR, circ, linked, op: active ? (linked ? 1 : 0.25) : 1, sub: t.agg ? "grouped" : `${o.intra} within · ${Math.round(o.cov * 100)}%` };
  }).filter((n) => n !== null);
  return (
    <div style={st("position:absolute;inset:0;container-type:size;display:flex;align-items:center;justify-content:center")}>
      <div style={st("position:relative;width:min(100cqw,138.9cqh);aspect-ratio:1000/720;container-type:inline-size")}>
        <svg viewBox="0 0 1000 720" style={st("position:absolute;inset:0;width:100%;height:100%")}>
          {edges.map((e) => <path key={e.key} d={e.d} style={st(`fill:none;stroke:${e.stroke};stroke-width:${e.sw};opacity:${e.op};stroke-linecap:round;transition:opacity .2s`)} />)}
          {overlay?.bridges.map((g) => (
            <path key={g.id} data-testid={`ghost-bridge-${g.id}`} d={g.d} style={st(`fill:none;stroke:${INK};stroke-width:2;stroke-dasharray:7 6;opacity:${active ? 0.15 : 0.6};stroke-linecap:round;transition:opacity .2s`)}><title>{`Suggested: ${g.title}`}</title></path>
          ))}
          {ghostTopics.map((g) => (
            <circle key={g.id} data-testid={`ghost-topic-${g.id}`} cx={g.x} cy={g.y} r={g.r} style={st(`fill:oklch(0.995 0.002 85);stroke:${MUTED};stroke-width:2;stroke-dasharray:5 4;opacity:${active ? 0.25 : 1}`)}><title>{g.why}</title></circle>
          ))}
          {rings.map((g) => (
            <g key={g.k} data-testid={`demand-ring-${g.k}`} onClick={() => research?.onSel({ kind: "topic", k: g.k })} style={st(`cursor:pointer;opacity:${active && active !== g.k ? 0.25 : 1};transition:opacity .2s`)}>
              <title>{`${fmtVolume(g.volume)} searches a month · ${Math.round(g.covered * 100)}% covered`}</title>
              <circle cx={g.x} cy={g.y} r={g.r} style={st(`fill:none;stroke:${T[g.k]?.c ?? MUTED};stroke-width:5;opacity:.14`)} />
              <circle cx={g.x} cy={g.y} r={g.r} transform={`rotate(-90 ${g.x} ${g.y})`} style={st(`fill:none;stroke:${T[g.k]?.c ?? MUTED};stroke-width:5;opacity:.45;stroke-dasharray:${g.covered * g.circ} ${g.circ}`)} />
            </g>
          ))}
          {newTopics.map((g) => (
            <circle key={g.id} data-testid={`research-topic-${g.id}`} cx={g.x} cy={g.y} r={g.r} onClick={() => research?.onSel({ kind: "idea", id: g.id })} style={st(`cursor:pointer;fill:oklch(0.995 0.002 85);stroke:${MUTED};stroke-width:2;stroke-dasharray:5 4;opacity:${active ? 0.25 : 1}`)}><title>{g.title}</title></circle>
          ))}
          {nodes.map(({ o, t, ringR, circ, op }) => (
            <g key={t.k} data-testid={`ov-node-${t.k}`} onClick={() => onSelect(t.k)} onMouseEnter={() => onHover(t.k)} onMouseLeave={() => onHover(null)} style={st(`cursor:pointer;opacity:${op};transition:opacity .2s`)}>
              {!t.agg ? (
                <>
                  <circle cx={o.x} cy={o.y} r={ringR} style={st("fill:none;stroke:oklch(0.9 0.006 85);stroke-width:3")} />
                  <circle cx={o.x} cy={o.y} r={ringR} transform={`rotate(-90 ${o.x} ${o.y})`} style={st(`fill:none;stroke:${o.c};stroke-width:3;stroke-dasharray:${(o.cov || 0) * circ} ${circ};stroke-linecap:round`)} />
                </>
              ) : null}
              <circle cx={o.x} cy={o.y} r={o.r} style={st(`fill:${o.c};stroke:oklch(0.995 0.002 85);stroke-width:2`)} />
            </g>
          ))}
        </svg>
        {labels.map((e) => (
          <span key={e.key} style={st(`position:absolute;left:${e.px};top:${e.py};transform:translate(-50%,-50%);font:600 11.5px 'JetBrains Mono',monospace;padding:2px 6px;border-radius:5px;background:oklch(0.995 0.002 85);box-shadow:0 0 0 1px oklch(0.9 0.006 85);pointer-events:none`)}>{e.txt}</span>
        ))}
        {nodes.map(({ o, t, op, sub }) => (
          <div key={t.k} style={st(`position:absolute;left:${o.x / 10}%;top:${o.y / 7.2}%;width:0;height:0;pointer-events:none;opacity:${op};transition:opacity .2s`)}>
            <span style={st("position:absolute;transform:translate(-50%,-50%);font:600 max(10px,1.5cqw) 'JetBrains Mono',monospace;color:#fff")}>{o.pages}</span>
            <div style={st(`position:absolute;top:${((ringOf.get(t.k)?.r ?? o.r) + 9) / 10}cqw;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:1px;white-space:nowrap`)}>
              <span style={st("font-size:max(10px,1.4cqw);font-weight:600")}>{o.name}</span>
              <span style={st(`font:max(9px,1.1cqw) 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);display:${subDisplay}`)}>{sub}</span>
              {ringOf.get(t.k) || (compOn && !t.agg && research?.view.topics[t.k]?.competitorPages) ? (
                <span style={st("font:max(9px,1.1cqw) 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>
                  {ringOf.get(t.k) ? <span data-testid={`demand-label-${t.k}`}>{`${fmtVolume(ringOf.get(t.k)?.volume ?? 0)}/mo`}</span> : null}
                  {ringOf.get(t.k) && compOn && research?.view.topics[t.k]?.competitorPages ? " · " : null}
                  {compOn && research?.view.topics[t.k]?.competitorPages ? <span data-testid={`competitors-${t.k}`}>{`${research.view.topics[t.k]?.competitorPages} competitor pages`}</span> : null}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {ghostTopics.map((g) => (
          <div key={g.id} style={st(`position:absolute;left:${g.x / 10}%;top:${g.y / 7.2}%;width:0;height:0;pointer-events:none;opacity:${active ? 0.25 : 1}`)}>
            <span style={st("position:absolute;transform:translate(-50%,-50%);font:600 max(10px,1.5cqw) 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>+</span>
            <div style={st(`position:absolute;top:${(g.r + 9) / 10}cqw;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:1px;white-space:nowrap`)}>
              <span style={st("font-size:max(10px,1.4cqw);font-weight:600;color:oklch(0.4 0.01 85)")}>{g.title}</span>
              <span style={st(`font:max(9px,1.1cqw) 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);display:${subDisplay}`)}>{g.status === "approved" ? "new topic" : "suggested topic"}</span>
            </div>
          </div>
        ))}
        {newTopics.map((g) => (
          <div key={g.id} style={st(`position:absolute;left:${g.x / 10}%;top:${g.y / 7.2}%;width:0;height:0;pointer-events:none;opacity:${active ? 0.25 : 1}`)}>
            <span style={st("position:absolute;transform:translate(-50%,-50%);font:600 max(10px,1.5cqw) 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>+</span>
            <div style={st(`position:absolute;top:${(g.r + 9) / 10}cqw;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:1px;white-space:nowrap`)}>
              <span style={st("font-size:max(10px,1.4cqw);font-weight:600;color:oklch(0.4 0.01 85)")}>{g.title}</span>
              <span style={st(`font:max(9px,1.1cqw) 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);display:${subDisplay}`)}>{layers?.has("volume") && g.volume ? `new topic · ${fmtVolume(g.volume)}/mo` : "new topic from research"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
