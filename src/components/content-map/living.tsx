import { useState } from "react";
import { CITATION_ENGINE_LABELS, type CitationsView, type PlacementResult, type PlanOrigin, type PlanReason, type SuggestionKind, type SuggestionView, type TopicAuthorityInput } from "@/lib/content-map/types";
import { formatDay, GREEN, type MapModel, MUTED, type PlanLike, RED } from "@/lib/content-map/view-model";
import type { Audience } from "./ContentMapShell";
import { PlacementView } from "./research";
import { st } from "./st";
import { DARK_BTN, GAP_ITEM, GHOST_BTN, MONO_LABEL, MonoTag } from "./ui";

/** Draft/proposed outline, the same dashed look the draft nodes use. */
export const DASHED = "border:1px dashed oklch(0.75 0.01 85)";
const CHIP = "font-size:11.5px;line-height:1.3;padding:2px 7px;border-radius:5px;background:oklch(0.94 0.006 85);color:oklch(0.4 0.01 85)";
const MONO_MUTED = "font:10.5px 'JetBrains Mono',monospace;color:oklch(0.52 0.01 85)";
const FIELD = "border:1px solid oklch(0.88 0.006 85);background:#fff;border-radius:7px;padding:7px 9px;font:inherit;font-size:13px;color:inherit;width:100%;box-sizing:border-box";

export function originLabel(origin: PlanOrigin | undefined, audience: Audience): string {
  if (origin === "ai-citations") return "From AI citations";
  if (origin === "research") return "From research";
  if (origin === "team") return "Suggested by the team";
  if (origin === "client") return audience === "client" ? "Suggested by you" : "Suggested by the client";
  return "AI idea";
}

/** Small origin tag next to a plan card's priority. */
export function OriginTag({ origin, audience }: { origin: PlanOrigin | undefined; audience: Audience }) {
  return <span data-testid="origin-tag"><MonoTag>{originLabel(origin, audience)}</MonoTag></span>;
}

/** Why an article is in the plan: one chip per reason, engines or domains in a muted mono line. */
export function ReasonChips({ reasons, hideDomains = false }: { reasons: readonly PlanReason[] | undefined; /** Client view: never competitor sites. */ hideDomains?: boolean }) {
  // The origin tag already says who suggested it.
  const list = (reasons ?? []).filter((r) => r.kind !== "suggested");
  if (!list.length) return null;
  return (
    <div style={st("display:flex;flex-wrap:wrap;gap:6px")}>
      {list.map((r, ix) => {
        const extra = r.engines?.length ? r.engines.map((e) => CITATION_ENGINE_LABELS[e]).join(" · ") : r.domains?.length && !hideDomains ? r.domains.join(" · ") : "";
        return (
          <span key={ix} data-testid="reason-chip" style={st("display:flex;flex-direction:column;gap:2px")}>
            <span style={st(CHIP)}>{r.text}</span>
            {extra ? <span style={st(`${MONO_MUTED};padding-left:2px`)}>{extra}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

/** Brief panel: what AI tools cite today, what to cover and how to beat them. */
export function PlanEvidence({ rec }: { rec: PlanLike }) {
  return (
    <>
      {rec.sources?.length ? (
        <div style={st("display:flex;flex-direction:column;gap:6px")}>
          <div style={st(`${MONO_LABEL};padding-bottom:2px`)}>What AI tools cite today · {rec.sources.length}</div>
          {rec.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener" className="ccm-hul" style={st("display:flex;flex-direction:column;gap:1px;text-decoration:none;font-size:12.5px;line-height:1.35")}>
              <span>{s.title || s.url}</span>
              <span style={st(MONO_MUTED)}>{s.domain}</span>
            </a>
          ))}
        </div>
      ) : null}
      <ListSection label="Cover" items={rec.cover ?? []} />
      <ListSection label="Do better than them" items={rec.beat ?? []} />
    </>
  );
}

function ListSection({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={st("display:flex;flex-direction:column;gap:4px")}>
      <div style={st(`${MONO_LABEL};padding-bottom:4px`)}>{label}</div>
      {items.map((x, ix) => <div key={ix} style={st("font-size:12.5px;line-height:1.4")}>{x}</div>)}
    </div>
  );
}

const KINDS: Array<[SuggestionKind, string]> = [["topic", "New topic"], ["bridge", "Connect two topics"], ["article", "Article idea"]];
export interface SuggestDraft { kind: SuggestionKind; title: string; why: string; topic?: string; topicB?: string }

/** The Suggest form, shown in the right-hand aside. */
export type PlacementCheck = (d: { title: string; why: string; topic?: string }) => Promise<{ ok: true; result: PlacementResult } | { ok: false; error: string }>;

export function SuggestForm({ authorities, audience, busy, error, onSubmit, onClose, onCheck, model }: {
  /** "Check fit": where the AI would place it, before sending. */
  onCheck?: PlacementCheck;
  model?: MapModel;
  authorities: readonly TopicAuthorityInput[];
  audience: Audience;
  busy: boolean;
  error: string | null;
  onSubmit: (d: SuggestDraft) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<SuggestionKind>("article");
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [topic, setTopic] = useState(authorities[0]?.key ?? "");
  const [topicB, setTopicB] = useState(authorities[1]?.key ?? "");
  const [check, setCheck] = useState<{ busy: boolean; result: PlacementResult | null; error: string | null }>({ busy: false, result: null, error: null });
  const isClient = audience === "client";
  const runCheck = async () => {
    if (!onCheck || title.trim().length < 3) return;
    setCheck({ busy: true, result: null, error: null });
    const res = await onCheck({ title: title.trim(), why: why.trim(), ...(kind === "article" && topic ? { topic } : {}) });
    setCheck(res.ok ? { busy: false, result: res.result, error: null } : { busy: false, result: null, error: /429/.test(res.error) ? "Too many checks for now. Please try again tomorrow." : res.error });
  };
  const needTopic = kind !== "topic";
  const ready = title.trim().length >= 3 && why.trim().length > 0 && (!needTopic || !!topic) && (kind !== "bridge" || (!!topicB && topicB !== topic));
  const select = (value: string, set: (v: string) => void, label: string) => (
    <label style={st("display:flex;flex-direction:column;gap:5px")}>
      <span style={st(MONO_LABEL)}>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => set(e.target.value)} style={st(FIELD)}>
        {authorities.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
      </select>
    </label>
  );
  const shownError = error && /429/.test(error) ? "Too many suggestions for now. Please try again tomorrow." : error;
  return (
    <form
      data-testid="suggest-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || busy) return;
        onSubmit({ kind, title: title.trim(), why: why.trim(), ...(needTopic ? { topic } : {}), ...(kind === "bridge" ? { topicB } : {}) });
      }}
      style={st("padding:22px;display:flex;flex-direction:column;gap:16px")}
    >
      <div style={st("display:flex;align-items:flex-start;gap:10px")}>
        <div style={st("display:flex;flex-direction:column;gap:6px;flex:1")}>
          <div style={st("font-size:17px;font-weight:600")}>{isClient ? "Suggest an idea" : "Suggest"}</div>
          <div style={st("font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85);text-wrap:pretty")}>
            {isClient ? "Tell us what your buyers ask about. We review every suggestion and add the good ones to the plan." : "Suggestions start as waiting for review and show dashed on the map until approved."}
          </div>
        </div>
        <button type="button" onClick={onClose} style={st(GHOST_BTN)}>Close</button>
      </div>
      <div role="radiogroup" aria-label="Kind" style={st("display:flex;gap:2px;padding:3px;border-radius:10px;background:oklch(0.94 0.006 85)")}>
        {KINDS.map(([k, label]) => (
          <button type="button" role="radio" aria-checked={kind === k} key={k} onClick={() => setKind(k)} style={st(`flex:1;border:0;cursor:pointer;padding:6px 8px;border-radius:7px;font-size:12px;font-weight:500;white-space:nowrap;background:${kind === k ? "#fff" : "transparent"};box-shadow:${kind === k ? "0 1px 2px rgba(0,0,0,.08)" : "none"}`)}>{label}</button>
        ))}
      </div>
      <label style={st("display:flex;flex-direction:column;gap:5px")}>
        <span style={st(MONO_LABEL)}>{kind === "topic" ? "Topic name" : kind === "bridge" ? "What connects them" : "Article title"}</span>
        <input aria-label="Title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} style={st(FIELD)} />
      </label>
      {kind === "article" ? select(topic, setTopic, "Topic") : null}
      {kind === "bridge" ? <>{select(topic, setTopic, "First topic")}{select(topicB, setTopicB, "Second topic")}</> : null}
      <label style={st("display:flex;flex-direction:column;gap:5px")}>
        <span style={st(MONO_LABEL)}>Why · required</span>
        <textarea aria-label="Why" value={why} maxLength={600} rows={4} onChange={(e) => setWhy(e.target.value)} style={st(`${FIELD};resize:vertical;line-height:1.45`)} />
      </label>
      <div style={st("display:flex;align-items:center;gap:10px")}>
        {onCheck && kind !== "bridge" ? <button type="button" disabled={title.trim().length < 3 || check.busy} onClick={() => void runCheck()} style={st(`${GHOST_BTN};opacity:${title.trim().length < 3 || check.busy ? 0.5 : 1}`)}>{check.busy ? "Checking…" : "Check fit"}</button> : null}
        <button type="submit" disabled={!ready || busy} style={st(`${DARK_BTN};opacity:${!ready || busy ? 0.5 : 1}`)}>{busy ? "Sending…" : "Send suggestion"}</button>
        {shownError ? <span role="alert" style={st(`font-size:12px;color:${RED}`)}>{shownError}</span> : null}
      </div>
      {check.error ? <span data-testid="check-error" style={st(`font-size:12px;color:${RED}`)}>{check.error}</span> : null}
      {check.result ? (
        <div data-testid="check-result" style={st(`${DASHED};border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px`)}>
          <div style={st(MONO_LABEL)}>Where it would sit</div>
          {model ? <PlacementView p={check.result} model={model} /> : <div style={st("font-size:13px")}>{check.result.why}</div>}
        </div>
      ) : null}
    </form>
  );
}

function kindLabel(s: SuggestionView, model: MapModel): string {
  if (s.kind === "topic") return "New topic";
  if (s.kind === "bridge") return `Connect ${model.T[s.topic ?? ""]?.name ?? s.topic} and ${model.T[s.topicB ?? ""]?.name ?? s.topicB}`;
  return `Article · ${model.T[s.topic ?? ""]?.name ?? s.topic ?? ""}`;
}

/** Team: pending suggestions with Approve / Dismiss (optional reason). */
export function TeamSuggestions({ model, suggestions, busy, error, onDecide }: {
  model: MapModel;
  suggestions: readonly SuggestionView[];
  busy: string | null;
  error: string | null;
  onDecide: (id: string, decision: "approve" | "dismiss", reason?: string) => void;
}) {
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const pending = suggestions.filter((s) => s.status === "pending");
  if (!pending.length) return null;
  return (
    <div data-testid="team-suggestions" style={st("display:flex;flex-direction:column;gap:8px")}>
      <div style={st(MONO_LABEL)}>Suggestions · {pending.length}</div>
      {pending.map((s) => (
        <div key={s.id} style={st(`${DASHED};border-radius:11px;padding:12px;display:flex;flex-direction:column;gap:7px;background:oklch(0.995 0.002 85)`)}>
          <div style={st("display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.35")}>
            <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;box-sizing:border-box;border:1.5px dashed ${model.T[s.topic ?? ""]?.c ?? MUTED}`)} />
            <span style={st("font-weight:500;flex:1")}>{s.title}</span>
            <MonoTag>{s.origin === "client" ? "from the client" : s.origin === "ai" ? "AI" : s.suggestedBy}</MonoTag>
          </div>
          <div style={st("font-size:12px;line-height:1.4;color:oklch(0.4 0.01 85);padding-left:16px")}>{s.why}</div>
          <div style={st(`${MONO_MUTED};padding-left:16px`)}>{kindLabel(s, model)} · {formatDay(s.createdAt)}</div>
          {dismissing === s.id ? (
            <div style={st("display:flex;gap:8px;padding-left:16px")}>
              <input aria-label="Reason" placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} style={st(`${FIELD};padding:5px 8px;font-size:12px`)} />
              <button type="button" disabled={busy === s.id} onClick={() => { onDecide(s.id, "dismiss", reason.trim() || undefined); setDismissing(null); setReason(""); }} style={st(GHOST_BTN)}>Dismiss</button>
              <button type="button" onClick={() => setDismissing(null)} style={st(GHOST_BTN)}>Cancel</button>
            </div>
          ) : (
            <div style={st("display:flex;align-items:center;gap:8px;padding-left:16px")}>
              <button type="button" disabled={busy === s.id} onClick={() => onDecide(s.id, "approve")} style={st(`${DARK_BTN};opacity:${busy === s.id ? 0.6 : 1}`)}>{busy === s.id ? "Working…" : "Approve"}</button>
              <button type="button" disabled={busy === s.id} onClick={() => { setDismissing(s.id); setReason(""); }} style={st(GHOST_BTN)}>Dismiss</button>
            </div>
          )}
        </div>
      ))}
      {error ? <div style={st(`font-size:12px;color:${RED}`)}>{error}</div> : null}
    </div>
  );
}

const CLIENT_STATUS: Record<SuggestionView["status"], [string, string]> = {
  pending: ["Waiting for review", "oklch(0.52 0.01 85)"],
  approved: ["Added to the plan", GREEN],
  dismissed: ["Not now", "oklch(0.62 0.14 62)"],
};

/** Client: their own suggestions and where each one stands. */
export function ClientSuggestions({ model, suggestions, onSuggest }: { model: MapModel; suggestions: readonly SuggestionView[]; onSuggest: () => void }) {
  const mine = suggestions.filter((s) => s.origin === "client");
  return (
    <div data-testid="client-suggestions" style={st("display:flex;flex-direction:column;gap:8px")}>
      <div style={st(MONO_LABEL)}>Your suggestions · {mine.length}</div>
      {!mine.length ? (
        <div style={st("font-size:13px;line-height:1.5;color:oklch(0.52 0.01 85)")}>Know a question your buyers ask? <button type="button" className="ccm-hul" onClick={onSuggest} style={st("border:0;background:none;padding:0;cursor:pointer;font-size:13px;color:oklch(0.24 0.012 85);text-decoration:underline")}>Suggest it</button> and we&apos;ll review it.</div>
      ) : null}
      {mine.map((s) => {
        const [label, colour] = CLIENT_STATUS[s.status];
        return (
          <div key={s.id} style={st(`${GAP_ITEM};cursor:default;align-items:flex-start;${s.status === "approved" ? "" : DASHED}`)}>
            <span style={st(`width:8px;height:8px;border-radius:50%;flex:none;margin-top:5px;background:${model.T[s.topic ?? ""]?.c ?? MUTED}`)} />
            <span style={st("display:flex;flex-direction:column;gap:3px;flex:1")}>
              <span style={st("line-height:1.35")}>{s.title}</span>
              <span style={st("font-size:12px;line-height:1.4;color:oklch(0.52 0.01 85)")}>{s.why}</span>
            </span>
            <span style={st(`font-size:11.5px;font-weight:500;white-space:nowrap;color:${colour}`)}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Cited / checks across runs, as a small line in the design's style. */
export function TrendLine({ trend, width = 356, height = 70 }: { trend: CitationsView["trend"]; width?: number; height?: number }) {
  if (!trend.length) return null;
  const pts = trend.map((t, ix) => {
    const x = trend.length === 1 ? width / 2 : 8 + (ix / (trend.length - 1)) * (width - 16);
    const v = t.checks ? t.cited / t.checks : 0;
    return { x, y: height - 14 - v * (height - 24), t, v };
  });
  const last = pts[pts.length - 1];
  return (
    <div data-testid="citation-trend" style={st("display:flex;flex-direction:column;gap:4px")}>
      <svg viewBox={`0 0 ${width} ${height}`} style={st("width:100%;height:auto;display:block")}>
        <line x1="0" x2={width} y1={height - 14} y2={height - 14} style={st("stroke:oklch(0.92 0.006 85);stroke-width:1")} />
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} style={st(`fill:none;stroke:${GREEN};stroke-width:2;stroke-linejoin:round;stroke-linecap:round`)} />
        {pts.map((p) => <circle key={p.t.generatedAt} cx={p.x} cy={p.y} r={p === last ? 3.5 : 2.5} style={st(`fill:${p === last ? GREEN : "oklch(0.995 0.002 85)"};stroke:${GREEN};stroke-width:1.5`)} />)}
      </svg>
      <div style={st(`display:flex;justify-content:space-between;${MONO_MUTED}`)}>
        <span>{formatDay(trend[0]?.generatedAt)}</span>
        <span>{last ? `${last.t.cited}/${last.t.checks}` : ""}</span>
        <span>{formatDay(last?.t.generatedAt)}</span>
      </div>
    </div>
  );
}
