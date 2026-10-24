import { useState } from "react";
import { CITATION_ENGINE_LABELS, CITATION_ENGINES, type CitationsView, MAX_QUESTIONS_PER_TOPIC, type QuestionGroup, type TrackedQuestionView } from "@/lib/content-map/types";
import { formatDay, GREEN, type MapModel, MUTED } from "@/lib/content-map/view-model";
import type { Audience } from "./ContentMapShell";
import { DASHED, TrendLine } from "./living";
import { st } from "./st";
import { GHOST_BTN, LINK_BTN, MONO_LABEL } from "./ui";

interface Props {
  model: MapModel;
  citations: CitationsView | null;
  audience: Audience;
  width: number;
  onOpenNode: (nodeId: string) => void;
  /** Team only. */
  team?: {
    busy: boolean;
    error: string | null;
    onRun: () => void;
    onAdd: (topic: string, question: string) => void;
    onRemove: (id: string) => void;
  };
}

const TILE = "padding:10px;border-radius:8px;background:oklch(0.97 0.005 85);display:flex;flex-direction:column;gap:2px";
const TILE_NUM = "font:600 17px 'JetBrains Mono',monospace";
const TILE_LABEL = "font-size:11.5px;color:oklch(0.52 0.01 85)";
const BODY = "font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);text-wrap:pretty";
const MONO_MUTED = "font:10.5px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)";
const AMBER = "oklch(0.62 0.14 62)";
const CLIENT_INTRO = "We ask ChatGPT, Perplexity, Gemini and Google's AI Overviews the questions your buyers ask, and track whether they cite your site.";
const TEAM_INTRO = "The tracked questions, asked of each AI tool when you press Check AI citations (paid, about $0.018 a question). Green means the answer cites the client's site.";
const GROUP_TITLE: Record<QuestionGroup, string> = { existing: "Your published articles", planned: "Planned and suggested, by topic" };
const GROUP_INTRO: Record<Audience, Record<QuestionGroup, string>> = {
  team: {
    existing: "The question each published article answers. Are AI tools citing what's already written?",
    planned: "Questions for articles in the plan and approved suggestions, up to 2 per topic.",
  },
  client: {
    existing: "The question each of your published articles answers, and whether AI tools cite it.",
    planned: "Questions for the articles we're planning and the topics suggested.",
  },
};
/** "existing" rows: questions → which pre-split question sources a row may come from. */
const isExisting = (q: TrackedQuestionView) => q.group === "existing";

function Cell({ check, isClient }: { check: TrackedQuestionView["checks"][number] | undefined; isClient: boolean }) {
  const base = "border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:2px;min-height:38px;min-width:0;justify-content:center";
  if (!check || !check.ok) {
    return <div data-testid="cite-cell" data-state="none" style={st(`${base};${DASHED};font-size:11.5px;color:oklch(0.62 0.01 85)`)}>{check ? "Couldn't check" : "No data yet"}</div>;
  }
  const state = check.clientCited ? "cited" : check.clientMentioned ? "mentioned" : "not";
  const bg = state === "cited" ? "oklch(0.95 0.04 160)" : state === "mentioned" ? "oklch(0.96 0.035 75)" : "oklch(0.97 0.005 85)";
  const label = state === "cited" ? "You" : state === "mentioned" ? (isClient ? "Named, not linked" : "Mentioned, not cited") : "Not cited";
  const colour = state === "cited" ? GREEN : state === "mentioned" ? AMBER : "oklch(0.52 0.01 85)";
  return (
    <div data-testid="cite-cell" data-state={state} style={st(`${base};background:${bg}`)}>
      <span style={st(`font-size:11.5px;font-weight:${state === "not" ? 400 : 600};color:${colour}`)}>{label}</span>
      {check.citedDomains.length ? <span style={st(`${MONO_MUTED};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)} title={check.citedDomains.join(", ")}>{check.citedDomains.slice(0, 2).join(" · ")}</span> : null}
    </div>
  );
}

function AddQuestion({ topic, onAdd }: { topic: string; onAdd: (topic: string, q: string) => void }) {
  const [q, setQ] = useState("");
  const submit = () => { const v = q.trim(); if (!v) return; onAdd(topic, v); setQ(""); };
  return (
    <div style={st("display:flex;gap:8px;padding-left:16px")}>
      <input aria-label={`Add a question to ${topic}`} placeholder="Add a question buyers ask…" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} style={st(`${DASHED};border-radius:7px;background:#fff;padding:5px 9px;font:inherit;font-size:12.5px;color:inherit;flex:1;min-width:0`)} />
      <button type="button" disabled={!q.trim()} onClick={submit} style={st(`${GHOST_BTN};opacity:${q.trim() ? 1 : 0.6}`)}>Add question</button>
    </div>
  );
}

/** AI citations tab: tracked questions × AI tools, per-topic score, trend, and pages to improve. */
export function Citations({ model, citations, audience, width, onOpenNode, team }: Props) {
  const { T, topics } = model;
  const isClient = audience === "client";
  const cols = width < 1000 ? "minmax(0,1fr) 340px" : "minmax(0,1fr) 400px";
  const engines = citations?.engines.length ? citations.engines : [...CITATION_ENGINES];
  const grid = `minmax(220px,1fr) repeat(${engines.length},minmax(96px,150px))${team ? " 24px" : ""}`;
  const questions = citations?.questions ?? [];
  const groups = topics.filter((t) => !t.agg && t.k !== "core").map((t) => ({ t, list: questions.filter((q) => q.topic === t.k) })).filter((g) => g.list.length || team);
  const latest = citations?.trend[citations.trend.length - 1];
  const status = citations?.status === "running" ? "Checking AI tools… this takes a few minutes."
    : citations?.status === "failed" ? `Last check failed${citations.error ? `: ${citations.error}` : ""}` : "";
  const byNode = new Map(model.N.map((n) => [n.id, n]));

  return (
    <div style={st(`display:grid;grid-template-columns:${cols};min-height:0;height:100%`)}>
      <main style={st("min-width:0;min-height:0;overflow:auto;padding:16px 22px 24px;display:flex;flex-direction:column;gap:18px")}>
        <div style={st("display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px")}>
          <div style={st("font-size:15px;font-weight:600")}>{isClient ? "Is AI citing your site?" : "AI citations"}</div>
          <div style={st("font-size:12.5px;color:oklch(0.52 0.01 85);max-width:640px")}>{isClient ? CLIENT_INTRO : TEAM_INTRO}</div>
          <div style={st("flex:1")} />
          {team ? (
            <div style={st("display:flex;align-items:center;gap:10px")}>
              <span style={st(`font-size:12px;color:${team.error || citations?.status === "failed" ? "oklch(0.52 0.17 25)" : "oklch(0.52 0.01 85)"}`)}>{team.error ?? (status || (citations?.generatedAt ? `Last checked ${formatDay(citations.generatedAt)}` : ""))}</span>
              <button type="button" disabled={team.busy || citations?.status === "running"} onClick={team.onRun} style={st(`${GHOST_BTN};opacity:${team.busy || citations?.status === "running" ? 0.6 : 1}`)}>Check AI citations</button>
            </div>
          ) : status && citations?.status === "running" ? <span style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>Checking again now…</span> : null}
        </div>

        {!questions.length && !team ? <div style={st(`${BODY};padding:20px 4px`)}>We haven&apos;t checked AI tools yet. Results appear here after the first check.</div> : null}

        {(["existing", "planned"] as const).map((g) => {
          const inGroup = questions.filter((q) => q.group === g);
          const sum = citations?.groups?.[g];
          const topicGroups = groups
            .map(({ t }) => ({ t, list: inGroup.filter((q) => q.topic === t.k) }))
            .filter((x) => x.list.length || (team && g === "planned"));
          if (!inGroup.length && !(team && g === "planned")) return null;
          return (
            <section key={g} data-testid={`citations-group-${g}`} style={st("display:flex;flex-direction:column;gap:6px")}>
              <div style={st("display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px;padding-top:4px;border-top:1px solid oklch(0.92 0.006 85)")}>
                <span style={st("font-size:14px;font-weight:600;padding-top:10px")}>{GROUP_TITLE[g]} · {inGroup.length}</span>
                <span style={st("font-size:12px;color:oklch(0.52 0.01 85)")}>{GROUP_INTRO[audience][g]}</span>
                <div style={st("flex:1")} />
                {sum && sum.checks ? <span style={st(MONO_MUTED)}>cited in <span style={st(`font-weight:600;color:${sum.cited ? GREEN : "oklch(0.52 0.17 25)"}`)}>{sum.cited}</span> of {sum.checks} answers</span> : null}
              </div>
              <div data-testid={g === "planned" ? "citations-grid" : "citations-grid-existing"} style={st(`display:grid;grid-template-columns:${grid};gap:4px;align-items:stretch;min-width:720px`)}>
                <div />
                {engines.map((e) => <div key={e} style={st(`${MONO_LABEL};padding:0 2px 4px;align-self:end`)}>{CITATION_ENGINE_LABELS[e]}</div>)}
                {team ? <div /> : null}
                {topicGroups.map(({ t, list }) => {
                  const cited = list.reduce((n, q) => n + q.checks.filter((c) => c.ok && c.clientCited).length, 0);
                  const checks = list.reduce((n, q) => n + q.checks.filter((c) => c.ok).length, 0);
                  return [
                    <div key={`h-${g}-${t.k}`} style={st("grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:10px 0 2px")}>
                      <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;background:${t.c}`)} />
                      <span style={st("font-size:13px;font-weight:600")}>{t.name}</span>
                      <div style={st("flex:1")} />
                      {checks ? <span style={st(MONO_MUTED)}>cited in <span style={st(`font-weight:600;color:${cited ? GREEN : "oklch(0.52 0.17 25)"}`)}>{cited}</span> of {checks} answers</span> : null}
                    </div>,
                    ...list.flatMap((q) => [
                      <div key={`q-${q.id}`} style={st("font-size:12.5px;line-height:1.35;padding:4px 8px 4px 16px;display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0")}>
                        <span>{q.question}</span>
                        {isExisting(q) && q.pageTitle ? (
                          q.pageUrl
                            ? <a href={q.pageUrl} target="_blank" rel="noopener" title={q.pageUrl} style={st("font-size:11.5px;color:oklch(0.52 0.01 85);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>Article: {q.pageTitle} ↗</a>
                            : q.pageId
                              ? <button type="button" onClick={() => onOpenNode(q.pageId as string)} style={st(`${LINK_BTN};font-size:11.5px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`)}>Article: {q.pageTitle}</button>
                              : <span style={st("font-size:11.5px;color:oklch(0.52 0.01 85)")}>Article: {q.pageTitle}</span>
                        ) : null}
                      </div>,
                      ...engines.map((e) => <Cell key={`${q.id}-${e}`} check={q.checks.find((c) => c.engine === e)} isClient={isClient} />),
                      ...(team ? [<button type="button" key={`x-${q.id}`} aria-label={`Remove question: ${q.question}`} title="Stop tracking this question" onClick={() => team.onRemove(q.id)} style={st("border:0;background:none;cursor:pointer;color:oklch(0.62 0.01 85);font-size:15px;padding:0")}>×</button>] : []),
                    ]),
                    ...(team && g === "planned" && list.length < MAX_QUESTIONS_PER_TOPIC ? [<div key={`a-${t.k}`} style={st("grid-column:1/-1")}><AddQuestion topic={t.k} onAdd={team.onAdd} /></div>] : []),
                  ];
                })}
              </div>
            </section>
          );
        })}

        <div style={st(`display:flex;flex-wrap:wrap;gap:16px;${"font-size:12px;color:oklch(0.52 0.01 85)"}`)}>
          <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:12px;height:12px;border-radius:3px;background:oklch(0.95 0.04 160)")} />{isClient ? "Cites your site" : "Cites the client"}</span>
          <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:12px;height:12px;border-radius:3px;background:oklch(0.96 0.035 75)")} />Names {isClient ? "you" : "the brand"} without a link</span>
          <span style={st("display:flex;align-items:center;gap:6px")}><span style={st("width:12px;height:12px;border-radius:3px;background:oklch(0.97 0.005 85)")} />Cites other sites</span>
          <span style={st("display:flex;align-items:center;gap:6px")}><span style={st(`width:12px;height:12px;border-radius:3px;box-sizing:border-box;${DASHED}`)} />No answer</span>
        </div>

        {citations?.refresh.length ? (
          <div style={st("display:flex;flex-direction:column;gap:8px")}>
            <div style={st(MONO_LABEL)}>Improve existing articles · {citations.refresh.length}</div>
            {citations.refresh.map((r) => {
              const n = byNode.get(r.nodeId);
              return (
                <div key={r.id} data-testid="refresh-item" style={st("border:1px solid oklch(0.92 0.006 85);background:oklch(0.995 0.002 85);border-radius:11px;padding:12px;display:flex;flex-direction:column;gap:7px")}>
                  <button type="button" className="ccm-hul" onClick={() => onOpenNode(r.nodeId)} style={st(`${LINK_BTN};display:flex;align-items:flex-start;gap:8px;font-size:13px;font-weight:500;padding:0`)}>
                    <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${T[r.topic]?.c ?? MUTED}`)} />
                    <span>{n?.title ?? r.nodeId}</span>
                  </button>
                  <div style={st("font-size:12px;line-height:1.4;color:oklch(0.4 0.01 85);padding-left:16px")}>{r.question}</div>
                  <div style={st("font-size:12px;line-height:1.4;color:oklch(0.52 0.01 85);padding-left:16px")}>{r.why}</div>
                  {r.missing.length ? (
                    <div style={st("display:flex;flex-wrap:wrap;gap:6px;padding-left:16px")}>
                      <span style={st(`${MONO_LABEL};align-self:center`)}>Missing</span>
                      {r.missing.map((m) => <span key={m} style={st(`font-size:11.5px;padding:2px 7px;border-radius:5px;${DASHED}`)}>{m}</span>)}
                    </div>
                  ) : null}
                  {r.sources.length ? (
                    <div style={st("display:flex;flex-wrap:wrap;gap:4px 12px;padding-left:16px")}>
                      {r.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener" title={s.title} style={st(`${MONO_MUTED};color:oklch(0.45 0.01 85)`)}>{s.domain} ↗</a>)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </main>

      <aside style={st("border-left:1px solid oklch(0.9 0.006 85);overflow:auto;background:oklch(0.995 0.002 85)")}>
        <div style={st("padding:22px;display:flex;flex-direction:column;gap:22px")}>
          <div style={st("display:flex;flex-direction:column;gap:8px")}>
            <div style={st(MONO_LABEL)}>Latest check{citations?.generatedAt ? ` · ${formatDay(citations.generatedAt)}` : ""}</div>
            <div style={st("display:grid;grid-template-columns:repeat(2,1fr);gap:8px")}>
              <div style={st(TILE)}><span style={st(`${TILE_NUM};color:${GREEN}`)}>{latest?.cited ?? 0}<span style={st("font-size:12px;color:oklch(0.52 0.01 85);font-weight:500")}> / {latest?.checks ?? 0}</span></span><span style={st(TILE_LABEL)}>{isClient ? "answers citing your site" : "answers citing the client"}</span></div>
              <div style={st(TILE)}><span style={st(TILE_NUM)}>{questions.length}</span><span style={st(TILE_LABEL)}>questions tracked</span></div>
            </div>
            {citations?.groups && (citations.groups.existing.questions || citations.groups.planned.questions) ? (
              <div style={st("display:flex;flex-direction:column;gap:4px;font-size:12px;color:oklch(0.52 0.01 85)")}>
                {(["existing", "planned"] as const).map((g) => {
                  const v = citations.groups[g];
                  return (
                    <div key={g} style={st("display:flex;gap:8px")}>
                      <span style={st("flex:1")}>{GROUP_TITLE[g]} ({v.questions})</span>
                      <span style={st("font-family:'JetBrains Mono',monospace")}><span style={st(`font-weight:600;color:${v.cited ? GREEN : "oklch(0.52 0.17 25)"}`)}>{v.cited}</span> / {v.checks}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          {citations?.trend.length ? (
            <div style={st("display:flex;flex-direction:column;gap:8px")}>
              <div style={st(MONO_LABEL)}>Cited answers over time</div>
              <TrendLine trend={citations.trend} />
            </div>
          ) : null}
          {citations?.topDomains.length ? (
            <div style={st("display:flex;flex-direction:column;gap:6px")}>
              <div style={st(MONO_LABEL)}>Sites AI tools cite most</div>
              {(() => {
                const mx = Math.max(1, ...citations.topDomains.map((d) => d.count));
                return citations.topDomains.slice(0, 10).map((d) => (
                  <div key={d.domain} style={st("display:flex;align-items:center;gap:8px;font-size:12.5px")}>
                    <span style={st("width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'JetBrains Mono',monospace;font-size:11.5px")}>{d.domain}</span>
                    <div style={st("flex:1;height:6px;border-radius:3px;background:oklch(0.94 0.005 85);overflow:hidden")}><div style={st(`height:100%;width:${(d.count / mx) * 100}%;background:oklch(0.7 0.012 85)`)} /></div>
                    <span style={st("width:30px;text-align:right;font:12px 'JetBrains Mono',monospace")}>{d.count}</span>
                  </div>
                ));
              })()}
            </div>
          ) : null}
          <div style={st(BODY)}>{isClient
            ? "When an AI tool cites a site, it's sending its readers there. The articles we plan answer these questions better than the sites cited today."
            : "One question per published article, then up to 2 per topic for planned articles and suggestions. Only checked when you press Check AI citations, so nothing is spent in the background. Gaps become plan items (From AI citations) and refresh tasks."}</div>
        </div>
      </aside>
    </div>
  );
}
