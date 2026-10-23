import type { ResearchLayer, ResearchView } from "@/lib/content-map/types";
import { bridgesFor, fmtVolume, INK, type MapModel, matrixColumns, pairDemand, RED, type SuggestionOverlay, sum } from "@/lib/content-map/view-model";
import { st } from "./st";

interface Props {
  model: MapModel;
  pair: [string, string] | null;
  onCell: (a: string, b: string) => void;
  overlay?: SuggestionOverlay;
  /** Research layers that are switched on; Search volume adds demand between topic pairs. */
  research?: { view: ResearchView; layers: ReadonlySet<ResearchLayer> };
}

/** Gap matrix: SEO topics as rows, every topic as a column. */
export function GapMatrix({ model, pair, onCell, overlay, research }: Props) {
  const volumeOn = !!research?.layers.has("volume");
  const { topics, M } = model;
  return (
    <div style={st("flex:1;min-height:0;overflow:auto;padding:18px 22px 24px;display:flex;flex-direction:column;gap:14px")}>
      <div style={st("font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);max-width:640px;text-wrap:pretty")}>Rows link out, columns receive. Numbers are in-text links. Hatched cells are SEO topics that never link to each other. Click any cell to see the links or candidates.{overlay?.bridges.length ? " Dashed outlines are suggested connections." : ""}{volumeOn ? " Small numbers are monthly searches for articles that would join the two topics." : ""}</div>
      <div data-testid="gap-matrix" style={st(`display:grid;grid-template-columns:${matrixColumns(topics.length)};gap:3px;min-width:720px`)}>
        <div />
        {topics.map((h) => (
          <div key={h.k} style={st("display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;padding-bottom:6px;min-height:118px")}>
            <span style={st("writing-mode:vertical-rl;transform:rotate(180deg);font-size:12px;font-weight:500;white-space:nowrap")}>{h.name}</span>
            <span style={st(`width:8px;height:8px;border-radius:50%;background:${h.c}`)} />
          </div>
        ))}
        {topics.filter((t) => !t.agg).map((a) => [
          <div key={`r-${a.k}`} style={st("display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;padding-right:6px")}>
            <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;background:${a.c}`)} />{a.name}
          </div>,
          ...topics.map((b) => {
            const w = sum(M[a.k]?.[b.k] ?? []);
            const diag = a.k === b.k;
            const sel = !!pair && pair[0] === a.k && pair[1] === b.k;
            const gap = !w && !b.agg && !diag;
            const pct = w ? Math.min(85, 14 + Math.log2(w + 1) * 11) : 0;
            const bg = gap ? "repeating-linear-gradient(135deg,oklch(0.93 0.04 25) 0 3px,oklch(0.975 0.012 25) 3px 7px)" : w ? `color-mix(in oklch, ${a.c} ${pct}%, white)` : "oklch(0.96 0.004 85)";
            const color = gap ? RED : pct > 48 ? "#fff" : w ? INK : "oklch(0.75 0.01 85)";
            const bridged = !!overlay && bridgesFor(overlay, a.k, b.k).length > 0;
            const demand = volumeOn && research && !diag ? pairDemand(research.view, a.k, b.k) : null;
            const outline = sel ? `2px solid ${INK}` : bridged ? `1.5px dashed ${INK}` : diag ? `1.5px dashed ${a.c}` : "none";
            return (
              <button type="button" key={`${a.k}-${b.k}`} onClick={() => onCell(a.k, b.k)} title={`${a.name} → ${b.name}: ${w} links${bridged ? " · suggested link" : ""}${demand ? ` · ${demand.volume} searches a month` : ""}`} data-bridged={bridged || undefined} style={st(`border:0;cursor:pointer;height:40px;border-radius:5px;font:500 12px 'JetBrains Mono',monospace;background:${bg};color:${color};outline:${outline};outline-offset:-2px`)}>
                {demand ? (
                  <span data-testid={`pair-demand-${a.k}-${b.k}`} style={st("display:flex;flex-direction:column;align-items:center;line-height:1.1")}>
                    <span>{w ? w : gap ? "gap" : "·"}</span>
                    <span style={st(`font:500 9.5px 'JetBrains Mono',monospace;opacity:.8;border:1px dashed currentColor;border-radius:3px;padding:0 3px;margin-top:2px`)}>{`${fmtVolume(demand.volume)}/mo`}</span>
                  </span>
                ) : w ? w : gap ? "gap" : "·"}
              </button>
            );
          }),
        ])}
      </div>
      <div style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>Grouped pages ({topics.filter((t) => t.agg).map((t) => t.name.toLowerCase()).join(", ")}) are summarised as single targets, so they only appear as columns.</div>
    </div>
  );
}
