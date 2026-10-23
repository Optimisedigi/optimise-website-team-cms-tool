import type { CitationsView, ContentMapSnapshot, InProgressItem, ReasonKind, ResearchView, SnapshotRecommendation, TopicAuthorityInput } from "@/lib/content-map/types";
import { demandByTopic, fmtVolume, GREEN, type MapModel, MUTED, type PlanLike, RED } from "@/lib/content-map/view-model";
import { TrendLine } from "./living";
import type { Audience } from "./ContentMapShell";
import { st } from "./st";
import { GAP_ITEM, MONO_LABEL, MonoTag } from "./ui";

interface Props {
  model: MapModel;
  snapshot: ContentMapSnapshot;
  clientName: string;
  authorities: TopicAuthorityInput[];
  recs: PlanLike[];
  citations?: CitationsView | null;
  /** Client view: the client's suggestions block. */
  suggestions?: React.ReactNode;
  sent: Readonly<Record<string, string>>;
  linksPlanned: number;
  linksAdded: number;
  audience: Audience;
  width: number;
  onOpenTopic: (k: string) => void;
  onOpenRec: (id: string) => void;
  onOpenLinks: () => void;
  research?: ResearchView | null;
  inProgress?: readonly InProgressItem[];
}

const PRIORITY_COLOUR: Record<SnapshotRecommendation["priority"], string> = { high: RED, medium: "oklch(0.62 0.14 62)", low: MUTED };
const CARD = "border:1px solid oklch(0.92 0.006 85);background:oklch(0.995 0.002 85);border-radius:11px;padding:14px;display:flex;flex-direction:column;gap:10px";
const TILE = "padding:10px;border-radius:8px;background:oklch(0.97 0.005 85);display:flex;flex-direction:column;gap:2px";
const TILE_NUM = "font:600 17px 'JetBrains Mono',monospace";
const TILE_LABEL = "font-size:11.5px;color:oklch(0.52 0.01 85)";
const BODY = "font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);text-wrap:pretty";

// Plain words for the reason kinds, used in the "Why these articles" line.
const REASON_WORDS: Record<ReasonKind, string> = {
  "no-page": "no page answers the question yet",
  "ai-cites-others": "AI tools cite other sites for it",
  "client-not-cited": "AI tools don't cite {site} for it",
  "unlinked-topics": "it joins topics that don't link yet",
  "orphan-pages": "it gives unlinked pages a home",
  suggested: "it was suggested",
  refresh: "an existing page needs updating",
  demand: "people search for it every month",
  questions: "it's a question people ask Google",
  competitors: "competitors cover it and the site doesn't",
  "search-console": "Google already shows the site for it without a page that answers it",
};

const STEPS: Array<[string, string]> = [
  ["Map the site", "Every page is read and placed in a topic, and every link between pages is traced, so we can see which topics hold together and which pages stand alone."],
  ["Connect what belongs together", "We add natural links between related articles, so readers and search engines can follow a topic from one article to the next."],
  ["Write what's missing", "Each new article answers one real question directly, with clear sections, FAQs and sources, so search engines and AI assistants like ChatGPT and Google's AI Overviews can find it, trust it and quote it."],
];

/** Approach tab: the strategy on one page. The team plans from it; the client sees what we're doing and why. */
export function Approach({ model, snapshot, clientName, authorities, recs, sent, linksPlanned, linksAdded, audience, width, onOpenTopic, onOpenRec, onOpenLinks, citations, suggestions, onOpenCitations, research, inProgress: writing = [] }: Props & { onOpenCitations?: () => void }) {
  const { T, topics } = model;
  const cols = width < 1000 ? "minmax(0,1fr) 340px" : "minmax(0,1fr) 400px";
  const describe = new Map(authorities.map((a) => [a.key, a.description ?? ""]));
  const built = topics.filter((t) => !t.agg && t.k !== "core");
  const primary = built.find((t) => t.primary) ?? built[0];
  const others = built.filter((t) => t !== primary);
  const isClient = audience === "client";
  const orphans = model.N.filter((n) => !n.agg && !n.inL.length).length;
  const inProgress = recs.filter((r) => sent[r.id]).length;
  const reasonCounts = new Map<ReasonKind, number>();
  recs.forEach((r) => new Set((r.reasons ?? []).map((x) => x.kind)).forEach((k) => reasonCounts.set(k, (reasonCounts.get(k) ?? 0) + 1)));
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
    .map(([k, n]) => `${REASON_WORDS[k].replace("{site}", isClient ? "your site" : "the site")} (${n})`);
  const latest = citations?.trend[citations.trend.length - 1];
  const demand = research ? demandByTopic(research, Object.fromEntries(built.map((t) => [t.k, t.name]))).slice(0, 5) : [];
  const maxDemand = Math.max(1, ...demand.map((d) => d.volume));
  const next = [...recs].sort((a, b) => b.score - a.score).slice(0, 5);

  const lead = primary
    ? `We're building ${clientName || "the site"} into a go-to source on ${primary.name}${others.length ? `, supported by ${others.map((t) => t.name).join(", ").replace(/, ([^,]*)$/, " and $1")}` : ""}. Every article sits inside one of these topics, links naturally to the articles around it, and answers a real question directly, so search engines and AI assistants can find it, trust it and quote it.`
    : "Every article sits inside a topic, links naturally to the articles around it, and answers a real question directly, so search engines and AI assistants can find it, trust it and quote it.";

  return (
    <div style={st(`display:grid;grid-template-columns:${cols};min-height:0;height:100%`)}>
      <main style={st("min-width:0;min-height:0;overflow:auto;padding:18px 22px 28px;display:flex;flex-direction:column;gap:22px")}>
        <div style={st("display:flex;flex-direction:column;gap:8px;max-width:760px")}>
          <div style={st("font-size:17px;font-weight:600")}>{isClient ? "Our approach" : "The approach"}</div>
          <div style={st("font-size:14px;line-height:1.55;text-wrap:pretty")}>{lead}</div>
        </div>

        <div style={st("display:flex;flex-direction:column;gap:10px")}>
          <div style={st(MONO_LABEL)}>Topics we're building · {built.length}</div>
          {built.map((t) => {
            const o = T[t.k];
            if (!o) return null;
            const planned = recs.filter((r) => r.topic === t.k).length;
            const cite = citations?.byTopic[t.k];
            const cov = Math.round((o.cov || 0) * 100);
            const tr = research?.topics[t.k];
            const tiles = 4 + (cite ? 1 : 0) + (tr?.volume ? 1 : 0);
            const description = t.description || describe.get(t.k) || "";
            return (
              <button type="button" key={t.k} data-testid="approach-topic" className="ccm-hbg" onClick={() => onOpenTopic(t.k)} style={st(`${CARD};cursor:pointer;text-align:left;width:100%`)}>
                <div style={st("display:flex;align-items:center;gap:8px;width:100%")}>
                  <span style={st(`width:10px;height:10px;border-radius:50%;flex:none;background:${t.c}`)} />
                  <span style={st("font-size:15px;font-weight:600;flex:1")}>{t.name}</span>
                  {t.primary ? <MonoTag>PRIMARY</MonoTag> : null}
                </div>
                {description ? <div style={st(`${BODY};padding-left:18px`)}>{description}</div> : null}
                <div style={st(`display:grid;grid-template-columns:repeat(${tiles},minmax(0,1fr));gap:8px;width:100%`)}>
                  <div style={st(TILE)}><span style={st(TILE_NUM)}>{o.pages}</span><span style={st(TILE_LABEL)}>pages</span></div>
                  <div style={st(TILE)}><span style={st(TILE_NUM)}>{o.intra}</span><span style={st(TILE_LABEL)}>links within</span></div>
                  <div style={st(TILE)}><span style={st(TILE_NUM)}>{cov}%</span><span style={st(TILE_LABEL)}>peer-linked</span></div>
                  <div style={st(TILE)}><span style={st(TILE_NUM)}>{planned}</span><span style={st(TILE_LABEL)}>articles planned</span></div>
                  {tr?.volume ? <div data-testid="approach-demand" style={st(TILE)}><span style={st(TILE_NUM)}>{fmtVolume(tr.volume)}</span><span style={st(TILE_LABEL)}>Searches/mo</span></div> : null}
                  {cite ? <div style={st(TILE)}><span style={st(`${TILE_NUM};color:${cite.cited ? GREEN : RED}`)}>{cite.cited}<span style={st("font-size:12px;color:oklch(0.52 0.01 85);font-weight:500")}>/{cite.checks}</span></span><span style={st(TILE_LABEL)}>AI citations</span></div> : null}
                </div>
                <div style={st("display:flex;align-items:center;gap:8px;width:100%")}>
                  <div style={st("flex:1;height:4px;border-radius:2px;background:oklch(0.92 0.006 85);overflow:hidden")}><div style={st(`height:100%;border-radius:2px;width:${cov}%;background:${t.c}`)} /></div>
                  <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);min-width:32px;text-align:right")}>{cov}%</span>
                </div>
                {tr?.volume ? <div style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>{isClient ? "You cover" : "The site covers"} {Math.round(tr.covered * 100)}% of the demand</div> : null}
              </button>
            );
          })}
        </div>

        <div style={st("display:flex;flex-direction:column;gap:10px;max-width:760px")}>
          <div style={st(MONO_LABEL)}>How we work</div>
          {STEPS.map(([title, text], ix) => (
            <div key={title} style={st("display:flex;gap:12px;align-items:flex-start")}>
              <span style={st("font:600 12px 'JetBrains Mono',monospace;width:22px;height:22px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:oklch(0.24 0.012 85);color:oklch(0.98 0.004 85)")}>{ix + 1}</span>
              <div style={st("display:flex;flex-direction:column;gap:3px")}>
                <span style={st("font-size:13.5px;font-weight:600")}>{title}</span>
                <span style={st(BODY)}>{text}</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      <aside style={st("border-left:1px solid oklch(0.9 0.006 85);overflow:auto;background:oklch(0.995 0.002 85)")}>
        <div style={st("padding:22px;display:flex;flex-direction:column;gap:22px")}>
          <div style={st("display:flex;flex-direction:column;gap:8px")}>
            <div style={st(MONO_LABEL)}>Where things stand</div>
            <div style={st("display:grid;grid-template-columns:repeat(2,1fr);gap:8px")}>
              <div style={st(TILE)}><span style={st(TILE_NUM)}>{snapshot.stats.pagesCrawled}</span><span style={st(TILE_LABEL)}>pages mapped</span></div>
              <div style={st(TILE)}><span style={st(TILE_NUM)}>{model.linkTotal}</span><span style={st(TILE_LABEL)}>in-text links today</span></div>
              <button type="button" onClick={onOpenLinks} className="ccm-hbg" style={st(`${TILE};border:0;cursor:pointer;text-align:left`)}>
                <span style={st(`${TILE_NUM};color:${GREEN}`)}>{linksAdded}<span style={st("font-size:12px;color:oklch(0.52 0.01 85);font-weight:500")}> / {linksPlanned}</span></span>
                <span style={st(TILE_LABEL)}>links added / planned</span>
              </button>
              <div style={st(TILE)}><span style={st(TILE_NUM)}>{recs.length}</span><span style={st(TILE_LABEL)}>{inProgress ? `articles planned · ${inProgress} in progress` : "articles planned"}</span></div>
            </div>
          </div>

          <div style={st("display:flex;flex-direction:column;gap:6px")}>
            <div style={st(MONO_LABEL)}>Gaps we're closing</div>
            <div style={st(BODY)}>
              <span style={st(`font:600 13px 'JetBrains Mono',monospace;color:${RED}`)}>{model.gaps.length}</span> topic pairs don&apos;t link to each other yet, and{" "}
              <span style={st(`font:600 13px 'JetBrains Mono',monospace;color:${RED}`)}>{orphans}</span> pages have no links from other pages. New links and new articles close these first.
            </div>
          </div>

          {latest ? (
            <div data-testid="approach-citations" style={st("display:flex;flex-direction:column;gap:8px")}>
              <div style={st(MONO_LABEL)}>AI citations</div>
              <button type="button" onClick={onOpenCitations} className="ccm-hbg" style={st(`${TILE};border:0;cursor:pointer;text-align:left`)}>
                <span style={st(`${TILE_NUM};color:${GREEN}`)}>{latest.cited}<span style={st("font-size:12px;color:oklch(0.52 0.01 85);font-weight:500")}> / {latest.checks}</span></span>
                <span style={st(TILE_LABEL)}>{isClient ? "AI answers citing your site, latest week" : "AI answers citing the client, latest run"}</span>
              </button>
              <TrendLine trend={citations?.trend ?? []} />
            </div>
          ) : null}

          {demand.length ? (
            <div data-testid="approach-where-demand" style={st("display:flex;flex-direction:column;gap:8px")}>
              <div style={st(MONO_LABEL)}>Where demand is</div>
              {demand.map((d) => (
                <button type="button" key={d.k} onClick={() => onOpenTopic(d.k)} style={st("border:0;background:none;padding:3px 0;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;text-align:left;color:inherit")}>
                  <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;background:${T[d.k]?.c ?? MUTED}`)} /><span style={st("width:120px")}>{d.name}</span>
                  <div style={st("flex:1;height:6px;border-radius:3px;background:oklch(0.94 0.005 85);overflow:hidden")}><div style={st(`height:100%;width:${(d.volume / maxDemand) * 100}%;background:${T[d.k]?.c ?? MUTED}`)} /></div>
                  <span style={st("width:56px;text-align:right;font:12px 'JetBrains Mono',monospace")}>{fmtVolume(d.volume)}/mo</span>
                </button>
              ))}
            </div>
          ) : null}

          {writing.length ? (
            <div data-testid="approach-in-progress" style={st("display:flex;flex-direction:column;gap:6px")}>
              <div style={st(MONO_LABEL)}>In progress · {writing.length}</div>
              {writing.map((w) => (
                <div key={w.id} style={st("display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.35")}>
                  <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${T[w.placement?.topic ?? ""]?.c ?? MUTED}`)} />
                  <span style={st("flex:1")}>{w.title}</span>
                  <MonoTag>{w.kind}</MonoTag>
                </div>
              ))}
            </div>
          ) : null}

          {suggestions}

          {next.length ? (
            <div style={st("display:flex;flex-direction:column;gap:8px")}>
              <div style={st(MONO_LABEL)}>{isClient ? "Next articles" : "Write next"} · {recs.length}</div>
              {topReasons.length ? <div data-testid="why-articles" style={st(BODY)}><span style={st("font-weight:600;color:oklch(0.24 0.012 85)")}>Why these articles:</span> {topReasons.join(" · ")}.</div> : null}
              {next.map((r) => (
                <button type="button" key={r.id} className="ccm-hbg" onClick={() => onOpenRec(r.id)} style={st(`${GAP_ITEM};align-items:flex-start`)}>
                  <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${T[r.topic]?.c ?? MUTED}`)} />
                  <span style={st("display:flex;flex-direction:column;gap:3px;flex:1")}>
                    <span style={st("line-height:1.35")}>{r.title}</span>
                    <span style={st("font-size:12px;line-height:1.4;color:oklch(0.52 0.01 85)")}>{r.question}</span>
                  </span>
                  {sent[r.id] ? <MonoTag>{isClient ? "in progress" : "sent"}</MonoTag> : <span style={st(`font:11px 'JetBrains Mono',monospace;color:${PRIORITY_COLOUR[r.priority]}`)}>{r.priority}</span>}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
