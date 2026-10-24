import { useState } from "react";
import type { SnapshotLink, SnapshotNodeMember } from "@/lib/content-map/types";
import { bridgesFor, INK, type MapModel, type MapNode, MUTED, type PlanLike, RED, type SuggestionOverlay, sum, trunc } from "@/lib/content-map/view-model";
import { DASHED } from "./living";
import { st } from "./st";
import { GAP_ITEM, LINK_BTN, MONO_LABEL, MonoTag } from "./ui";

export interface MapNav {
  topic: string | null;
  sel: number | null;
  pair: [string, string] | null;
}

interface Props {
  model: MapModel;
  nav: MapNav;
  recs: PlanLike[];
  onNode: (i: number) => void;
  onPair: (a: string, b: string) => void;
  onBack: () => void;
  onHover: (i: number | null) => void;
  onRec: (id: string) => void;
  overlay?: SuggestionOverlay;
  overviewTop?: React.ReactNode;
}

const STAT_BOX = "padding:10px;border-radius:8px;background:oklch(0.97 0.005 85);display:flex;flex-direction:column;gap:2px";
const STAT_NUM = "font:600 17px 'JetBrains Mono',monospace";
const STAT_LBL = "font-size:11.5px;color:oklch(0.52 0.01 85)";
const ROW_BTN = "border:0;border-top:1px solid oklch(0.94 0.005 85);background:none;cursor:pointer;display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.35;text-align:left";

function Stat({ n, label }: { n: string | number; label: string }) {
  return <div style={st(STAT_BOX)}><span style={st(STAT_NUM)}>{n}</span><span style={st(STAT_LBL)}>{label}</span></div>;
}

/** "Write next" ideas, styled like the overview's gap list. */
function RecList({ model, recs, onRec }: { model: MapModel; recs: PlanLike[]; onRec: (id: string) => void }) {
  if (!recs.length) return null;
  return (
    <div style={st("display:flex;flex-direction:column;gap:8px")}>
      <div style={st(MONO_LABEL)}>Write next · {recs.length}</div>
      {recs.map((r) => (
        <button type="button" key={r.id} className="ccm-hbg" onClick={() => onRec(r.id)} style={st(`${GAP_ITEM};align-items:flex-start;line-height:1.35`)}>
          <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${model.T[r.topic]?.c ?? MUTED}`)} />
          <span style={st("flex:1")}>{r.title}</span>
          <span style={st(`font:11px 'JetBrains Mono',monospace;color:${r.priority === "high" ? RED : MUTED}`)}>{r.priority}</span>
        </button>
      ))}
    </div>
  );
}

/** Right aside of the Map / Gap matrix tabs: overview, topic, aggregate, article and pair panels. */
export function MapPanels({ model, nav, recs, onNode, onPair, onBack, onHover, onRec, overlay, overviewTop }: Props) {
  const { N, T, M, topics } = model;
  const tc = (k: string) => T[k]?.c ?? MUTED;
  const topic = nav.topic ? T[nav.topic] : undefined;
  const item = (n: MapNode) => (
    <button type="button" key={n.i} className="ccm-hul" onClick={() => onNode(n.i)} style={st(LINK_BTN)}>{n.title}</button>
  );

  if (nav.pair) {
    const [a, b] = nav.pair;
    const ls = M[a]?.[b] ?? [];
    const A = T[a], B = T[b];
    return (
      <div style={st("padding:22px;display:flex;flex-direction:column;gap:18px")}>
        <div style={st("display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:16px;font-weight:600")}>
          <span style={st(`width:9px;height:9px;border-radius:50%;background:${tc(a)}`)} />{A?.name}<span style={st("color:oklch(0.52 0.01 85);font-weight:400")}>→</span><span style={st(`width:9px;height:9px;border-radius:50%;background:${tc(b)}`)} />{B?.name}
        </div>
        <div style={st("font-size:13px;color:oklch(0.52 0.01 85)")}>
          {ls.length ? `${sum(ls)} in-text links across ${ls.length} page pairs.` : `No page in ${A?.name} links to ${B?.name}. Start with the strongest pages on each side.`}
        </div>
        {overlay ? bridgesFor(overlay, a, b).map((g) => (
          <div key={g.id} data-testid="pair-suggestion" style={st(`${DASHED};border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px`)}>
            <div style={st(`${MONO_LABEL};padding-bottom:2px`)}>{g.status === "approved" ? "Planned connection" : "Suggested connection"}</div>
            <div style={st("font-size:13px;font-weight:500;line-height:1.35")}>{g.title}</div>
            <div style={st("font-size:12.5px;line-height:1.45;color:oklch(0.52 0.01 85)")}>{g.why}</div>
          </div>
        )) : null}
        {ls.slice().sort((x, y) => y.w - x.w).map((l, ix) => (
          <div key={ix} style={st("border-top:1px solid oklch(0.94 0.005 85);padding-top:8px;display:flex;flex-direction:column;gap:4px;font-size:12.5px;line-height:1.35")}>
            <button type="button" onClick={() => onNode(l.s)} style={st("border:0;background:none;padding:0;cursor:pointer;text-align:left;font-size:12.5px")}>{N[l.s]?.title}</button>
            <div style={st("display:flex;gap:6px;color:oklch(0.52 0.01 85)")}><span>→</span><span>{trunc(N[l.t]?.title ?? "", 60)}</span><span style={st("font-family:'JetBrains Mono',monospace")}>{l.w > 1 ? `×${l.w}` : ""}</span></div>
          </div>
        ))}
        {!ls.length ? (
          <div style={st("display:flex;flex-direction:column;gap:14px")}>
            <div style={st("display:flex;flex-direction:column;gap:4px")}>
              <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>Strongest pages in {A?.name}</div>
              {[...(A?.nodes ?? [])].sort((x, y) => y.in - x.in).slice(0, 4).map(item)}
            </div>
            <div style={st("display:flex;flex-direction:column;gap:4px")}>
              <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>Could link to, in {B?.name}</div>
              {[...(B?.nodes ?? [])].sort((x, y) => y.in - x.in).slice(0, 4).map(item)}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const selNode = nav.sel != null ? N[nav.sel] : undefined;
  if (selNode && topic) {
    const n = selNode;
    const peerSet = new Set<number>();
    n.inL.forEach((l) => peerSet.add(l.s));
    n.outL.forEach((l) => peerSet.add(l.t));
    const peers = topic.nodes.filter((p) => p.i !== n.i && peerSet.has(p.i)).length;
    const unl = topic.nodes.filter((p) => p.i !== n.i && !peerSet.has(p.i)).sort((x, y) => y.in - x.in);
    const li = (l: SnapshotLink, o: number, ix: number) => {
      const on = N[o];
      return (
        <button type="button" key={ix} className="ccm-hbg" onClick={() => onNode(o)} style={st(`${ROW_BTN};padding:7px 0`)}>
          <span style={st(`width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;background:${tc(on?.g ?? "")}`)} /><span style={st("flex:1")}>{on?.title}</span>
          {on?.status === "draft" ? <MonoTag>draft</MonoTag> : null}
          <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{l.w > 1 ? `×${l.w}` : ""}</span>
        </button>
      );
    };
    return (
      <div style={st("padding:22px;display:flex;flex-direction:column;gap:20px")}>
        <div style={st("display:flex;flex-direction:column;gap:8px")}>
          <button type="button" onClick={onBack} style={st("border:0;background:none;padding:0;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:12px;color:oklch(0.52 0.01 85);text-align:left")}><span style={st(`width:8px;height:8px;border-radius:50%;background:${topic.c}`)} />{topic.name}</button>
          <div style={st("font-size:17px;font-weight:600;line-height:1.3;text-wrap:pretty")}>{n.title}{n.status === "draft" ? <> <MonoTag>draft</MonoTag></> : null}</div>
          <div style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);word-break:break-all")}>{n.id}</div>
          <div style={st("display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-top:4px")}>
            <Stat n={n.in} label="links in" /><Stat n={n.out} label="links out" /><Stat n={peers} label="peer links" />
          </div>
        </div>
        {unl.length > 0 ? (
          <div style={st("display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:10px;background:oklch(0.97 0.02 25)")}>
            <div style={st("font-size:13px;font-weight:600;color:oklch(0.45 0.15 25)")}>Not linked either way · {unl.length} peers</div>
            <div style={st("font-size:12px;color:oklch(0.45 0.05 25)")}>Most-linked pages in this topic with no connection to this one:</div>
            {unl.slice(0, 5).map(item)}
          </div>
        ) : null}
        <div style={st("display:flex;flex-direction:column;gap:2px")}>
          <div style={st(`${MONO_LABEL};padding-bottom:6px`)}>← Linked from · {n.inL.length}</div>
          {n.inL.slice().sort((a, b) => b.w - a.w).map((l, ix) => li(l, l.s, ix))}
          {!n.inL.length ? <div style={st("font-size:12.5px;color:oklch(0.52 0.17 25);padding:6px 0")}>No pages link here.</div> : null}
        </div>
        <div style={st("display:flex;flex-direction:column;gap:2px")}>
          <div style={st(`${MONO_LABEL};padding-bottom:6px`)}>→ Links to · {n.outL.length}</div>
          {n.outL.slice().sort((a, b) => b.w - a.w).map((l, ix) => li(l, l.t, ix))}
          {!n.outL.length ? <div style={st("font-size:12.5px;color:oklch(0.52 0.17 25);padding:6px 0")}>Dead end: this page links nowhere.</div> : null}
        </div>
      </div>
    );
  }

  if (topic?.agg) {
    const from = topics.filter((t) => !t.agg).map((t) => ({ t, n: sum(M[t.k]?.[topic.k] ?? []) })).filter((x) => x.n);
    const mx = Math.max(1, ...from.map((x) => x.n));
    const head = topic.nodes[0];
    return (
      <div style={st("padding:22px;display:flex;flex-direction:column;gap:20px")}>
        <div style={st("display:flex;flex-direction:column;gap:8px")}>
          <div style={st("display:flex;align-items:center;gap:8px")}><span style={st(`width:10px;height:10px;border-radius:50%;background:${topic.c}`)} /><span style={st("font-size:18px;font-weight:600")}>{head?.title ?? topic.name}</span></div>
          <div style={st("font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85)")}>Grouped into one node. It receives {head?.in ?? 0} in-text links from the mapped pages.</div>
        </div>
        <div style={st("display:flex;flex-direction:column;gap:8px")}>
          <div style={st(MONO_LABEL)}>Linked from</div>
          {from.sort((a, b) => b.n - a.n).map((x) => (
            <button type="button" key={x.t.k} onClick={() => onPair(x.t.k, topic.k)} style={st("border:0;background:none;padding:3px 0;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;text-align:left")}>
              <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;background:${x.t.c}`)} /><span style={st("width:120px")}>{x.t.name}</span>
              <div style={st("flex:1;height:6px;border-radius:3px;background:oklch(0.94 0.005 85);overflow:hidden")}><div style={st(`height:100%;width:${(x.n / mx) * 100}%;background:${x.t.c}`)} /></div>
              <span style={st("width:40px;text-align:right;font:12px 'JetBrains Mono',monospace")}>{x.n}</span>
            </button>
          ))}
        </div>
        <AggMembers model={model} members={head?.members} onNode={onNode} />
      </div>
    );
  }

  if (topic) {
    const k = topic.k;
    const conn = topics.filter((t) => t.k !== k).map((t) => {
      const o = sum(M[k]?.[t.k] ?? []), i = sum(M[t.k]?.[k] ?? []);
      return { t, o, i, s: o + i };
    }).sort((a, b) => b.s - a.s);
    const noPeer = new Set(topic.noPeer.map((n) => n.i));
    const ideas = recs.filter((r) => r.topic === k);
    return (
      <div style={st("padding:22px;display:flex;flex-direction:column;gap:22px")}>
        <div style={st("display:flex;flex-direction:column;gap:8px")}>
          <div style={st("display:flex;align-items:center;gap:8px")}><span style={st(`width:10px;height:10px;border-radius:50%;background:${topic.c}`)} /><span style={st("font-size:18px;font-weight:600")}>{topic.name}</span></div>
          <div style={st("display:grid;grid-template-columns:repeat(3,1fr);gap:8px")}>
            <Stat n={topic.pages} label="pages" /><Stat n={topic.intra} label="links within" /><Stat n={`${Math.round(topic.cov * 100)}%`} label="peer-linked" />
          </div>
        </div>
        <RecList model={model} recs={ideas} onRec={onRec} />
        <div style={st("display:flex;flex-direction:column;gap:8px")}>
          <div style={st(`display:flex;${MONO_LABEL}`)}><span style={st("flex:1")}>Other topics</span><span style={st("width:44px;text-align:right")}>out</span><span style={st("width:44px;text-align:right")}>in</span></div>
          {conn.map(({ t, o, i }) => (
            <button type="button" key={t.k} onClick={() => onPair(k, t.k)} style={st("border:0;background:none;padding:4px 0;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;text-align:left")}>
              <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;background:${t.c}`)} />
              <span style={st("flex:1")}>{t.name}</span>
              <span style={st(`width:44px;text-align:right;font:12px 'JetBrains Mono',monospace;color:${!o && !t.agg ? RED : INK}`)}>{o || (t.agg ? "–" : "0")}</span>
              <span style={st(`width:44px;text-align:right;font:12px 'JetBrains Mono',monospace;color:${!i && !t.agg ? RED : MUTED}`)}>{t.agg ? "–" : i || "0"}</span>
            </button>
          ))}
        </div>
        {topic.noPeer.length > 0 ? (
          <div style={st("display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:10px;background:oklch(0.97 0.02 25)")}>
            <div style={st("font-size:13px;font-weight:600;color:oklch(0.45 0.15 25)")}>{topic.noPeer.length} pages get no links from this topic</div>
            {topic.noPeer.map(item)}
          </div>
        ) : null}
        <div style={st("display:flex;flex-direction:column;gap:2px")}>
          <div style={st(`display:flex;${MONO_LABEL};padding-bottom:6px`)}><span style={st("flex:1")}>Articles</span><span style={st("width:36px;text-align:right")}>in</span><span style={st("width:36px;text-align:right")}>out</span></div>
          {[...topic.nodes].sort((a, b) => b.in - a.in).map((n) => (
            <button type="button" key={n.i} className="ccm-hbg" onClick={() => onNode(n.i)} onMouseEnter={() => onHover(n.i)} onMouseLeave={() => onHover(null)} style={st(`${ROW_BTN};padding:8px 0`)}>
              <span style={st(`width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;box-sizing:border-box;background:${noPeer.has(n.i) ? "transparent" : topic.c};border:1.5px solid ${topic.c}`)} />
              <span style={st("flex:1")}>{n.title}</span>
              {n.status === "draft" ? <MonoTag>draft</MonoTag> : null}
              <span style={st("width:36px;text-align:right;font:12px 'JetBrains Mono',monospace")}>{n.in}</span>
              <span style={st("width:36px;text-align:right;font:12px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{n.out}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const orphans = N.filter((n) => !n.agg && !n.inL.length);
  return (
    <div style={st("padding:22px;display:flex;flex-direction:column;gap:22px")}>
      <div style={st("display:flex;flex-direction:column;gap:6px")}>
        <div style={st("font-size:17px;font-weight:600")}>How the topics connect</div>
        <div style={st("font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);text-wrap:pretty")}>Bubbles are topics, sized by page count. Lines are links between topics; thicker means more links. The ring shows how well each topic links to itself. Click a topic to see its articles.</div>
      </div>
      {overviewTop}
      <RecList model={model} recs={recs.slice(0, 3)} onRec={onRec} />
      <div style={st("display:flex;flex-direction:column;gap:8px")}>
        <div style={st(MONO_LABEL)}>Topic pairs with no links · {model.gaps.length}</div>
        {model.gaps.map(([a, b]) => (
          <button type="button" key={`${a}-${b}`} className="ccm-hbg" onClick={() => onPair(a, b)} style={st(GAP_ITEM)}>
            <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;background:${tc(a)}`)} /><span>{T[a]?.name}</span>
            <span style={st("color:oklch(0.52 0.01 85)")}>→</span>
            <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;background:${tc(b)}`)} /><span style={st("flex:1")}>{T[b]?.name}</span>
            <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.17 25)")}>0</span>
          </button>
        ))}
      </div>
      <div style={st("display:flex;flex-direction:column;gap:8px")}>
        <div style={st(MONO_LABEL)}>Pages with no in-text links in · {orphans.length}</div>
        {orphans.map((o) => (
          <button type="button" key={o.i} className="ccm-hcol" onClick={() => onNode(o.i)} style={st("border:0;background:none;padding:6px 0;cursor:pointer;display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.35;text-align:left")}>
            <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${tc(o.g)}`)} /><span>{o.title}</span>
            {o.status === "draft" ? <MonoTag>draft</MonoTag> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Aggregate node: its member pages, the articles linking to each, and all articles linking into the group. */
function AggMembers({ model, members, onNode }: { model: MapModel; members: SnapshotNodeMember[] | undefined; onNode: (i: number) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!members) return <div data-testid="agg-members-missing" style={st("font-size:12.5px;line-height:1.45;color:oklch(0.52 0.01 85)")}>Re-analyse to see the pages in this group and which articles link to them.</div>;
  const { N, T } = model;
  const article = (s: number, w: number, key: string) => {
    const n = N[s];
    if (!n) return null;
    return (
      <button type="button" key={key} data-testid="agg-article" className="ccm-hul" onClick={() => onNode(s)} style={st(`${LINK_BTN};display:flex;align-items:flex-start;gap:8px`)}>
        <span style={st(`width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;background:${T[n.g]?.c ?? MUTED}`)} />
        <span style={st("flex:1")}>{n.title}</span>
        <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{w}</span>
      </button>
    );
  };
  const into = new Map<number, number>();
  for (const m of members) for (const f of m.from) into.set(f.s, (into.get(f.s) ?? 0) + f.w);
  const intoList = [...into.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return (
    <>
      <div data-testid="agg-members" style={st("display:flex;flex-direction:column;gap:4px")}>
        <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>Pages in this group · {members.length}</div>
        {members.map((m) => (
          <div key={m.id} style={st("display:flex;flex-direction:column;gap:2px")}>
            <button type="button" data-testid="agg-member" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)} style={st(`${LINK_BTN};display:flex;align-items:flex-start;gap:8px`)}>
              <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);width:10px")}>{open === m.id ? "▾" : "▸"}</span>
              <span style={st("flex:1")}>{m.t}</span>
              <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{m.in} in</span>
            </button>
            {open === m.id ? (
              <div style={st("padding-left:18px;display:flex;flex-direction:column")}>
                {m.from.length ? m.from.slice().sort((a, b) => b.w - a.w || a.s - b.s).map((f) => article(f.s, f.w, `${m.id}-${f.s}`)) : <div style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>No articles link here.</div>}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {intoList.length ? (
        <div data-testid="agg-into" style={st("display:flex;flex-direction:column;gap:2px")}>
          <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>Articles linking into this group · {intoList.length}</div>
          {intoList.map(([s, w]) => article(s, w, `into-${s}`))}
        </div>
      ) : null}
    </>
  );
}
