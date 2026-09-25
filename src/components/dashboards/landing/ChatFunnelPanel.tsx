"use client";

import { useEffect, useState } from "react";
import { landingDateRangeParams, type LandingDateRange } from "@/lib/landing-date-range";
import type { LandingLayoutId } from "@/lib/landing-layouts";
import type { ChatSummary } from "@/lib/landing-chat-report";
import { LAYOUT_CUTOVER_LABEL } from "./LandingLayoutToggle";

/**
 * How far visitors get in the guided chat: the step funnel, whether the chat
 * opened itself or was opened with the Chat button, which path they picked at
 * the first question, and the last answer given by those who then stopped.
 */

const CARD = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
const MICRO = "font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500";

interface ChatResponse {
  all: ChatSummary;
  paid: ChatSummary;
  trackingSince: string | null;
  truncated: boolean;
  layoutEmpty?: boolean;
}

type Audience = "paid" | "all";

const NODE_LABELS: Record<string, string> = {
  welcome: "First question",
  ready_role: "Which role",
  ready_role_other: "Typed another role",
  ready_size: "Team size",
  ready_timing: "Timing",
  research_topic: "Research menu",
  role_category: "Role categories",
  booking_slot: "Picked a time",
  booking_contact: "Booking details",
  booking_complete: "Booking confirmed",
  checklist_email: "Checklist email",
  checklist_consent: "Checklist follow-up consent",
  followup_email: "Follow-up email",
  followup_context: "Follow-up question",
};

const CHOICE_LABELS: Record<string, string> = {
  ready: "Ready to build a team",
  readiness_v2: "Check if we’re ready",
  research: "Still researching",
  roles: "Understand roles",
  process: "Understand the process",
  vietnam: "Why Vietnam",
  checklist_v2: "Download the checklist",
  questions: "Book a time to ask questions",
  skills: "Skills and tools",
  seniority: "Seniority levels",
  faqs: "Common questions",
  another: "Explore another role",
  readiness: "Readiness check",
  deciding: "Still deciding",
  submit: "Submitted",
  yes: "Yes",
  no: "No",
};

/** Ids arrive from visitors' browsers: keep them to plain id characters. */
function readableId(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
  const words = clean.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Unknown";
}

export function nodeLabel(node: string): string {
  if (NODE_LABELS[node]) return NODE_LABELS[node];
  const readiness = /^readiness_v2_(\d)$/.exec(node);
  if (readiness) return `Readiness question ${readiness[1]}`;
  if (node.startsWith("role_select_")) return `Role list · ${readableId(node.slice("role_select_".length))}`;
  if (node.startsWith("role_profile_")) return `Role profile · ${readableId(node.slice("role_profile_".length))}`;
  if (node.startsWith("role_faq_")) return `Role questions · ${readableId(node.slice("role_faq_".length))}`;
  return readableId(node);
}

export function choiceLabel(choice: string): string {
  return CHOICE_LABELS[choice] ?? readableId(choice);
}

function pct(value: number | null): string {
  return value == null ? "–" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function rate(part: number, whole: number): string {
  return whole > 0 ? pct(Math.round((part / whole) * 1000) / 10) : "–";
}

export function ChatFunnelPanel({
  slug,
  range,
  layout,
}: {
  slug: string;
  range: LandingDateRange;
  /** Page layout to report on (Away only); omitted for single-layout clients. */
  layout?: LandingLayoutId;
}) {
  const [data, setData] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>("paid");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const query = new URLSearchParams({ slug });
        landingDateRangeParams(range).forEach((value, key) => query.set(key, value));
        if (layout) query.set("layout", layout);
        const res = await fetch(`/api/dashboard/landing-chat?${query}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
        setData(json as ChatResponse);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load chat data");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, range, layout]);

  const heading = (
    <h3 id="chat-funnel-heading" className="text-base font-bold text-slate-900">
      Chat: how far visitors get
    </h3>
  );

  if (error) {
    return (
      <section className={CARD} aria-labelledby="chat-funnel-heading">
        {heading}
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </section>
    );
  }
  if (!data) return null;

  const summary = data[audience];
  const byKey = Object.fromEntries(summary.funnel.map((step) => [step.key, step]));
  const opened = byKey.opened?.sessions ?? 0;

  // Step tracking started with the new layout. On the original layout only
  // the two events that existed before it can be shown.
  if (layout === "original") {
    return (
      <section className={CARD} aria-labelledby="chat-funnel-heading">
        {heading}
        <p className="mt-2 text-sm text-slate-600">
          Step-by-step chat tracking began with the new layout on {LAYOUT_CUTOVER_LABEL}. For the original
          layout, only these two figures exist.
        </p>
        <AudienceToggle audience={audience} onChange={setAudience} />
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <Figure label="Chats started" value={byKey.started?.sessions ?? 0} />
          <Figure label="Chat sign-ups (gave an email)" value={byKey.email?.sessions ?? 0} />
        </dl>
      </section>
    );
  }

  const trackingNote = data.trackingSince
    ? `Step tracking since ${new Date(data.trackingSince).toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Australia/Sydney",
      })}.`
    : "Step tracking has not recorded a chat yet.";

  return (
    <section className={CARD} aria-labelledby="chat-funnel-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        {heading}
        <p className={MICRO}>{trackingNote}</p>
      </div>
      <AudienceToggle audience={audience} onChange={setAudience} />

      {data.layoutEmpty ? (
        <p className="mt-4 text-sm text-slate-500">
          The new layout went live on {LAYOUT_CUTOVER_LABEL}, after this range ends.
        </p>
      ) : opened === 0 && (byKey.started?.sessions ?? 0) === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No chats opened in this range.</p>
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className={MICRO}>Step by step</h4>
            <ol className="mt-2 space-y-2" aria-label="Chat funnel">
              {summary.funnel.map((step) => {
                const width = opened > 0 ? Math.min(100, (step.sessions / opened) * 100) : 0;
                return (
                  <li key={step.key}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-slate-700">{step.label}</span>
                      <span className="tabular-nums text-slate-900">
                        <strong>{step.sessions.toLocaleString()}</strong>
                        {step.fromPrevious != null && (
                          <span className="ml-2 text-xs text-slate-500">{pct(step.fromPrevious)} of previous</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100" aria-hidden="true">
                      <div className="h-2 rounded-full bg-blue-600" style={{ width: `${width}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className={MICRO}>Opened by itself vs Chat button</h4>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <Figure
                  label="Opened by itself"
                  value={summary.openedBy.auto.sessions}
                  note={`${rate(summary.openedBy.auto.started, summary.openedBy.auto.sessions)} went on to start`}
                />
                <Figure
                  label="Chat button"
                  value={summary.openedBy.button.sessions}
                  note={`${rate(summary.openedBy.button.started, summary.openedBy.button.sessions)} went on to start`}
                />
              </dl>
            </div>

            <div>
              <h4 className={MICRO}>Path picked at the first question</h4>
              {summary.paths.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No paths picked yet.</p>
              ) : (
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th scope="col" className={`${MICRO} py-1 font-normal`}>Path</th>
                      <th scope="col" className={`${MICRO} py-1 text-right font-normal`}>Visitors</th>
                      <th scope="col" className={`${MICRO} py-1 text-right font-normal`}>Gave email</th>
                      <th scope="col" className={`${MICRO} py-1 text-right font-normal`}>Booked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.paths.map((path) => (
                      <tr key={path.choice} className="border-t border-slate-100">
                        <td className="py-1.5 text-slate-700">{choiceLabel(path.choice)}</td>
                        <td className="py-1.5 text-right tabular-nums">{path.sessions}</td>
                        <td className="py-1.5 text-right tabular-nums">{path.gaveEmail}</td>
                        <td className="py-1.5 text-right tabular-nums">{path.booked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <h4 className={MICRO}>Where they stopped (last answer before leaving without an email or booking)</h4>
            {summary.dropOff.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nobody has dropped off mid-chat in this range.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {summary.dropOff.map((entry) => (
                  <li key={`${entry.node}:${entry.choice ?? ""}`} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="text-slate-700">
                      {nodeLabel(entry.node)}
                      {entry.choice && <span className="text-slate-500"> · {choiceLabel(entry.choice)}</span>}
                    </span>
                    <span className="tabular-nums text-slate-900">
                      {entry.sessions} <span className="text-xs text-slate-500">({pct(entry.share)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {data.truncated && (
        <p className="mt-4 text-xs text-slate-500" role="status">
          Showing the most recent chat activity only; older events in this range are not included.
        </p>
      )}
    </section>
  );
}

function AudienceToggle({ audience, onChange }: { audience: Audience; onChange: (next: Audience) => void }) {
  const options: { id: Audience; label: string }[] = [
    { id: "paid", label: "Google Ads visitors" },
    { id: "all", label: "All visitors" },
  ];
  return (
    <div role="group" aria-label="Visitors" className="mt-3 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === audience}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            option.id === audience ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value.toLocaleString()}</dd>
      {note && <dd className="text-xs text-slate-500">{note}</dd>}
    </div>
  );
}
