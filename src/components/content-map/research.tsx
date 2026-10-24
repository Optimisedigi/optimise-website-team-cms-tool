import { useState } from "react";
import { briefHref } from "@/lib/content-map/paths";
import { type InProgressItem, type PlacementResult, RESEARCH_LAYER_LABELS, RESEARCH_LAYERS, type ResearchEvidence, type ResearchIdea, type ResearchLayer, type ResearchView } from "@/lib/content-map/types";
import { fmtCount, fmtVolume, gscDropped, type MapModel, MUTED, placementLine, RED, shortDay } from "@/lib/content-map/view-model";
import type { Audience } from "./ContentMapShell";
import { useOpenAdminDoc } from "./AdminDocPanel";
import { st } from "./st";
import { ACTIVE_TAB, DARK_BTN, GHOST_BTN, LINK_BTN, MONO_LABEL, MonoTag } from "./ui";

export type ResearchAction = "add" | "dismiss" | "restore";
/** Team-only research controls. */
export interface ResearchTeam {
  running: boolean;
  error: string | null;
  busy: string | null;
  onRun: () => void;
  onDecide: (id: string, action: ResearchAction) => void;
}
/** What was clicked on the map: a research idea, a Search Console query (by index) or a topic's research. */
export type ResearchSel = { kind: "idea"; id: string } | { kind: "query"; ix: number } | { kind: "topic"; k: string };

const DASHED = "border:1px dashed oklch(0.75 0.01 85)";
const MONO_MUTED = "font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)";
const BODY = "font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);text-wrap:pretty";
const STAT_BOX = "padding:10px;border-radius:8px;background:oklch(0.97 0.005 85);display:flex;flex-direction:column;gap:2px";
const STAT_NUM = "font:600 17px 'JetBrains Mono',monospace";
const STAT_LBL = "font-size:11.5px;color:oklch(0.52 0.01 85)";
const CARD = `${DASHED};border-radius:11px;padding:12px;display:flex;flex-direction:column;gap:7px;background:oklch(0.995 0.002 85)`;

/** The research row is hidden until there is research (or one is running). */
export const showResearch = (r: ResearchView | null | undefined): r is ResearchView => !!r && r.status !== "none";

function Stat({ n, label, color }: { n: string | number; label: string; color?: string }) {
  return <div style={st(STAT_BOX)}><span style={st(`${STAT_NUM}${color ? `;color:${color}` : ""}`)}>{n}</span><span style={st(STAT_LBL)}>{label}</span></div>;
}

function statusText(r: ResearchView, team: ResearchTeam | undefined): string {
  if (team?.error) return team.error;
  if (r.status === "running" || team?.running) return "Researching…";
  if (r.status === "failed" && team) return `Research failed${r.error ? `: ${r.error}` : ""}`;
  return [r.generatedAt ? `Researched ${shortDay(r.generatedAt)}` : "", r.gscConnected ? (r.gscAt ? `Search Console ${shortDay(r.gscAt)}` : "") : "Search Console isn't connected"].filter(Boolean).join(" · ");
}

/** Four switches, all off when the page opens; styled like the tab bar, small. */
export function LayerBar({ research, layers, onToggle, team }: { research: ResearchView; layers: ReadonlySet<ResearchLayer>; onToggle: (l: ResearchLayer) => void; team?: ResearchTeam }) {
  const busy = research.status === "running" || !!team?.running;
  return (
    <div data-testid="research-layers" style={st("display:flex;align-items:center;gap:10px;padding:8px 22px 0;min-width:0")}>
      <span style={st(MONO_LABEL)}>Research</span>
      <div role="group" aria-label="Research layers" style={st("flex:none;display:flex;gap:2px;padding:2px;border-radius:8px;background:oklch(0.94 0.006 85)")}>
        {RESEARCH_LAYERS.map((l) => {
          const on = layers.has(l), off = l === "gsc" && !research.gscConnected;
          return (
            <button type="button" role="switch" aria-checked={on} key={l} disabled={off} onClick={() => onToggle(l)} title={off ? "Search Console isn't connected" : undefined}
              style={st(`border:0;cursor:${off ? "default" : "pointer"};padding:4px 10px;border-radius:6px;font-size:12px;font-weight:500;white-space:nowrap;color:inherit;opacity:${off ? 0.45 : 1};background:${on ? ACTIVE_TAB.bg : "transparent"};box-shadow:${on ? ACTIVE_TAB.sh : "none"}`)}>
              {RESEARCH_LAYER_LABELS[l]}
            </button>
          );
        })}
      </div>
      <span data-testid="research-status" title={statusText(research, team)} style={st(`font-size:12px;line-height:1.35;color:${team?.error || (team && research.status === "failed") ? RED : MUTED};min-width:0;flex:1;text-wrap:balance`)}>{statusText(research, team)}</span>
      {team ? <button type="button" disabled={busy} onClick={team.onRun} style={st(`${GHOST_BTN};opacity:${busy ? 0.6 : 1}`)}>Research now</button> : null}
    </div>
  );
}

/** Evidence lines; competitor sites only for the team (the client view never gets them). */
export function EvidenceLines({ evidence, team }: { evidence: readonly ResearchEvidence[]; team: boolean }) {
  if (!evidence.length) return null;
  return (
    <div style={st("display:flex;flex-direction:column;gap:6px")}>
      <div style={st(`${MONO_LABEL};padding-bottom:2px`)}>Evidence · {evidence.length}</div>
      {evidence.map((e, ix) => (
        <div key={ix} data-testid="evidence-line" style={st("display:flex;flex-direction:column;gap:2px")}>
          <span style={st("display:flex;gap:8px;align-items:baseline;font-size:12.5px;line-height:1.4")}><span style={st(`${MONO_MUTED};width:92px;flex:none;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em`)}>{RESEARCH_LAYER_LABELS[e.source]}</span><span>{e.text}</span></span>
          {team && e.domains?.length ? <span style={st(`${MONO_MUTED};padding-left:100px`)}>{e.domains.join(" · ")}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Placement line, fit bar, overlaps, links and warnings. */
export function PlacementView({ p, model, onNode }: { p: PlacementResult; model: MapModel; onNode?: (id: string) => void }) {
  const name = (k: string) => model.T[k]?.name ?? k;
  const fit = Math.round(Math.max(0, Math.min(1, p.fit)) * 100);
  const colour = p.topic ? model.T[p.topic]?.c ?? MUTED : MUTED;
  const links = (label: string, list: PlacementResult["linksTo"]) => list.length ? (
    <div style={st("display:flex;flex-direction:column;gap:2px")}>
      <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>{label} · {list.length}</div>
      {list.map((l) => {
        const n = model.N.find((x) => x.id === l.id);
        const dot = <span style={st(`width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;background:${model.T[n?.g ?? ""]?.c ?? MUTED}`)} />;
        return onNode && n
          ? <button type="button" key={l.id} className="ccm-hul" onClick={() => onNode(l.id)} style={st(`${LINK_BTN};display:flex;align-items:flex-start;gap:8px`)}>{dot}<span style={st("flex:1")}>{n.title}</span></button>
          : <div key={l.id} style={st("display:flex;align-items:flex-start;gap:8px;font-size:12.5px;line-height:1.35;padding:3px 0")}>{dot}<span>{n?.title ?? l.title}</span></div>;
      })}
    </div>
  ) : null;
  return (
    <div data-testid="placement" style={st("display:flex;flex-direction:column;gap:12px")}>
      <div style={st("display:flex;flex-direction:column;gap:6px")}>
        <div data-testid="placement-line" style={st("display:flex;gap:8px;align-items:flex-start;font-size:13px;font-weight:500;line-height:1.4")}><span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;${p.placement === "new-topic" ? `border:1.5px dashed ${MUTED};box-sizing:border-box` : `background:${colour}`}`)} />{placementLine(p, name)}</div>
        {p.placement !== "new-topic" ? (
          <div style={st("display:flex;align-items:center;gap:8px;padding-left:16px")}>
            <span style={st(`${MONO_MUTED};width:22px`)}>fit</span>
            <div style={st("flex:1;max-width:160px;height:4px;border-radius:2px;background:oklch(0.92 0.006 85);overflow:hidden")}><div style={st(`height:100%;width:${fit}%;background:${colour}`)} /></div>
            <span style={st(`${MONO_MUTED};width:30px;text-align:right`)}>{fit}</span>
          </div>
        ) : null}
        {p.overlaps.length ? (
          <div style={st("display:flex;flex-wrap:wrap;gap:8px;padding-left:16px")}>
            <span style={st("font-size:11.5px;color:oklch(0.52 0.01 85)")}>Also touches</span>
            {p.overlaps.map((k) => <span key={k} style={st("display:flex;align-items:center;gap:4px;font-size:11.5px;color:oklch(0.52 0.01 85)")}><span style={st(`width:7px;height:7px;border-radius:50%;background:${model.T[k]?.c ?? MUTED}`)} />{name(k)}</span>)}
          </div>
        ) : null}
      </div>
      {p.warnings.map((w, ix) => <div key={ix} style={st("font-size:12.5px;line-height:1.45;padding:8px 10px;border-radius:8px;background:oklch(0.97 0.02 25);color:oklch(0.45 0.15 25)")}>{w}</div>)}
      {links("→ Links to", p.linksTo)}
      {links("← Linked from", p.linksFrom)}
    </div>
  );
}

function IdeaActions({ idea, team }: { idea: ResearchIdea; team: ResearchTeam }) {
  const busy = team.busy === idea.id;
  if (idea.status === "in-plan") return <span style={st("font-size:12px;font-weight:500;color:oklch(0.55 0.13 160)")}>In the plan</span>;
  if (idea.status === "dismissed") return <button type="button" disabled={busy} onClick={() => team.onDecide(idea.id, "restore")} style={st(`${GHOST_BTN};opacity:${busy ? 0.6 : 1}`)}>Restore</button>;
  return (
    <>
      <button type="button" disabled={busy} onClick={() => team.onDecide(idea.id, "add")} style={st(`${DARK_BTN};opacity:${busy ? 0.6 : 1}`)}>{busy ? "Adding…" : "Add to plan"}</button>
      <button type="button" disabled={busy} onClick={() => team.onDecide(idea.id, "dismiss")} style={st(`${GHOST_BTN};opacity:${busy ? 0.6 : 1}`)}>Dismiss</button>
    </>
  );
}

/** Right aside when a research element on the map is clicked. */
export function ResearchPanel({ sel, research, model, audience, team, onClose, onNode }: { sel: ResearchSel; research: ResearchView; model: MapModel; audience: Audience; team?: ResearchTeam; onClose: () => void; onNode: (id: string) => void }) {
  const isTeam = audience === "team";
  const head = (label: string, colour: string | null, title: string) => (
    <div style={st("display:flex;flex-direction:column;gap:8px")}>
      <div style={st("display:flex;align-items:center;gap:8px")}>
        <span style={st(`${MONO_LABEL};flex:1;display:flex;align-items:center;gap:6px`)}>{colour ? <span style={st(`width:8px;height:8px;border-radius:50%;background:${colour}`)} /> : null}{label}</span>
        <button type="button" onClick={onClose} style={st(GHOST_BTN)}>Close</button>
      </div>
      <div style={st("font-size:17px;font-weight:600;line-height:1.3;text-wrap:pretty")}>{title}</div>
    </div>
  );
  let body: React.ReactNode = null;
  if (sel.kind === "idea") {
    const idea = research.ideas.find((i) => i.id === sel.id);
    if (!idea) return null;
    body = (
      <>
        {head(idea.status === "in-plan" ? "Research idea · in the plan" : "Research idea", idea.topic ? model.T[idea.topic]?.c ?? null : null, idea.title)}
        <div style={st("font-size:13px;line-height:1.5;margin-top:-10px")}>{idea.question}</div>
        {idea.volume ? <div style={st("display:grid;grid-template-columns:repeat(2,1fr);gap:8px")}><Stat n={fmtCount(idea.volume)} label="searches a month" /><Stat n={idea.keywords.length} label="keywords" /></div> : null}
        {team && isTeam ? <div style={st("display:flex;align-items:center;gap:8px")}><IdeaActions idea={idea} team={team} /></div> : null}
        <PlacementView p={idea} model={model} onNode={onNode} />
        <EvidenceLines evidence={idea.evidence} team={isTeam} />
        {idea.keywords.length ? (
          <div style={st("display:flex;flex-direction:column;gap:6px")}>
            <div style={st(MONO_LABEL)}>Keywords</div>
            <div style={st("display:flex;flex-wrap:wrap;gap:6px")}>{idea.keywords.map((k) => <MonoTag key={k}>{k}</MonoTag>)}</div>
          </div>
        ) : null}
      </>
    );
  } else if (sel.kind === "query") {
    const q = research.gscQueries[sel.ix];
    if (!q) return null;
    const what = q.kind === "cannibal" ? "Two or more of the site's pages compete for this search. Pick one to answer it and link the others to it." : q.kind === "unanswered" ? "Google shows the site for this search, but no page really answers it." : "A real question people search for.";
    body = (
      <>
        {head(q.kind === "cannibal" ? "Search Console · pages compete" : "Search Console", q.topic ? model.T[q.topic]?.c ?? null : null, q.query)}
        <div style={st(`${BODY};margin-top:-10px`)}>{what}</div>
        <div style={st("display:grid;grid-template-columns:repeat(3,1fr);gap:8px")}><Stat n={fmtVolume(q.impressions)} label="impressions" /><Stat n={q.clicks} label="clicks" /><Stat n={q.position.toFixed(1)} label="position" /></div>
        {q.pages.length ? (
          <div style={st("display:flex;flex-direction:column;gap:2px")}>
            <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>Pages Google shows · {q.pages.length}</div>
            {q.pages.map((id) => {
              const n = model.N.find((x) => x.id === id);
              return <button type="button" key={id} className="ccm-hul" onClick={() => onNode(id)} style={st(LINK_BTN)}>{n?.title ?? id}</button>;
            })}
          </div>
        ) : null}
      </>
    );
  } else {
    const tr = research.topics[sel.k];
    const t = model.T[sel.k];
    if (!tr || !t) return null;
    body = (
      <>
        {head("Topic research", t.c, t.name)}
        <div style={st("display:grid;grid-template-columns:repeat(2,1fr);gap:8px")}>
          <Stat n={`${fmtVolume(tr.volume)}/mo`} label="searches" />
          <Stat n={`${Math.round(tr.covered * 100)}%`} label="of the demand covered" />
          <Stat n={tr.questions} label="questions people ask" />
          <Stat n={tr.competitorPages} label="competitor pages" />
        </div>
        {tr.gsc ? <div style={st(BODY)}>Search Console, last 28 days: {fmtCount(tr.gsc.impressions)} impressions, {fmtCount(tr.gsc.clicks)} clicks, average position {tr.gsc.position.toFixed(1)}.</div> : null}
        <TopicCompetitors k={sel.k} research={research} team={isTeam} />
      </>
    );
  }
  return <div data-testid="research-panel" style={st("padding:22px;display:flex;flex-direction:column;gap:18px")}>{body}</div>;
}

/** Competitor sites per topic: team only. The client view only has counts. */
export function TopicCompetitors({ k, research, team }: { k: string; research: ResearchView; team: boolean }) {
  const tr = research.topics[k];
  if (!team || !tr?.competitorDomains.length) return null;
  return (
    <div data-testid="competitor-domains" style={st("display:flex;flex-direction:column;gap:4px")}>
      <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>Competitors · {tr.competitorDomains.length}</div>
      {tr.competitorDomains.map((d) => (
        <div key={d.domain} style={st("display:flex;gap:8px;font-size:12.5px")}><span style={st("flex:1")}>{d.domain}</span><span style={st(MONO_MUTED)}>{d.pages} {d.pages === 1 ? "page" : "pages"}</span></div>
      ))}
    </div>
  );
}

/** Research summary for the selected topic in the map aside, per layer that is on. */
export function TopicResearchBlock({ k, research, layers, team, gscPages, model, onNode }: { k: string; research: ResearchView; layers: ReadonlySet<ResearchLayer>; team: boolean; gscPages?: boolean; model: MapModel; onNode: (id: string) => void }) {
  const tr = research.topics[k];
  if (!tr) return null;
  const drops = gscPages && layers.has("gsc") ? research.gscPages.filter((p) => gscDropped(p) && model.N.some((n) => n.id === p.nodeId && n.g === k)) : [];
  const parts: string[] = [];
  if (layers.has("volume")) parts.push(`${fmtCount(tr.volume)} searches a month, ${Math.round(tr.covered * 100)}% covered`);
  if (layers.has("questions")) parts.push(`${tr.questions} questions people ask`);
  if (layers.has("competitors")) parts.push(`${tr.competitorPages} competitor pages`);
  if (layers.has("gsc") && tr.gsc) parts.push(`${fmtCount(tr.gsc.impressions)} impressions at position ${tr.gsc.position.toFixed(1)}`);
  if (!parts.length) return null;
  return (
    <div data-testid="topic-research" style={st("padding:22px 22px 0;display:flex;flex-direction:column;gap:8px")}>
      <div style={st(MONO_LABEL)}>Research</div>
      {parts.map((p) => <div key={p} style={st("font-size:12.5px;line-height:1.4")}>{p}</div>)}
      {layers.has("competitors") ? <TopicCompetitors k={k} research={research} team={team} /> : null}
      {drops.length ? (
        <div style={st("display:flex;flex-direction:column;gap:2px")}>
          <div style={st(`${MONO_LABEL};padding:4px 0;color:${RED}`)}>Clicks down · {drops.length}</div>
          {drops.map((p) => <button type="button" key={p.nodeId} className="ccm-hul" onClick={() => onNode(p.nodeId)} style={st(LINK_BTN)}>{model.N.find((n) => n.id === p.nodeId)?.title ?? p.nodeId} <span style={st(`${MONO_MUTED};color:${RED}`)}>{Math.round((p.clicksChange ?? 0) * 100)}%</span></button>)}
        </div>
      ) : null}
    </div>
  );
}

function IdeaRow({ idea, model, team }: { idea: ResearchIdea; model: MapModel; team?: ResearchTeam }) {
  const name = (k: string) => model.T[k]?.name ?? k;
  return (
    <div data-testid="research-idea" style={st(CARD)}>
      <div style={st("display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.35")}>
        <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;box-sizing:border-box;border:1.5px dashed ${idea.topic ? model.T[idea.topic]?.c ?? MUTED : MUTED}`)} />
        <span style={st("font-weight:500;flex:1")}>{idea.title}</span>
        {idea.volume ? <span style={st(MONO_MUTED)}>{fmtCount(idea.volume)}/mo</span> : null}
      </div>
      <div style={st("font-size:12px;line-height:1.4;color:oklch(0.4 0.01 85);padding-left:16px")}>{idea.question}</div>
      <div style={st("font-size:12px;line-height:1.4;color:oklch(0.52 0.01 85);padding-left:16px")}>{placementLine(idea, name)}</div>
      <div style={st("display:flex;flex-wrap:wrap;gap:6px;padding-left:16px")}>
        {idea.evidence.map((e, ix) => <span key={ix} style={st("font-size:11.5px;line-height:1.3;padding:2px 7px;border-radius:5px;background:oklch(0.94 0.006 85);color:oklch(0.4 0.01 85)")}>{e.text}</span>)}
      </div>
      {team ? <div style={st("display:flex;gap:8px;padding-left:16px")}><IdeaActions idea={idea} team={team} /></div> : null}
    </div>
  );
}

/** Write next: listed research ideas (team: Add to plan / Dismiss; dismissed collapsed with Restore). */
export function ResearchList({ research, model, team }: { research: ResearchView; model: MapModel; team?: ResearchTeam }) {
  const [showDismissed, setShowDismissed] = useState(false);
  const listed = research.ideas.filter((i) => i.status === "listed");
  const dismissed = team ? research.ideas.filter((i) => i.status === "dismissed") : [];
  if (!listed.length && !dismissed.length) return null;
  return (
    <div data-testid="research-list" style={st("display:flex;flex-direction:column;gap:8px")}>
      <div style={st(MONO_LABEL)}>{team ? "Research" : "More ideas from research"} · {listed.length}</div>
      {!team ? <div style={st(BODY)}>Found in what people search for. We may add these to the plan later.</div> : null}
      {listed.map((i) => <IdeaRow key={i.id} idea={i} model={model} team={team} />)}
      {dismissed.length ? (
        <>
          <button type="button" onClick={() => setShowDismissed((v) => !v)} style={st("border:0;background:none;padding:2px 0;cursor:pointer;text-align:left;font-size:12px;color:oklch(0.52 0.01 85)")}>{showDismissed ? "Hide" : "Show"} dismissed · {dismissed.length}</button>
          {showDismissed ? dismissed.map((i) => <IdeaRow key={i.id} idea={i} model={model} team={team} />) : null}
        </>
      ) : null}
    </div>
  );
}

/** Articles already being written outside the plan, with where they fit. */
export function InProgressList({ items, model, audience, clientId }: { items: readonly InProgressItem[]; model: MapModel; audience: Audience; clientId?: string }) {
  if (!items.length) return null;
  const isTeam = audience === "team";
  const openDoc = useOpenAdminDoc();
  const name = (k: string) => model.T[k]?.name ?? k;
  return (
    <div data-testid="in-progress" style={st("display:flex;flex-direction:column;gap:8px")}>
      <div style={st(MONO_LABEL)}>In progress · {items.length}</div>
      {items.map((it) => {
        const href = isTeam && it.cmsId ? (it.kind === "brief" ? briefHref(it.cmsId, clientId) : `/admin/collections/blog-posts/${encodeURIComponent(it.cmsId)}`) : null;
        const p = it.placement;
        return (
          <div key={it.id} data-testid="in-progress-item" style={st("border:1px solid oklch(0.92 0.006 85);background:oklch(0.995 0.002 85);border-radius:11px;padding:12px;display:flex;flex-direction:column;gap:6px")}>
            <div style={st("display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.35")}>
              <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${p?.topic ? model.T[p.topic]?.c ?? MUTED : MUTED}`)} />
              {href ? <a href={href} className="ccm-hul" onClick={openDoc ? (e) => { e.preventDefault(); openDoc({ href, title: it.kind === "brief" ? "Brief" : "Article" }); } : undefined} style={st("font-weight:500;flex:1;color:inherit;text-decoration:none")}>{it.title}</a> : <span style={st("font-weight:500;flex:1")}>{it.title}</span>}
              <MonoTag>{it.kind}</MonoTag>
            </div>
            {p ? (isTeam
              ? <div style={st("font-size:12px;line-height:1.4;color:oklch(0.52 0.01 85);padding-left:16px")}>{placementLine(p, name)}</div>
              : p.topic ? <div style={st("font-size:12px;color:oklch(0.52 0.01 85);padding-left:16px")}>{name(p.topic)}</div> : null) : null}
            {isTeam && p?.warnings.length ? p.warnings.map((w, ix) => <div key={ix} style={st("font-size:12px;line-height:1.4;color:oklch(0.45 0.15 25);padding-left:16px")}>{w}</div>) : null}
          </div>
        );
      })}
    </div>
  );
}
