import type { TopicState } from "@/lib/content-map/view-model";
import { st } from "./st";
import { MonoTag } from "./ui";

interface Props {
  topics: TopicState[];
  display: string;
  active: string | null;
  hoverTopic: string | null;
  allActive: boolean;
  onAll: () => void;
  onSelect: (k: string) => void;
  onHover: (k: string | null) => void;
}

/** Left aside: "All topics", SEO topics with coverage bars, grouped pages. */
export function TopicList({ topics, display, active, hoverTopic, allActive, onAll, onSelect, onHover }: Props) {
  const bg = (k: string) => (active === k ? "oklch(0.94 0.008 85)" : hoverTopic === k ? "oklch(0.965 0.005 85)" : "transparent");
  const pct = (t: TopicState) => `${Math.round((t.cov || 0) * 100)}%`;
  return (
    <aside style={st(`border-right:1px solid oklch(0.9 0.006 85);overflow:auto;padding:18px 12px;display:${display};flex-direction:column;gap:4px;background:oklch(0.99 0.003 85)`)}>
      <button type="button" onClick={onAll} style={st(`border:0;text-align:left;cursor:pointer;padding:9px 10px;border-radius:8px;font-size:13px;font-weight:600;background:${allActive ? "oklch(0.94 0.008 85)" : "transparent"}`)}>All topics</button>
      <div style={st("font:500 10.5px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:oklch(0.52 0.01 85);padding:14px 10px 6px")}>SEO topics</div>
      {topics.filter((t) => !t.agg).map((t) => (
        <button type="button" key={t.k} onClick={() => onSelect(t.k)} onMouseEnter={() => onHover(t.k)} onMouseLeave={() => onHover(null)} style={st(`border:0;text-align:left;cursor:pointer;padding:9px 10px;border-radius:8px;display:flex;flex-direction:column;gap:6px;background:${bg(t.k)}`)}>
          <div style={st("display:flex;align-items:center;gap:8px;width:100%")}>
            <span style={st(`width:9px;height:9px;border-radius:50%;flex:none;background:${t.c}`)} />
            <span style={st("font-size:13.5px;font-weight:500;flex:1")}>{t.name}</span>
            {t.primary ? <MonoTag>PRIMARY</MonoTag> : null}
            <span style={st("font:12px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{t.pages}</span>
          </div>
          <div style={st("display:flex;align-items:center;gap:8px;width:100%;padding-left:17px;box-sizing:border-box")}>
            <div style={st("flex:1;height:4px;border-radius:2px;background:oklch(0.92 0.006 85);overflow:hidden")}><div style={st(`height:100%;border-radius:2px;width:${pct(t)};background:${t.c}`)} /></div>
            <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);min-width:32px;text-align:right")}>{pct(t)}</span>
          </div>
        </button>
      ))}
      <div style={st("font-size:11.5px;line-height:1.45;color:oklch(0.52 0.01 85);padding:4px 10px 0;text-wrap:pretty")}>Bar = share of pages that get at least one link from a page in the same topic.</div>
      <div style={st("font:500 10.5px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase;color:oklch(0.52 0.01 85);padding:18px 10px 6px")}>Grouped pages</div>
      {topics.filter((t) => t.agg).map((t) => (
        <button type="button" key={t.k} onClick={() => onSelect(t.k)} onMouseEnter={() => onHover(t.k)} onMouseLeave={() => onHover(null)} style={st(`border:0;text-align:left;cursor:pointer;padding:8px 10px;border-radius:8px;display:flex;align-items:center;gap:8px;background:${bg(t.k)}`)}>
          <span style={st(`width:9px;height:9px;border-radius:50%;flex:none;background:${t.c}`)} />
          <span style={st("font-size:13px;flex:1")}>{t.name}</span>
          <span style={st("font:12px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{t.pages}</span>
        </button>
      ))}
    </aside>
  );
}
