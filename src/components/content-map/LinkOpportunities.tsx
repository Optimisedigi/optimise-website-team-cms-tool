import { useState } from "react";
import { arcPath, BLUE, csvFor, filterPairs, GREEN, learnLine, type OppFilter, type OppModel, scoreOpps } from "@/lib/content-map/view-model";
import type { LinkAction } from "@/lib/content-map/types";
import { type LinkBusy, LinkEdit } from "./LinkEdit";
import { st } from "./st";
import { ACTIVE_TAB, DARK_BTN, GHOST_BTN } from "./ui";

export type DecisionKind = "accepted" | "dismissed" | "undo";

interface Props {
  model: OppModel;
  accepted: readonly string[];
  dismissed: readonly string[];
  termW: Readonly<Record<string, number>>;
  width: number;
  onDecide: (key: string, decision: DecisionKind, terms: readonly string[]) => void;
  actions?: Readonly<Record<string, LinkAction>>;
  linkBusy?: Readonly<Record<string, LinkBusy>>;
  linkErrors?: Readonly<Record<string, string>>;
  onDraft?: (key: string, redo: boolean) => void;
  onApply?: (key: string) => void;
  /** Client view: no decisions or edits; accepted links show as Planned / Added. */
  readOnly?: boolean;
}

const FILTERS: Array<[OppFilter, string]> = [["all", "All"], ["gaps", "Fixes gaps"], ["within", "Same topic"], ["across", "Cross-topic"]];
const SMALL_LINE = "font-size:12px;line-height:1.4;color:oklch(0.4 0.01 85)";

/** Embedded variant of link-opportunities.dc.html. */
export function LinkOpportunities({ model: d, accepted, dismissed, termW, width, onDecide, actions = {}, linkBusy = {}, linkErrors = {}, onDraft, onApply, readOnly = false }: Props) {
  const [filter, setFilter] = useState<OppFilter>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const narrow = width < 1000;
  const cols = narrow ? "minmax(0,1fr) 340px" : "minmax(0,1fr) 400px";
  const { all, N, L, pos, TC } = d;
  const acc = new Set(accepted), dis = new Set(dismissed);
  const { scored, accPairs, peerIn, gapsOpen, cov } = scoreOpps(d, acc, termW);
  const list = filterPairs(scored, filter);
  const open = list.filter((p) => !acc.has(p.key) && !dis.has(p.key)).sort((a, b) => b.score - a.score);
  const done = list.filter((p) => acc.has(p.key) || dis.has(p.key));
  // The client view leads with the links being added, then what else was found.
  const shown = readOnly ? [...done, ...open.slice(0, 30)] : [...open.slice(0, 30), ...done];
  const maxS = Math.max(0.01, ...scored.map((p) => p.score));
  const selP = sel ? scored.find((p) => p.key === sel) : undefined;
  const focusNode = hover;
  const touch = (l: { s: number; t: number }) => focusNode != null && (l.s === focusNode || l.t === focusNode);
  const px = (i: number) => pos[i] ?? 0;
  const tcol = (i: number) => TC[all[i]?.g ?? ""]?.c ?? "oklch(0.7 0.012 85)";

  const exportCsv = () => {
    const rows = [["from_url", "from_title", "to_url", "to_title", "shared_terms"]];
    d.pairs.filter((p) => acc.has(p.key)).forEach((p) => rows.push([all[p.s]?.id ?? "", all[p.s]?.title ?? "", all[p.t]?.id ?? "", all[p.t]?.title ?? "", p.shared.join(" ")]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csvFor(rows)], { type: "text/csv" }));
    a.download = "accepted-links.csv";
    a.click();
  };

  const tipN = focusNode != null ? all[focusNode] : undefined;
  return (
    <div style={st("display:grid;grid-template-rows:auto minmax(0,1fr);height:100%;min-height:0")}>
      <header style={st("display:flex;align-items:center;flex-wrap:wrap;gap:24px;padding:12px 24px;border-bottom:1px solid oklch(0.9 0.006 85);background:oklch(0.995 0.002 85)")}>
        <div style={st("font-size:13px;line-height:1.45;color:oklch(0.52 0.01 85);max-width:420px;text-wrap:pretty")}>{readOnly
          ? "The links we're adding between related pages, so readers and search engines can follow each topic from one article to the next."
          : "Suggested natural links between related pages. Accept or dismiss to train the ranking. Accepted links are written into the page for you to check and apply."}</div>
        <div style={st("flex:1")} />
        <div style={st("display:flex;gap:28px;flex-wrap:wrap")}>
          <div style={st("display:flex;flex-direction:column;gap:2px")}><span style={st("font:600 18px 'JetBrains Mono',monospace")}>{cov}%</span><span style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>pages linked from their topic</span></div>
          <div style={st("display:flex;flex-direction:column;gap:2px")}><span style={st("font:600 18px 'JetBrains Mono',monospace;color:oklch(0.52 0.17 25)")}>{gapsOpen.length}</span><span style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>topic gaps open</span></div>
          <div style={st("display:flex;flex-direction:column;gap:2px")}><span style={st("font:600 18px 'JetBrains Mono',monospace;color:oklch(0.48 0.12 160)")}>{accPairs.length}</span><span style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>{readOnly ? "links planned" : "links accepted"}</span></div>
        </div>
      </header>
      <div style={st(`display:grid;grid-template-columns:${cols};min-height:0`)}>
        <main style={st("min-width:0;min-height:0;display:flex;flex-direction:column;padding:16px 22px 18px;gap:10px")}>
          <div style={st("display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px")}>
            <div style={st("font-size:15px;font-weight:600")}>Every article on one line</div>
            <div style={st("font-size:12.5px;color:oklch(0.52 0.01 85)")}>Existing links arc above. Suggested links hang below. Accepted links turn green.</div>
          </div>
          <div style={st("flex:1;min-height:0;container-type:size;display:flex;align-items:center;justify-content:center")}>
            <div style={st("position:relative;width:min(100cqw,214cqh);aspect-ratio:1200/560;container-type:inline-size")}>
              {d.segs.map((g, i) => (
                <div key={g.k} style={st(`position:absolute;top:0;left:${g.x0 / 12}%;width:${(g.x1 - g.x0) / 12}%;display:flex;flex-direction:column;gap:4px;align-items:flex-start`)}>
                  <div style={st(`width:100%;height:3px;border-radius:2px;background:${TC[g.k]?.c}`)} />
                  <span style={st(`font-size:max(9px,1.05cqw);font-weight:600;line-height:1.2;white-space:nowrap;margin-top:${i % 2 ? "1.5em" : "0"}`)}>{TC[g.k]?.name}</span>
                </div>
              ))}
              <svg viewBox="0 0 1200 560" style={st("position:absolute;inset:0;width:100%;height:100%")}>
                {L.map((l, ix) => (
                  <path key={`l${ix}`} d={arcPath(px(l.s), px(l.t), true, 245)} style={st(`fill:none;stroke:${touch(l) ? tcol(l.t) : "oklch(0.7 0.012 85)"};stroke-width:${Math.min(3, 0.8 + Math.log(l.w + 1) * 0.6)};opacity:${focusNode != null ? (touch(l) ? 0.9 : 0.08) : selP ? 0.18 : 0.4};transition:opacity .2s`)} />
                ))}
                {accPairs.map((p) => <path key={`a${p.key}`} d={arcPath(px(p.s), px(p.t), true, 245)} style={st(`fill:none;stroke:${GREEN};stroke-width:2;opacity:.95;transition:opacity .2s`)} />)}
                <line x1="20" y1="330" x2="1180" y2="330" style={st("stroke:oklch(0.88 0.006 85);stroke-width:1")} />
                {open.slice(0, 30).map((p) => {
                  const on = selP?.key === p.key;
                  const op = selP ? (on ? 1 : 0.15) : focusNode != null ? (p.s === focusNode || p.t === focusNode ? 0.9 : 0.08) : 0.55;
                  return <path key={`d${p.key}`} d={arcPath(px(p.s), px(p.t), false, 210)} style={st(`fill:none;stroke:${on ? BLUE : "oklch(0.62 0.1 258)"};stroke-width:${on ? 2.5 : 1.1};stroke-dasharray:${on ? "none" : "3 3"};opacity:${op};transition:opacity .2s`)} />;
                })}
                {N.map((n) => {
                  const x = px(n.i);
                  const lit = selP ? selP.s === n.i || selP.t === n.i : focusNode == null || focusNode === n.i;
                  const c = TC[n.g]?.c ?? "";
                  return (
                    <g key={n.i} onMouseEnter={() => setHover(n.i)} onMouseLeave={() => setHover(null)} onClick={() => setSel(null)} style={st(`cursor:pointer;opacity:${lit ? 1 : 0.35}`)}>
                      <rect x={x - 5} y="300" width="10" height="60" style={st("fill:transparent")} />
                      <circle cx={x} cy="330" r={Math.min(6, 2.2 + Math.sqrt(n.in) * 0.9)} style={st(`fill:${peerIn.has(n.i) ? c : "oklch(0.995 0.002 85)"};stroke:${c};stroke-width:1.5${n.status === "draft" ? ";stroke-dasharray:2 1.5" : ""}`)} />
                    </g>
                  );
                })}
              </svg>
              {tipN ? (
                <div style={st(`position:absolute;left:${px(tipN.i) / 12}%;top:66%;transform:translateX(-50%);max-width:300px;width:max-content;padding:9px 11px;border-radius:9px;background:oklch(0.24 0.012 85);color:oklch(0.98 0.004 85);display:flex;flex-direction:column;gap:3px;pointer-events:none;z-index:2`)}>
                  <span style={st("font-size:12.5px;font-weight:600;line-height:1.35")}>{tipN.title}</span>
                  <span style={st("font:10.5px 'JetBrains Mono',monospace;opacity:.75")}>{`${TC[tipN.g]?.name} · ${tipN.in} in · ${tipN.out} out${tipN.status === "draft" ? " · draft" : ""}`}</span>
                </div>
              ) : null}
            </div>
          </div>
          <div style={st("display:flex;flex-wrap:wrap;gap:16px;font-size:12px;color:oklch(0.52 0.01 85)")}>
            <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:16px;height:2px;background:oklch(0.7 0.012 85)")} />Existing link</span>
            <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:16px;height:0;border-top:2px dashed oklch(0.55 0.15 258)")} />Suggested</span>
            <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:16px;height:2px;background:oklch(0.55 0.13 160)")} />Accepted</span>
            <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:9px;height:9px;border-radius:50%;box-sizing:border-box;border:1.5px solid oklch(0.52 0.01 85)")} />No link from its own topic</span>
            <span>Grouped pages are left off this line.</span>
          </div>
        </main>
        <aside style={st("border-left:1px solid oklch(0.9 0.006 85);background:oklch(0.995 0.002 85);display:flex;flex-direction:column;min-height:0")}>
          <div style={st("padding:18px 20px 12px;display:flex;flex-direction:column;gap:12px;border-bottom:1px solid oklch(0.92 0.006 85)")}>
            <div style={st("display:flex;align-items:center;gap:8px")}>
              <span style={st("font-size:15px;font-weight:600;flex:1")}>{readOnly ? `Link plan · ${accPairs.length} planned · ${open.length} found` : `Suggested links · ${open.length}`}</span>
              {readOnly ? null : <button type="button" onClick={exportCsv} style={st(GHOST_BTN)}>Export CSV</button>}
            </div>
            <div style={st("display:flex;gap:2px;padding:3px;border-radius:9px;background:oklch(0.94 0.006 85)")}>
              {FILTERS.map(([k, label]) => (
                <button type="button" key={k} onClick={() => setFilter(k)} style={st(`flex:1;border:0;cursor:pointer;padding:6px 4px;border-radius:6px;font-size:12px;font-weight:500;white-space:nowrap;background:${filter === k ? ACTIVE_TAB.bg : "transparent"};box-shadow:${filter === k ? ACTIVE_TAB.sh : "none"}`)}>{label}</button>
              ))}
            </div>
            <div style={st("font-size:12px;line-height:1.45;color:oklch(0.52 0.01 85);text-wrap:pretty")}>{readOnly
              ? "Green links are planned or already added. Dashed links are further opportunities we've found between related pages."
              : learnLine(accepted.length, dismissed.length, termW)}</div>
          </div>
          <div style={st("flex:1;min-height:0;overflow:auto;padding:12px 14px 20px;display:flex;flex-direction:column;gap:8px")}>
            {shown.map((p) => {
              const A = all[p.s], B = all[p.t];
              const isAcc = acc.has(p.key), isDis = dis.has(p.key), on = sel === p.key;
              const score = Math.round((p.score / maxS) * 100);
              const ga = A?.g ?? "", gb = B?.g ?? "";
              return (
                <div key={p.key} data-testid="opp-card" onClick={() => setSel(on ? null : p.key)} style={st(`border-radius:11px;padding:12px;display:flex;flex-direction:column;gap:9px;cursor:pointer;background:${on ? "oklch(0.97 0.012 258)" : isAcc || isDis ? "oklch(0.975 0.004 85)" : "oklch(0.995 0.002 85)"};border:1px solid ${on ? BLUE : "oklch(0.92 0.006 85)"}`)}>
                  <div style={st("display:flex;flex-direction:column;gap:5px;font-size:13px;line-height:1.35")}>
                    <div style={st("display:flex;gap:8px;align-items:flex-start")}><span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${TC[ga]?.c}`)} /><div style={st("display:flex;flex-direction:column;gap:2px")}><span style={st("font-weight:500")}>{A?.title}</span>{p.dup ? <span style={st("font:10.5px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);word-break:break-all")}>{A?.id}</span> : null}</div></div>
                    <div style={st("display:flex;gap:8px;align-items:flex-start;color:oklch(0.4 0.01 85)")}><span style={st("width:8px;flex:none;text-align:center;font-size:11px")}>↓</span><span style={st("font-size:11.5px")}>{p.same ? `links to · within ${TC[ga]?.name}` : `links to · ${TC[ga]?.name} → ${TC[gb]?.name}`}</span></div>
                    <div style={st("display:flex;gap:8px;align-items:flex-start")}><span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${TC[gb]?.c}`)} /><div style={st("display:flex;flex-direction:column;gap:2px")}><span style={st("font-weight:500")}>{B?.title}</span>{p.dup ? <span style={st("font:10.5px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);word-break:break-all")}>{B?.id}</span> : null}</div></div>
                  </div>
                  <div style={st("display:flex;flex-wrap:wrap;gap:5px")}>
                    {p.shared.map((t) => <span key={t} style={st("font:11px 'JetBrains Mono',monospace;padding:2px 7px;border-radius:5px;background:oklch(0.94 0.012 258);color:oklch(0.38 0.1 258)")}>{t}</span>)}
                  </div>
                  {p.opp.anchor ? <div style={st(SMALL_LINE)}>Anchor: “{p.opp.anchor}”</div> : null}
                  {p.opp.snippet ? <div style={st(`${SMALL_LINE};color:oklch(0.52 0.01 85);font-style:italic`)}>{p.opp.snippet}</div> : null}
                  {p.opp.why ? <div style={st(SMALL_LINE)}>{p.opp.why}</div> : null}
                  {p.reasons.map((r) => <div key={r} style={st("font-size:12px;color:oklch(0.48 0.14 25)")}>{r}</div>)}
                  {isAcc && onDraft && onApply && !readOnly ? (
                    <LinkEdit action={actions[p.key]} busy={linkBusy[p.key]} error={linkErrors[p.key]} onDraft={(redo) => onDraft(p.key, redo)} onApply={() => onApply(p.key)} />
                  ) : null}
                  <div style={st("display:flex;align-items:center;gap:8px")}>
                    <div style={st("flex:1;height:4px;border-radius:2px;background:oklch(0.92 0.006 85);overflow:hidden")}><div style={st(`height:100%;width:${score}%;background:oklch(0.55 0.15 258)`)} /></div>
                    <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);width:30px;text-align:right")}>{score}</span>
                    {readOnly ? (
                      isAcc ? <span style={st(`font-size:12px;font-weight:500;color:${GREEN}`)}>{actions[p.key]?.status === "applied" ? "Added" : "Planned"}</span> : <span style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>Found</span>
                    ) : !isAcc && !isDis ? (
                      <>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onDecide(p.key, "dismissed", p.shared); }} style={st("border:1px solid oklch(0.88 0.006 85);background:oklch(0.995 0.002 85);border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px")}>Dismiss</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onDecide(p.key, "accepted", p.shared); }} style={st(DARK_BTN)}>Accept</button>
                      </>
                    ) : (
                      <>
                        <span style={st(`font-size:12px;font-weight:500;color:${isAcc ? GREEN : "oklch(0.52 0.01 85)"}`)}>{isAcc ? "Accepted" : "Dismissed"}</span>
                        {actions[p.key]?.status === "applied" ? null : <button type="button" onClick={(e) => { e.stopPropagation(); onDecide(p.key, "undo", p.shared); }} style={st("border:0;background:none;cursor:pointer;font-size:12px;color:oklch(0.52 0.01 85);text-decoration:underline")}>Undo</button>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {!shown.length ? <div style={st("font-size:13px;color:oklch(0.52 0.01 85);padding:20px 4px")}>Nothing left in this filter.</div> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
