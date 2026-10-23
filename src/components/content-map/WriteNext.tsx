import type { ResearchView, SnapshotRecommendation } from "@/lib/content-map/types";
import { BLUE, fmtCount, type MapModel, MUTED, type PlanLike, RED } from "@/lib/content-map/view-model";
import { OriginTag, PlanEvidence, ReasonChips } from "./living";
import { EvidenceLines } from "./research";
import { st } from "./st";
import { DARK_BTN, GHOST_BTN, LINK_BTN, MONO_LABEL, MonoTag } from "./ui";

interface Props {
  model: MapModel;
  recs: PlanLike[];
  selected: string | null;
  sent: Readonly<Record<string, string>>;
  sending: string | null;
  sendError: string | null;
  width: number;
  onSelect: (id: string) => void;
  onSend: (id: string) => void;
  onOpenNode: (nodeId: string) => void;
  /** Who wrote the ideas, and the "write with AI" control while GT has no LLM. */
  ideas?: { by: string | null; template: boolean; pending: boolean; busy: boolean; error: string | null; onWrite: () => void };
  /** Client view: shows the plan without the Blog Prompter controls. */
  readOnly?: boolean;
  /** Suggestions block above the plan (team review / the client's own). */
  top?: React.ReactNode;
  /** Research: evidence for plan items that came from it. */
  research?: ResearchView | null;
  /** Below the plan: the Research list and In progress. */
  bottom?: React.ReactNode;
}

const PRIORITY_COLOUR: Record<SnapshotRecommendation["priority"], string> = { high: RED, medium: "oklch(0.62 0.14 62)", low: MUTED };

function Section({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={st("display:flex;flex-direction:column;gap:4px")}>
      <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>{label}</div>
      {items.map((x, ix) => <div key={ix} style={st("font-size:12.5px;line-height:1.4")}>{x}</div>)}
    </div>
  );
}

/** Write next tab: recommendations grouped by topic, with the selected brief on the right. */
export function WriteNext({ model, recs, selected, sent, sending, sendError, width, onSelect, onSend, onOpenNode, ideas, readOnly = false, top, research, bottom }: Props) {
  const { T, N, topics } = model;
  const cols = width < 1000 ? "minmax(0,1fr) 340px" : "minmax(0,1fr) 400px";
  const rec = recs.find((r) => r.id === selected) ?? recs[0];
  const byId = new Map(N.map((n) => [n.id, n]));
  const groups = topics.map((t) => ({ t, list: recs.filter((r) => r.topic === t.k) })).filter((g) => g.list.length);
  const sentId = rec ? sent[rec.id] : undefined;
  const nodeLinks = (label: string, ids: string[]) => {
    if (!ids.length) return null;
    return (
      <div style={st("display:flex;flex-direction:column;gap:4px")}>
        <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>{label} · {ids.length}</div>
        {ids.map((id) => {
          const n = byId.get(id);
          return (
            <button type="button" key={id} className="ccm-hul" onClick={() => onOpenNode(id)} style={st(`${LINK_BTN};display:flex;align-items:flex-start;gap:8px`)}>
              <span style={st(`width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;background:${T[n?.g ?? ""]?.c ?? MUTED}`)} />
              <span style={st("flex:1")}>{n?.title ?? id}</span>
            </button>
          );
        })}
      </div>
    );
  };
  return (
    <div style={st(`display:grid;grid-template-columns:${cols};min-height:0;height:100%`)}>
      <main style={st("min-width:0;min-height:0;overflow:auto;padding:16px 22px 24px;display:flex;flex-direction:column;gap:14px")}>
        <div style={st("display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px")}>
          <div style={st("font-size:15px;font-weight:600")}>{readOnly ? "Articles we're planning" : "What to write next"}</div>
          <div style={st("font-size:12.5px;color:oklch(0.52 0.01 85)")}>New articles that answer questions no page covers yet, grouped by topic.</div>
          <div style={st("flex:1")} />
          {ideas ? (
            <div style={st("display:flex;align-items:center;gap:10px")}>
              <span style={st(`font-size:12px;color:${ideas.error ? RED : "oklch(0.52 0.01 85)"}`)}>
                {ideas.error ?? (ideas.busy || (ideas.template && ideas.pending) ? "Writing ideas with AI…" : ideas.by ? `Ideas by ${ideas.by}` : ideas.template ? "Template ideas" : "")}
              </span>
              <button type="button" disabled={ideas.busy} onClick={ideas.onWrite} style={st(`${GHOST_BTN};opacity:${ideas.busy ? 0.6 : 1}`)}>{ideas.by || !ideas.template ? "Rewrite ideas" : "Write ideas with AI"}</button>
            </div>
          ) : null}
        </div>
        {top}
        {!recs.length ? <div style={st("font-size:13px;color:oklch(0.52 0.01 85);padding:20px 4px")}>No recommendations in this analysis.</div> : null}
        {groups.map(({ t, list }) => (
          <div key={t.k} style={st("display:flex;flex-direction:column;gap:8px")}>
            <div style={st(`${MONO_LABEL};display:flex;align-items:center;gap:8px`)}><span style={st(`width:8px;height:8px;border-radius:50%;background:${t.c}`)} />{t.name} · {list.length}</div>
            {list.map((r) => {
              const on = rec?.id === r.id;
              return (
                <div key={r.id} data-testid="rec-card" onClick={() => onSelect(r.id)} style={st(`border-radius:11px;padding:12px;display:flex;flex-direction:column;gap:7px;cursor:pointer;background:${on ? "oklch(0.97 0.012 258)" : sent[r.id] ? "oklch(0.975 0.004 85)" : "oklch(0.995 0.002 85)"};border:1px solid ${on ? BLUE : "oklch(0.92 0.006 85)"}`)}>
                  <div style={st("display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.35")}>
                    <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${t.c}`)} />
                    <span style={st("font-weight:500;flex:1")}>{r.title}</span>
                    {sent[r.id] ? <MonoTag>{readOnly ? "in progress" : "sent"}</MonoTag> : null}
                  </div>
                  <div style={st("font-size:12px;line-height:1.4;color:oklch(0.4 0.01 85);padding-left:16px")}>{r.question}</div>
                  {r.reasons?.length ? <div style={st("padding-left:16px")}><ReasonChips reasons={r.reasons} hideDomains={readOnly} /></div> : null}
                  <div style={st("display:flex;align-items:center;gap:8px;padding-left:16px")}>
                    <span style={st(`font:11px 'JetBrains Mono',monospace;color:${PRIORITY_COLOUR[r.priority]}`)}>{r.priority}</span>
                    {r.origin ? <OriginTag origin={r.origin} audience={readOnly ? "client" : "team"} /> : null}
                    {r.origin === "research" && r.volume ? <span data-testid="rec-volume" style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)")}>{fmtCount(r.volume)} searches/mo</span> : null}
                    {r.overlaps.map((k) => T[k] ? (
                      <span key={k} style={st("display:flex;align-items:center;gap:4px;font-size:11.5px;color:oklch(0.52 0.01 85)")}><span style={st(`width:7px;height:7px;border-radius:50%;background:${T[k]?.c}`)} />{T[k]?.name}</span>
                    ) : null)}
                    <div style={st("flex:1")} />
                    <div style={st("width:60px;height:4px;border-radius:2px;background:oklch(0.92 0.006 85);overflow:hidden")}><div style={st(`height:100%;width:${Math.round(r.score * 100)}%;background:oklch(0.55 0.15 258)`)} /></div>
                    <span style={st("font:11px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85);width:30px;text-align:right")}>{Math.round(r.score * 100)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {bottom}
      </main>
      <aside style={st("border-left:1px solid oklch(0.9 0.006 85);overflow:auto;background:oklch(0.995 0.002 85)")}>
        {rec ? (
          <div style={st("padding:22px;display:flex;flex-direction:column;gap:20px")}>
            <div style={st("display:flex;flex-direction:column;gap:8px")}>
              <div style={st("display:flex;align-items:center;gap:6px;font-size:12px;color:oklch(0.52 0.01 85)")}><span style={st(`width:8px;height:8px;border-radius:50%;background:${T[rec.topic]?.c ?? MUTED}`)} />{T[rec.topic]?.name ?? rec.topic}</div>
              <div style={st("font-size:17px;font-weight:600;line-height:1.3;text-wrap:pretty")}>{rec.title}</div>
              <div style={st("font-size:13px;line-height:1.5;text-wrap:pretty")}>{rec.question}</div>
              <div style={st("font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);text-wrap:pretty")}>{rec.why}</div>
              <div style={st("display:flex;align-items:center;gap:10px;padding-top:4px")}>
                {readOnly ? (
                  <span style={st(`font-size:12px;font-weight:500;color:${sentId ? "oklch(0.55 0.13 160)" : "oklch(0.52 0.01 85)"}`)}>{sentId ? "In progress" : "Planned"}</span>
                ) : sentId ? (
                  <span style={st("font-size:12px;font-weight:500;color:oklch(0.55 0.13 160)")}>Sent · <a href={`/admin/collections/blog-prompts/${sentId}`}>Open brief</a></span>
                ) : (
                  <button type="button" disabled={sending === rec.id} onClick={() => onSend(rec.id)} style={st(`${DARK_BTN};opacity:${sending === rec.id ? 0.6 : 1}`)}>{sending === rec.id ? "Sending…" : "Send to Blog Prompter"}</button>
                )}
                {sendError ? <span style={st("font-size:12px;color:oklch(0.52 0.17 25)")}>{sendError}</span> : null}
              </div>
            </div>
            {rec.geo.answerFirst ? (
              <div style={st("display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:10px;background:oklch(0.97 0.005 85)")}>
                <div style={st(MONO_LABEL)}>Answer first</div>
                <div style={st("font-size:12.5px;line-height:1.45")}>{rec.geo.answerFirst}</div>
              </div>
            ) : null}
            {rec.reasons?.length ? (
              <div style={st("display:flex;flex-direction:column;gap:6px")}>
                <div style={st(`${MONO_LABEL};display:flex;align-items:center;gap:8px`)}>Why this article{rec.origin ? <OriginTag origin={rec.origin} audience={readOnly ? "client" : "team"} /> : null}</div>
                <ReasonChips reasons={rec.reasons} hideDomains={readOnly} />
              </div>
            ) : null}
            {rec.researchId ? <EvidenceLines evidence={research?.ideas.find((i) => i.id === rec.researchId)?.evidence ?? []} team={!readOnly} /> : null}
            <PlanEvidence rec={rec} />
            <Section label="Outline" items={rec.outline} />
            <Section label="Entities" items={rec.geo.entities} />
            <Section label="FAQs" items={rec.geo.faqs} />
            <Section label="Evidence" items={rec.geo.evidence} />
            <Section label="Schema" items={rec.geo.schema} />
            {nodeLinks("→ Links to", rec.linksTo)}
            {nodeLinks("← Linked from", rec.linksFrom)}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
